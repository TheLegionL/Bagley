const { normalizeJid } = require('./permissions');

function extractMessageText(msg) {
  const messageContent = msg.message || {};
  const text =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentMessage?.caption ||
    '';

  return typeof text === 'string' ? text.trim() : '';
}

function extractContextInfo(msg) {
  const messageContent = msg.message || {};
  for (const value of Object.values(messageContent)) {
    if (value?.contextInfo) {
      return value.contextInfo;
    }
  }
  return null;
}

function getMentionedJids(msg) {
  const contextInfo = extractContextInfo(msg);
  const mentioned = contextInfo?.mentionedJid;
  return Array.isArray(mentioned) ? mentioned : [];
}

function isGroupMessage(msg) {
  return Boolean(msg.key?.remoteJid && msg.key.remoteJid.endsWith('@g.us'));
}

function createBotJidSet(botJid) {
  const candidates = new Set();

  const push = (jid) => {
    if (!jid) {
      return;
    }

    const trimmed = String(jid).trim();
    if (!trimmed) {
      return;
    }

    candidates.add(trimmed);

    const normalized = normalizeJid(trimmed);
    if (normalized) {
      candidates.add(normalized);
      const withoutDevice = normalized.split(':')[0];
      if (withoutDevice) {
        candidates.add(withoutDevice);
      }
    } else {
      const withoutDevice = trimmed.split(':')[0];
      if (withoutDevice) {
        candidates.add(withoutDevice);
      }
    }
  };

  push(botJid);
  return candidates;
}

function jidMatchesCandidates(jid, candidates) {
  if (!jid || !candidates?.size) {
    return false;
  }

  const normalized = normalizeJid(jid);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeJid(candidate);
    if (normalized && normalizedCandidate && normalized === normalizedCandidate) {
      return true;
    }

    const bareCandidate = normalizedCandidate?.split(':')[0] || candidate?.split(':')[0];
    const bareJid = normalized?.split(':')[0] || String(jid).split(':')[0];
    if (bareCandidate && bareJid && bareCandidate === bareJid) {
      return true;
    }
  }

  return false;
}

function isReplyToBot(msg, botJid, botMessageIds = new Set()) {
  if (!botJid) {
    return false;
  }

  const candidates = createBotJidSet(botJid);
  const contextInfo = extractContextInfo(msg);

  if (!contextInfo) {
    return false;
  }

  if (jidMatchesCandidates(contextInfo.participant, candidates)) {
    return true;
  }

  if (Array.isArray(contextInfo.mentionedJid) && contextInfo.mentionedJid.some((jid) => jidMatchesCandidates(jid, candidates))) {
    return true;
  }

  if (contextInfo.remoteJid && jidMatchesCandidates(contextInfo.remoteJid, candidates)) {
    return true;
  }

  if (contextInfo.stanzaId && botMessageIds.has(contextInfo.stanzaId)) {
    return true;
  }

  if (contextInfo.quotedMessage) {
    const quotedContextInfo = extractContextInfo({ message: contextInfo.quotedMessage });
    if (quotedContextInfo && jidMatchesCandidates(quotedContextInfo.participant, candidates)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  extractMessageText,
  extractContextInfo,
  getMentionedJids,
  isGroupMessage,
  isReplyToBot
};
