const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const Boom = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const { createAIService } = require('./ai');
const { createAntilinkService } = require('./antilink-service');
const { createAntispamService } = require('./antispam-service');
const { createAntinukeService } = require('./antinuke-service');
const { createMuteService } = require('./mute-service');
const { createLastfmService } = require('./lastfm-service');
const { createCommandRegistry } = require('./commands');
const { loadOpenAIKey } = require('./config');
const { createPermissionService, normalizeJid, PermissionLevel } = require('./permissions');
const { createContactCache } = require('./contact-cache');
const { extractMessageText, isGroupMessage, isReplyToBot } = require('./utils');
const { createRadarService } = require('./radar-service');
const { createAntibotService } = require('./antibot-service');
const { createBlacklistService } = require('./blacklist-service');
const { createBotToggleService } = require('./bot-toggle-service');
const { createAiToggleService } = require('./ai-toggle-service');
const { createSilenceService } = require('./silence-service');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

const LINK_REGEX = /((https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+|t\.me\/\S+|discord\.gg\/\S+)/i;

function createCallTracker() {
  const END_STATUSES = new Set(['reject', 'timeout', 'terminate', 'hangup', 'stop', 'ended', 'leave']);
  const activeCalls = new Map();

  const normalizeGroupId = (jid) => {
    const normalized = normalizeJid(jid);
    return normalized && normalized.endsWith('@g.us') ? normalized : null;
  };

  const registerCall = (info = {}) => {
    if (!info.id) {
      return;
    }

    const groupJid = normalizeGroupId(info.groupJid || info.chatId);
    if (!groupJid) {
      return;
    }

    const status = String(info.status || '').toLowerCase();
    if (END_STATUSES.has(status)) {
      activeCalls.delete(groupJid);
      return;
    }

    activeCalls.set(groupJid, {
      id: info.id,
      from: normalizeJid(info.from || info.creator || info.chatId),
      groupJid,
      chatId: info.chatId,
      status,
      timestamp: Date.now()
    });
  };

  const parseCallNode = (node) => {
    if (!node?.content?.length) {
      return null;
    }

    for (const child of node.content) {
      const attrs = child?.attrs;
      if (!attrs?.['call-id']) {
        continue;
      }

      return {
        id: attrs['call-id'],
        from: attrs.from || attrs['call-creator'] || node.attrs?.from,
        groupJid: attrs['group-jid'] || node.attrs?.from,
        chatId: node.attrs?.from,
        status: child.tag || node.attrs?.type || ''
      };
    }

    return null;
  };

  return {
    trackCallUpdates(callUpdates = []) {
      for (const call of callUpdates) {
        registerCall(call);
      }
    },
    trackCallNodes(nodes = []) {
      const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
      for (const node of list) {
        const parsed = parseCallNode(node);
        if (parsed) {
          registerCall(parsed);
        }
      }
    },
    get(groupJid) {
      return activeCalls.get(normalizeGroupId(groupJid));
    },
    clear(groupJid) {
      const normalized = normalizeGroupId(groupJid);
      if (normalized) {
        activeCalls.delete(normalized);
      }
    }
  };
}

const SPAM_WINDOW_MS = 6000;
const SPAM_THRESHOLD = 5;
const SPAM_COOLDOWN_MS = 20000;

async function startBot(services) {
  const {
    permissionService,
    aiService,
    antilinkService,
    antispamService,
    antinukeService,
    muteService,
    lastfmService,
    radarService,
    antibotService,
    blacklistService,
    botToggleService,
    aiToggleService,
    silenceService
  } = services;
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_multi');
  const { version } = await fetchLatestBaileysVersion();
  const pairingCodePhone = process.env.PAIRING_CODE_NUMBER
    ? process.env.PAIRING_CODE_NUMBER.replace(/\D/g, '')
    : null;
  let pairingCodeShown = false;

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: ['Bagley', 'Chrome', '1.0.0'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    }
  });

  const contactCache = createContactCache({ sock, logger });
  const callTracker = createCallTracker();

  const blacklistEnforcer = {
    async removeFromGroup(groupJid, targets) {
      const normalizedGroup = normalizeJid(groupJid);
      const list = Array.isArray(targets) ? targets.map((jid) => normalizeJid(jid)).filter(Boolean) : [];
      if (!normalizedGroup || !normalizedGroup.endsWith('@g.us') || !list.length) {
        return { removed: 0, groupsChecked: normalizedGroup ? 1 : 0 };
      }
      try {
        await sock.groupParticipantsUpdate(normalizedGroup, list, 'remove');
        for (const jid of list) {
          await blacklistService?.recordRemoval?.(jid, normalizedGroup);
        }
        return { removed: list.length, groupsChecked: 1 };
      } catch (error) {
        logger.warn({ err: error, groupJid: normalizedGroup }, 'Impossibile rimuovere membri per blacklist');
        return { removed: 0, groupsChecked: 1 };
      }
    },
    async removeFromAllGroups(targetJid) {
      const normalizedTarget = normalizeJid(targetJid);
      if (!normalizedTarget || typeof sock.groupFetchAllParticipating !== 'function') {
        return null;
      }

      const summary = { groupsChecked: 0, removed: 0 };
      let groups = [];
      try {
        const participating = await sock.groupFetchAllParticipating();
        groups = Array.isArray(participating) ? participating : Object.values(participating || {});
      } catch (error) {
        logger.warn({ err: error }, 'Impossibile recuperare i gruppi per la blacklist');
        return null;
      }

      for (const group of groups) {
        const groupId = normalizeJid(group.id || group.jid);
        if (!groupId) {
          continue;
        }
        summary.groupsChecked += 1;

        let shouldRemove = true;
        if (Array.isArray(group.participants)) {
          shouldRemove = group.participants.some((participant) => normalizeJid(participant.id) === normalizedTarget);
        }

        if (!shouldRemove) {
          continue;
        }

        try {
          await sock.groupParticipantsUpdate(groupId, [normalizedTarget], 'remove');
          summary.removed += 1;
          await blacklistService?.recordRemoval?.(normalizedTarget, groupId);
        } catch (error) {
          logger.warn({ err: error, groupId, target: normalizedTarget }, 'Impossibile rimuovere l\'utente dalla blacklist');
        }
      }

      return summary;
    }
  };

  const commandRegistry = createCommandRegistry({
    permissionService,
    sock,
    logger,
    contactCache,
    botLid: state?.creds?.me?.lid,
    aiService,
    antilinkService,
    antispamService,
    antinukeService,
    muteService,
    callManager: callTracker,
    downloadMediaMessage,
    lastfmService,
    radarService,
    antibotService,
    blacklistService,
    blacklistEnforcer,
    botToggleService,
    aiToggleService,
    silenceService
  });
  const groupMetadataCache = new Map();
  const trackedBotMessageIds = new Set();
  const MAX_TRACKED_MESSAGES = 200;
  let botJid = sock.user?.id || null;

  const spamTracker = new Map();
  const spamCooldown = new Map();

  const getSpamBucket = (groupId, senderId) => {
    let groupBucket = spamTracker.get(groupId);
    if (!groupBucket) {
      groupBucket = new Map();
      spamTracker.set(groupId, groupBucket);
    }

    let senderBucket = groupBucket.get(senderId);
    if (!senderBucket) {
      senderBucket = [];
      groupBucket.set(senderId, senderBucket);
    }

    return senderBucket;
  };

  const recordSpamEntry = (groupId, senderId, message) => {
    if (!message?.key) {
      return null;
    }

    const bucket = getSpamBucket(groupId, senderId);
    const now = Date.now();
    bucket.push({
      timestamp: now,
      key: message.key
    });

    const recent = bucket.filter((entry) => now - entry.timestamp <= SPAM_WINDOW_MS);
    const groupBucket = spamTracker.get(groupId);
    if (recent.length) {
      groupBucket.set(senderId, recent);
    } else {
      groupBucket.delete(senderId);
    }

    if (!recent.length) {
      return null;
    }

    if (recent.length >= SPAM_THRESHOLD) {
      groupBucket.delete(senderId);
      return recent;
    }

    return null;
  };

  const canTriggerSpamAction = (groupId) => {
    const now = Date.now();
    const last = spamCooldown.get(groupId);
    if (last && now - last < SPAM_COOLDOWN_MS) {
      return false;
    }
    spamCooldown.set(groupId, now);
    return true;
  };

  const performAntispamActions = async ({ remoteJid, senderJid, entries, baseContext, originalMessage }) => {
    let chatClosed = false;
    let chatReopened = false;
    try {
      await sock.groupSettingUpdate(remoteJid, 'announcement');
      chatClosed = true;
    } catch (error) {
      logger.warn({ err: error, remoteJid }, 'Impossibile chiudere la chat durante l\'antispam');
    }

    const deletePromises = entries.map((entry) =>
      sock
        .sendMessage(remoteJid, { delete: entry.key })
        .catch((error) => logger.warn({ err: error, remoteJid }, 'Impossibile cancellare un messaggio di spam'))
    );
    await Promise.all(deletePromises);

    let warnResult = null;
    if (typeof commandRegistry.warnManager?.applyWarn === 'function') {
      try {
        warnResult = await commandRegistry.warnManager.applyWarn({
          context: baseContext,
          targetJid: senderJid,
          issuerJid: botJid || sock.user?.id,
          reason: 'Spam/Flood rilevato (antispam).'
        });
      } catch (error) {
        logger.warn({ err: error, remoteJid, senderJid }, 'Impossibile assegnare il warn antispam');
      }
    }

    const infoLines = [
      'Antispam attivato: messaggi eliminati e chat temporaneamente chiusa.',
      chatClosed
        ? 'Solo gli amministratori possono parlare finché non riaprirai la chat.'
        : 'Non ho i permessi per chiudere la chat.'
    ];

    if (warnResult?.text) {
      infoLines.push(warnResult.text);
    } else {
      infoLines.push('Warn assegnato al responsabile.');
    }

    if (chatClosed) {
      try {
        await sock.groupSettingUpdate(remoteJid, 'not_announcement');
        chatReopened = true;
      } catch (error) {
        logger.warn({ err: error, remoteJid }, 'Impossibile riaprire la chat dopo l\'antispam');
      }
    }

    if (chatReopened) {
      infoLines.push('La chat è stata riaperta a tutti. Continuate con calma.');
    } else if (chatClosed) {
      infoLines.push('Non sono riuscito a riaprire la chat automaticamente, fallo tu appena puoi.');
    }

    const mentions = warnResult?.mentions?.length ? warnResult.mentions : [senderJid];
    const payload = {
      text: infoLines.join('\n'),
      mentions
    };

    try {
      const sentMessage = await sock.sendMessage(remoteJid, payload, { quoted: originalMessage });
      trackBotMessage(sentMessage);
    } catch (error) {
      logger.warn({ err: error, remoteJid }, 'Impossibile notificare l\'azione antispam');
    }
  };

  const trackBotMessage = (sentMessage) => {
    const messageId = sentMessage?.key?.id;
    if (!messageId) {
      return;
    }

    trackedBotMessageIds.add(messageId);
    if (trackedBotMessageIds.size > MAX_TRACKED_MESSAGES) {
      const oldest = trackedBotMessageIds.values().next().value;
      if (oldest) {
        trackedBotMessageIds.delete(oldest);
      }
    }
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrcode.generate(qr, { small: true });
      if (pairingCodePhone && !pairingCodeShown && typeof sock.requestPairingCode === 'function') {
        try {
          const code = await sock.requestPairingCode(pairingCodePhone);
          pairingCodeShown = true;
          logger.info(
            { code, pairingCodePhone },
            'Pairing code generato. Inseriscilo su WhatsApp (Collega dispositivo -> Collega con codice).'
          );
          console.log(`Pairing code per ${pairingCodePhone}: ${code}`);
        } catch (error) {
          logger.warn({ err: error }, 'Impossibile generare il pairing code');
        }
      }
    }

    if (connection === 'open') {
      botJid = sock.user?.id || botJid;
      logger.info({ botJid }, 'Bagley connesso a WhatsApp');
    }

    if (connection === 'close') {
      const error = lastDisconnect?.error;
      const statusCode = Boom.isBoom(error) ? error.output.statusCode : error?.output?.statusCode || error?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn({ statusCode }, 'Connessione chiusa');

      if (shouldReconnect) {
        setTimeout(() => {
          startBot(services).catch((err) => logger.error({ err }, 'Errore durante il riavvio'));
        }, 2000);
      } else {
        logger.error('Sessione terminata. Cancella la cartella auth_info_multi per eseguire un nuovo login.');
      }
    }
  });

  const invalidateMetadata = (jid) => {
    if (jid) {
      groupMetadataCache.delete(jid);
    }
  };

  sock.ev.on('group-participants.update', (update) => invalidateMetadata(update.id));
  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      invalidateMetadata(update.id);
    }
  });

  sock.ev.on('call', (callUpdates) => {
    callTracker.trackCallUpdates(callUpdates);
  });

  sock.ev.on('CB:call', (node) => {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      callTracker.trackCallNodes(node);
    } else if (node.tag === 'call' || node.tag === 'relaylatency') {
      callTracker.trackCallNodes([node]);
    } else if (Array.isArray(node.content)) {
      callTracker.trackCallNodes(node.content);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message) {
          continue;
        }

        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid || remoteJid === 'status@broadcast') {
          continue;
        }

        if (msg.key.fromMe) {
          continue;
        }

        let text = extractMessageText(msg);
        const buttonResponse = msg.message?.buttonsResponseMessage;
        if (!text && buttonResponse?.selectedButtonId) {
          text = buttonResponse.selectedButtonId;
        }
        const senderJid = msg.key?.participant || msg.participant || remoteJid;
        const normalizedSender = normalizeJid(senderJid);
        contactCache.rememberMessage(msg);

        let groupMetadata = null;
        if (isGroupMessage(msg)) {
          groupMetadata = groupMetadataCache.get(remoteJid);
          if (!groupMetadata) {
            try {
              groupMetadata = await sock.groupMetadata(remoteJid);
              groupMetadataCache.set(remoteJid, groupMetadata);
            } catch (error) {
              logger.warn({ err: error, remoteJid }, 'Impossibile recuperare i metadata del gruppo');
            }
          }
          if (groupMetadata) {
            contactCache.rememberGroup(groupMetadata);
          }
        }

        const permissionLevel = permissionService.getPermissionLevel(senderJid, groupMetadata);
        const baseContext = {
          text,
          message: msg,
          remoteJid,
          senderJid,
          permissionLevel,
          groupMetadata,
          botJid: botJid || sock.user?.id,
          contactCache
        };

        const parsedCommand =
          text && typeof commandRegistry.parseCommand === 'function'
            ? commandRegistry.parseCommand(text)
            : null;
        if (parsedCommand) {
          baseContext.parsed = parsedCommand;
        }
        const isBagleyCommand = parsedCommand?.command === 'bagley';

        if (
          remoteJid.endsWith('@g.us') &&
          botToggleService &&
          !(await botToggleService.isEnabled(remoteJid)) &&
          !isBagleyCommand
        ) {
          continue;
        }

        if (
          remoteJid.endsWith('@g.us') &&
          blacklistService &&
          normalizedSender &&
          blacklistService.isBlacklisted(normalizedSender)
        ) {
          try {
            await blacklistEnforcer.removeFromGroup(remoteJid, [normalizedSender]);
          } catch (error) {
            logger.warn({ err: error, remoteJid, senderJid }, 'Impossibile applicare la blacklist nel gruppo');
          }
          continue;
        }

        if (radarService && remoteJid.endsWith('@g.us')) {
          try {
            radarService.recordMessage({
              senderJid,
              remoteJid,
              text,
              messageType: Object.keys(msg.message)[0]
            });
          } catch (error) {
            logger.warn({ err: error }, 'Impossibile registrare le statistiche radar');
          }
        }

        if (remoteJid.endsWith('@g.us') && muteService) {
          const muteInfo = await muteService.isMuted(remoteJid, senderJid);
          if (muteInfo) {
            try {
              await sock.sendMessage(remoteJid, { delete: msg.key });
            } catch (error) {
              logger.warn({ err: error, remoteJid }, 'Impossibile cancellare un messaggio durante il mute');
            }
            continue;
          }
        }

        if (
          groupMetadata &&
          antibotService &&
          text &&
          text.trim().startsWith('.') &&
          (await antibotService.isEnabled(remoteJid))
        ) {
          try {
            await sock.sendMessage(remoteJid, { delete: msg.key });
          } catch (error) {
            logger.warn({ err: error, remoteJid }, 'Impossibile cancellare un messaggio antibot');
          }
          continue;
        }

        if (
          groupMetadata &&
          antispamService &&
          (await antispamService.isEnabled(remoteJid)) &&
          permissionLevel <= PermissionLevel.ADMIN
        ) {
          const entries = recordSpamEntry(remoteJid, senderJid, msg);
          if (entries && canTriggerSpamAction(remoteJid)) {
            await performAntispamActions({
              remoteJid,
              senderJid,
              entries,
              baseContext,
              originalMessage: msg
            });
            continue;
          }
        }

        if (
          groupMetadata &&
          antilinkService &&
          text &&
          LINK_REGEX.test(text) &&
          (await antilinkService.isEnabled(remoteJid))
        ) {
          try {
            await sock.sendMessage(remoteJid, { delete: msg.key });
          } catch (error) {
            logger.warn({ err: error, remoteJid }, 'Impossibile cancellare il messaggio antilink');
          }

          if (typeof commandRegistry.warnManager?.applyWarn === 'function') {
            const warnResult = await commandRegistry.warnManager.applyWarn({
              context: baseContext,
              targetJid: senderJid,
              issuerJid: botJid || sock.user?.id,
              reason: 'Link vietato rilevato (antilink).'
            });

            if (warnResult?.text) {
              const payload = { text: warnResult.text, mentions: warnResult.mentions };
              const sentMessage = await sock.sendMessage(remoteJid, payload, { quoted: msg });
              trackBotMessage(sentMessage);
            }
          }

          continue;
        }

        const commandResponse = await commandRegistry.handleCommand(baseContext);

        if (commandResponse) {
          const payloads = [];
          if (Array.isArray(commandResponse.messages) && commandResponse.messages.length) {
            payloads.push(...commandResponse.messages);
          } else if (commandResponse.message) {
            payloads.push(commandResponse.message);
          } else if (commandResponse.text) {
            const { text: responseText, ...rest } = commandResponse;
            payloads.push({ text: responseText, ...rest });
          }

          if (payloads.length) {
            for (const payload of payloads) {
              const sentMessage = await sock.sendMessage(remoteJid, payload, { quoted: msg });
              trackBotMessage(sentMessage);
            }
            continue;
          }
        }

        const lowerText = (text || '').toLowerCase();
        const nameTriggered = lowerText.includes('bagley');
        const replyTriggered = isReplyToBot(msg, botJid || sock.user?.id, trackedBotMessageIds);

        if (!nameTriggered && !replyTriggered) {
          continue;
        }

        if (
          remoteJid.endsWith('@g.us') &&
          aiToggleService &&
          !(await aiToggleService.isEnabled(remoteJid))
        ) {
          continue;
        }

        if (!aiService.enabled) {
          const sentMessage = await sock.sendMessage(
            remoteJid,
            { text: 'Funzione AI non disponibile. Configura la chiave OpenAI in config/openai.json.' },
            { quoted: msg }
          );
          trackBotMessage(sentMessage);
          continue;
        }

        const chatName = groupMetadata?.subject || '';
        const authorName = msg.pushName || senderJid;
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const threadSummary =
          quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || null;

        if (!text) {
          continue;
        }

        const aiReply = await aiService.generateReply({
          messageText: text,
          authorName,
          chatName,
          threadSummary,
          chatId: remoteJid
        });

        if (aiReply) {
          const sentMessage = await sock.sendMessage(remoteJid, { text: aiReply }, { quoted: msg });
          trackBotMessage(sentMessage);
        }
      } catch (error) {
        logger.error({ err: error }, 'Errore durante la gestione del messaggio');
      }
    }
  });
}

(async () => {
  try {
    const permissionService = await createPermissionService();
    const aiKey = loadOpenAIKey();
    const aiService = createAIService(aiKey, logger);
    const antilinkService = createAntilinkService({ logger });
    const antispamService = createAntispamService({ logger });
    const antinukeService = createAntinukeService({ logger });
    const muteService = createMuteService({ logger });
    const lastfmService = createLastfmService({ logger });
    const radarService = createRadarService({ logger });
    const antibotService = createAntibotService({ logger });
    const blacklistService = await createBlacklistService({ logger });
    const botToggleService = await createBotToggleService({ logger });
    const aiToggleService = await createAiToggleService({ logger });
    const silenceService = await createSilenceService({ logger });

    if (!aiService.enabled) {
      logger.warn('API key OpenAI non configurata. La funzione AI sarà disattivata finché non aggiorni config/openai.json.');
    }

    await startBot({
      permissionService,
      aiService,
      antilinkService,
      antispamService,
      antinukeService,
      muteService,
      lastfmService,
      radarService,
      antibotService,
      blacklistService,
      botToggleService,
      aiToggleService,
      silenceService
    });
  } catch (error) {
    logger.error({ err: error }, 'Errore fatale in fase di avvio');
    process.exitCode = 1;
  }
})();
