let makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, useMultiFileAuthState, downloadMediaMessage, generateWAMessageFromContent, proto;

try {
  const baileys = require('@whiskeysockets/baileys');
  makeWASocket = baileys.default;
  DisconnectReason = baileys.DisconnectReason;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
  makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  downloadMediaMessage = baileys.downloadMediaMessage;
  generateWAMessageFromContent = baileys.generateWAMessageFromContent;
  proto = baileys.proto;
} catch (error) {
  console.error('ERRORE CRITICO: @whiskeysockets/baileys non trovato!');
  console.error('Esegui: cd ' + __dirname + '/.. && npm install');
  console.error('Errore:', error.message);
  process.exit(1);
}

let Boom;
try {
  Boom = require('@hapi/boom');
} catch (error) {
  console.error('ERRORE CRITICO: @hapi/boom non trovato!');
  console.error('Esegui: cd ' + __dirname + '/.. && npm install');
  process.exit(1);
}

let pino;
try {
  pino = require('pino');
} catch (error) {
  console.error('ERRORE CRITICO: pino non trovato!');
  console.error('Esegui: cd ' + __dirname + '/.. && npm install');
  process.exit(1);
}
let qrcode;
try {
  qrcode = require('qrcode-terminal');
} catch (error) {
  qrcode = null;
}

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
const { createBankService } = require('./bank-service');
const { createFutService } = require('./fut-service');
const { createBotToggleService } = require('./bot-toggle-service');
const { createAiToggleService } = require('./ai-toggle-service');
const { createGamesToggleService } = require('./games-toggle-service');
const { createSilenceService } = require('./silence-service');
const { createGreetService } = require('./greet-service');
const { createAntighostService } = require('./antighost-service');
const { createOsintService } = require('./osint-service');
const { createMarketService } = require('./market-service');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

const LINK_REGEX = /((https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+|t\.me\/\S+|discord\.gg\/\S+)/i;
const MAX_ANTIGHOST_CACHE = 800;
const antighostMessageStore = new Map();

const rememberAntighostMessage = (msg) => {
  if (!msg?.message || msg.message.protocolMessage) {
    return;
  }
  const remoteJid = normalizeJid(msg.key?.remoteJid);
  if (!remoteJid || !remoteJid.endsWith('@g.us')) {
    return;
  }
  const messageId = msg.key?.id;
  if (!messageId) {
    return;
  }
  antighostMessageStore.set(messageId, {
    remoteJid,
    message: msg
  });
  if (antighostMessageStore.size > MAX_ANTIGHOST_CACHE) {
    const oldest = antighostMessageStore.keys().next().value;
    if (oldest) {
      antighostMessageStore.delete(oldest);
    }
  }
};

const handleAntighostReplay = async ({
  remoteJid,
  revokedKey,
  antighostService,
  sock,
  contactCache,
  groupMetadataCache,
  logger
}) => {
  const normalizedGroup = normalizeJid(remoteJid);
  if (!normalizedGroup?.endsWith('@g.us')) {
    return;
  }
  if (!revokedKey?.id || !antighostService) {
    return;
  }
  if (!(await antighostService.isEnabled(normalizedGroup))) {
    return;
  }
  const stored = antighostMessageStore.get(revokedKey.id);
  if (!stored || normalizeJid(stored.remoteJid) !== normalizedGroup) {
    return;
  }
  antighostMessageStore.delete(revokedKey.id);
  const messageNode = stored.message?.message;
  if (!messageNode) {
    return;
  }
  const authorJid =
    normalizeJid(
      stored.message?.key?.participant ||
        stored.message?.participant ||
        stored.message?.key?.remoteJid
    ) || 'utente sconosciuto';
  const groupMetadata = groupMetadataCache.get(normalizedGroup);
  const authorLabel =
    contactCache.getDisplayName(authorJid, {
      groupMetadata,
      hint: stored.message?.pushName
    }) || authorJid;
  try {
    await sock.sendMessage(normalizedGroup, {
      text: `♻️ Messaggio eliminato da ${authorLabel}`,
      mentions: authorJid ? [authorJid] : undefined
    });
    await sock.relayMessage(normalizedGroup, messageNode, {
      messageId: `${revokedKey.id}-ghost`
    });
  } catch (error) {
    logger?.warn({ err: error, remoteJid: normalizedGroup }, 'Impossibile ripubblicare il messaggio eliminato');
  }
};

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

    if (process.env.CALL_DEBUG) {
      try {
        console.log('CALL_DEBUG registerCall ->', JSON.stringify({ groupJid, id: info.id, from: info.from || info.creator || info.chatId, status }));
      } catch (e) {
        console.log('CALL_DEBUG registerCall (non-serializable info)');
      }
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
      if (process.env.CALL_DEBUG) console.log('CALL_DEBUG parseCallNode -> node has no content', JSON.stringify(node));
      return null;
    }

    for (const child of node.content) {
      const attrs = child?.attrs;
      if (!attrs?.['call-id']) {
        continue;
      }

      const parsed = {
        id: attrs['call-id'],
        from: attrs.from || attrs['call-creator'] || node.attrs?.from,
        groupJid: attrs['group-jid'] || node.attrs?.from,
        chatId: node.attrs?.from,
        status: child.tag || node.attrs?.type || ''
      };

      if (process.env.CALL_DEBUG) console.log('CALL_DEBUG parseCallNode -> parsed', JSON.stringify(parsed));

      return parsed;
    }

    if (process.env.CALL_DEBUG) console.log('CALL_DEBUG parseCallNode -> no call-id found in children', JSON.stringify(node));
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
    gamesToggleService,
    silenceService,
    greetService,
    antighostService,
    bankService,
    marketService,
    futService,
    osintService
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

  const sendBotPayload = async (remoteJid, payload, options) => {
    if (payload?.buttonsMessage) {
      const fullMessage = await generateWAMessageFromContent(remoteJid, { buttonsMessage: payload.buttonsMessage }, options || {});
      await sock.relayMessage(remoteJid, fullMessage.message, { messageId: fullMessage.key.id });
      return fullMessage;
    }
    return sock.sendMessage(remoteJid, payload, options);
  };

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
    gamesToggleService,
    silenceService,
    greetService,
    antighostService,
    bankService,
    marketService,
    futService,
    osintService
  });
  const groupMetadataCache = new Map();
  const trackedBotMessageIds = new Set();
  const MAX_TRACKED_MESSAGES = 200;
  let botJid = sock.user?.id || null;

  const formatBankAmount = (value) => {
    if (bankService?.formatCurrency) {
      return bankService.formatCurrency(value);
    }
    const safe = Math.floor(Number(value) || 0);
    return `฿${safe.toLocaleString('it-IT')}`;
  };

  const formatPrice = (price) => {
    if (price >= 1000000000) {
      return `฿${(price / 1000000000).toFixed(1)}B`;
    } else if (price >= 1000000) {
      return `฿${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `฿${(price / 1000).toFixed(1)}K`;
    } else {
      return `฿${price.toFixed(2)}`;
    }
  };

  const formatChange = (changePercent) => {
    const sign = changePercent >= 0 ? '+' : '';
    const color = changePercent >= 0 ? '🟢' : '🔴';
    return `${color} ${sign}${changePercent.toFixed(2)}%`;
  };

  const announceFutResult = async (groupId, match) => {
    if (!match?.result) {
      return;
    }
    const { result } = match;
    const lines = [
      '--- ⚽​ Bagley FUT ⚽​ ---',
      `\n🤯 Match concluso:\n${match.homeTeam.name} ${result.homeGoals}-${result.awayGoals} ${match.awayTeam.name}`
    ];
    const outcomeLabel =
      result.outcome === 'HOME'
        ? `\nℹ️ Esito: Vittoria ​🅰️​${match.homeTeam.name}`
        : result.outcome === 'AWAY'
        ? `ℹ️ Esito: Vittoria 🅱️​​${match.awayTeam.name}`
        : 'ℹ️ Esito: Pareggio';
    lines.push(outcomeLabel);

    const bets = Array.isArray(match.bets) ? match.bets : [];
    const winners = bets.filter((bet) => bet.result?.won);
    const mentions = new Set();

    if (bets.length === 0) {
      lines.push('', '⚠️ Nessuna scommessa piazzata per questo match.');
    } else if (!winners.length) {
      lines.push('', '⚠️ Nessun vincitore stavolta. Ritenta col prossimo match!');
    } else {
      lines.push('', '🏆 Vincitori:');
      for (const bet of winners) {
        const name =
          contactCache?.getDisplayName(bet.bettor) ||
          contactCache?.getDisplayName(`${bet.bettor.split('@')[0]}@s.whatsapp.net`) ||
          bet.bettor.split('@')[0];
        mentions.add(bet.bettor);
        const selectionLabel = Array.isArray(bet.legs) && bet.legs.length
          ? bet.legs.map((leg) => leg.label).join(' + ')
          : bet.label;
        lines.push(
          `- ${name}: ${formatBankAmount(bet.result.payout)} (puntata ${formatBankAmount(
            bet.amount
          )} su ${selectionLabel})`
        );
      }
    }

    try {
      await sock.sendMessage(groupId, { text: lines.join('\n'), mentions: [...mentions] });
    } catch (error) {
      logger?.warn({ err: error, groupId }, 'Impossibile inviare il risultato FUT');
    }
  };

  if (futService) {
    const futTick = async () => {
      const groupIds = typeof futService.listGroupIds === 'function' ? futService.listGroupIds() : [];
      const now = Date.now();
      for (const groupId of groupIds) {
        try {
          const outcome = await futService.processGroupMatches(groupId);
          if (outcome?.match) {
            await announceFutResult(groupId, outcome.match);
          }
          const events = await futService.consumeTimelineEvents(groupId, now);
          if (events?.length) {
            for (const event of events) {
              await sock
                .sendMessage(groupId, { text: event.message })
                .catch((error) =>
                  logger?.warn({ err: error, groupId }, 'Impossibile inviare update FUT')
                );
            }
          }
        } catch (error) {
          logger?.warn({ err: error, groupId }, 'Errore durante il ciclo FUT');
        }
      }
    };

    setInterval(() => {
      futTick().catch((error) => logger?.warn({ err: error }, 'Errore nel ciclo di aggiornamento FUT'));
    }, 5000);
  }

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
      if (qrcode) {
        qrcode.generate(qr, { small: true });
      } else {
        logger.warn('qrcode-terminal non installato: impossibile mostrare il QR in console');
      }
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

  sock.ev.on('group-participants.update', async (update) => {
    invalidateMetadata(update.id);
    try {
      const groupId = normalizeJid(update?.id);
      if (!groupId?.endsWith('@g.us')) {
        return;
      }
      if (!greetService || !(await greetService.isEnabled(groupId))) {
        return;
      }
      const participants = Array.isArray(update?.participants) ? update.participants : [];
      if (!participants.length) {
        return;
      }
      const action = (update?.action || '').toLowerCase();
      if (action !== 'add' && action !== 'remove') {
        return;
      }
      for (const participant of participants) {
        const jid = normalizeJid(participant);
        if (!jid) {
          continue;
        }
        const bare = jid.split('@')[0];
        let metadata = groupMetadataCache.get(groupId);
        if (!metadata) {
          try {
            metadata = await sock.groupMetadata(groupId);
            groupMetadataCache.set(groupId, metadata);
          } catch (error) {
            logger?.warn({ err: error, groupId }, 'Impossibile ottenere i metadati del gruppo per greet');
          }
        }
        const groupName = metadata?.subject || groupId;
        const text =
          action === 'add'
            ? `@${bare} benvenuto in ${groupName} comportati bene altrimenti ti scopo il culo okay.`
            : `Salutate @${bare} che ha deciso di abbandonare questa topaia.`;
        await sock.sendMessage(groupId, { text, mentions: [jid] });
      }
    } catch (error) {
      logger?.warn({ err: error, update }, 'Impossibile inviare il messaggio greet');
    }
  });
  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      invalidateMetadata(update.id);
    }
  });

  sock.ev.on('call', (callUpdates) => {
    if (process.env.CALL_DEBUG) console.log('CALL_DEBUG EVENT sock.ev.on("call"): ', JSON.stringify(callUpdates));
    callTracker.trackCallUpdates(callUpdates);
  });

  sock.ev.on('CB:call', (node) => {
    if (!node) {
      return;
    }
    if (process.env.CALL_DEBUG) console.log('CALL_DEBUG EVENT sock.ev.on("CB:call"): ', JSON.stringify(node));
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
      if (process.env.CALL_DEBUG) {
        try {
          const excerpt = JSON.stringify({ key: msg.key, messageType: Object.keys(msg.message || {})[0] || null });
          console.log('CALL_DEBUG messages.upsert ->', excerpt);
        } catch (e) {
          console.log('CALL_DEBUG messages.upsert -> (could not serialize message)');
        }
      }
      try {
        if (!msg.message) {
          continue;
        }

        const remoteJid = msg.key?.remoteJid;
        const normalizedRemote = normalizeJid(remoteJid);
        const protocolMessage = msg.message?.protocolMessage;
        if (
          protocolMessage &&
          protocolMessage.type === proto.Message.ProtocolMessage.Type.REVOKE &&
          normalizedRemote?.endsWith('@g.us')
        ) {
          const revokedKey = protocolMessage.key || msg.key;
          await handleAntighostReplay({
            remoteJid: normalizedRemote,
            revokedKey,
            antighostService,
            sock,
            contactCache,
            groupMetadataCache,
            logger
          });
          continue;
        }

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
        rememberAntighostMessage(msg);

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
        const restrictionImmune = permissionLevel >= PermissionLevel.ADMIN;
        const baseContext = {
          text,
          message: msg,
          remoteJid,
          senderJid,
          permissionLevel,
          restrictionImmune,
          groupMetadata,
          botJid: botJid || sock.user?.id,
          contactCache,
          bankService
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
          blacklistService.isBlacklisted(normalizedSender) &&
          !restrictionImmune
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

        if (remoteJid.endsWith('@g.us') && muteService && !restrictionImmune) {
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
          (await antibotService.isEnabled(remoteJid)) &&
          !restrictionImmune
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
          !restrictionImmune
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
          (await antilinkService.isEnabled(remoteJid)) &&
          !restrictionImmune
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

        if (bankService && normalizedSender) {
          try {
            await bankService.settleAccount(normalizedSender);
          } catch (error) {
            logger?.warn({ err: error, senderJid }, 'Impossibile aggiornare l\'account BagleyBank');
          }
        }

        // Gestione risposte ai messaggi di mercato
        const replyTriggered = isReplyToBot(msg, botJid || sock.user?.id, trackedBotMessageIds);

        // Gestione !buy e !sell [quantità] in risposta a scheda market
        // Supporta: !buy, !buy 5, !sell, !sell 3
        let marketReplyHandled = false;
        if (replyTriggered && text && /^!(buy|sell)(?:\s+(\d+))?$/.test(text)) {
          const match = text.match(/^!(buy|sell)(?:\s+(\d+))?$/);
          if (match) {
            const command = match[1];
            const quantity = match[2] ? parseInt(match[2]) : 1; // Default a 1 se non specificato
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
              const quotedText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || quotedMessage.imageMessage?.caption || '';
              const nameMatch = quotedText.match(/^📊 (.+)$/m);
              if (nameMatch) {
                const itemName = nameMatch[1].trim();
                const item = marketService.findItemByName(itemName);
                if (item) {
                  baseContext.parsed = { command, args: [item.categoryId.toString(), item.name, quantity.toString()] };
                  marketReplyHandled = true;
                } else {
                  // Oggetto non trovato nel mercato - mostra errore
                  const errorMsg = await sock.sendMessage(remoteJid, { text: `❌ Oggetto "${itemName}" non trovato nel mercato.` }, { quoted: msg });
                  trackBotMessage(errorMsg);
                  marketReplyHandled = true;
                  continue;
                }
              }
            }
          }
        }

        // Se la risposta market è stata gestita, non processare altri comandi
        if (marketReplyHandled) {
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
              const shouldQuoteOriginal = Boolean(commandResponse.replyToMessage);
              for (const payload of payloads) {
                const options = shouldQuoteOriginal ? { quoted: msg } : undefined;
                const sentMessage = await sendBotPayload(remoteJid, payload, options);
                trackBotMessage(sentMessage);
              }
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
            const shouldQuoteOriginal = Boolean(commandResponse.replyToMessage);
            for (const payload of payloads) {
              const options = shouldQuoteOriginal ? { quoted: msg } : undefined;
              const sentMessage = await sendBotPayload(remoteJid, payload, options);
              trackBotMessage(sentMessage);
            }
            continue;
          }
        }

        // Gestione risposte ai messaggi di mercato
        if (replyTriggered && marketService && text && /^\d+$/.test(text.trim())) {
          const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (quotedMessage) {
            const quotedText = quotedMessage.conversation ||
                              quotedMessage.extendedTextMessage?.text ||
                              quotedMessage.imageMessage?.caption || '';

            const itemNumber = parseInt(text.trim()) - 1; // 0-based
            let items = [];

            // 1. risposta alla lista di sottocategorie
            if (quotedText.includes('Sottocategorie di')) {
              const catMatch = quotedText.match(/Sottocategorie di (.+?):/);
              if (catMatch) {
                const categoryName = catMatch[1];
                const categories = marketService.getCategories();
                const categoryId = parseInt(Object.keys(categories).find(id =>
                  categories[id].name === categoryName
                ));
                if (categoryId) {
                  const subids = Object.keys(marketService.getSubcategories(categoryId))
                    .sort((a, b) => parseInt(a) - parseInt(b));
                  const subId = subids[itemNumber];
                  if (subId) {
                    items = marketService.getSubcategoryItems(parseInt(categoryId), parseInt(subId), 10);
                    if (items.length) {
                      const lines = [
                        `📂 ${marketService.getCategoryName(categoryId)} - ${marketService.getSubcategoryName(categoryId, subId)}:`,
                        '',
                        ...items.map((itm, idx) =>
                          `${idx + 1}. ${itm.name}\n   ${formatPrice(itm.currentPrice)} ${formatChange(itm.changePercent)}`
                        ),
                        '',
                        '💡 Rispondi con il numero per dettagli / trading'
                      ];
                      const response = { text: lines.join('\n') };
                      const sent = await sock.sendMessage(remoteJid, response, { quoted: msg });
                      trackBotMessage(sent);
                      continue;
                    }
                  }
                }
              }
            }

            // 2. estrazione generica header (categoria o subcategoria)
            const headerMatch = quotedText.match(/📂 ([^-:]+)(?: - ([^:]+))?:/);
            if (headerMatch) {
              const catName = headerMatch[1].trim();
              const subName = headerMatch[2] ? headerMatch[2].trim() : null;
              const categories = marketService.getCategories();
              const categoryId = parseInt(Object.keys(categories).find(id =>
                categories[id].name === catName
              ));
              if (categoryId) {
                if (subName) {
                  // item listing per sottocategoria
                  const subids = Object.keys(marketService.getSubcategories(categoryId));
                  const subId = subids.find(sid => marketService.getSubcategoryName(categoryId, sid) === subName);
                  if (subId) {
                    items = marketService.getSubcategoryItems(parseInt(categoryId), parseInt(subId), 10);
                  }
                } else {
                  // item listing per categoria
                  items = marketService.getCategoryItems(parseInt(categoryId), 10);
                }
              }
            }

            // 3. trending / fallback
            if (!items.length && (quotedText.includes('📈 Bagley Market') || quotedText.includes('Oggetti di tendenza'))) {
              if (quotedText.includes('Oggetti di tendenza')) {
                items = marketService.getTrendingItems(10);
              } else {
                const categoryMatch = quotedText.match(/📂 (.+?):/);
                if (categoryMatch) {
                  const categoryName = categoryMatch[1];
                  const categories = marketService.getCategories();
                  const categoryId = parseInt(Object.keys(categories).find(id =>
                    categories[id].name === categoryName
                  ));
                  if (categoryId) {
                    items = marketService.getCategoryItems(parseInt(categoryId), 10);
                  }
                }
              }
            }

              if (items[itemNumber]) {
                const item = items[itemNumber];
                const itemInfo = marketService.getItemInfo(item.categoryId, item.subId, item.itemId);

                const lines = [
                  `📊 ${itemInfo.name}`,
                  '',
                  `💰 Prezzo attuale: ${formatPrice(itemInfo.currentPrice)}`,
                  `📈 Variazione: ${formatChange(itemInfo.changePercent)}`,
                  `🎯 Volatilità: ${itemInfo.volatility}`,
                  '',
                  `📝 ${itemInfo.description}`,
                  '',
                  '💡 Rispondi con !buy [quantità] per acquistare direttamente',
                  '💡 Oppure usa .buy <categoria> <oggetto> [quantità]'
                ];

                const response = {
                  text: lines.join('\n')
                };

                const sentMessage = await sock.sendMessage(remoteJid, response, { quoted: msg });
                trackBotMessage(sentMessage);
                continue;
              }
            }
          }

        const lowerText = (text || '').toLowerCase();
        const nameTriggered = lowerText.includes('bagley');

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
    const gamesToggleService = await createGamesToggleService({ logger });
    const silenceService = await createSilenceService({ logger });
    const greetService = await createGreetService({ logger });
    const antighostService = await createAntighostService({ logger });
    const bankService = await createBankService({ logger });
    const marketService = await createMarketService({ logger, bankService });
    const futService = await createFutService({ logger, bankService });
    const osintService = await createOsintService({ logger });

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
      gamesToggleService,
      silenceService,
      greetService,
      antighostService,
      bankService,
      marketService,
      futService,
      osintService
    });
  } catch (error) {
    logger.error({ err: error }, 'Errore fatale in fase di avvio');
    process.exitCode = 1;
  }
})();

