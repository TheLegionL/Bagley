const { normalizeJid } = require('./permissions');

const BOT_LIKE_PATTERNS = [
  /(?:auto[-\s]?reply|automatic message|bot reply|message sent via)/i,
  /^(?:hello|hi|dear) sir/i,
  /^(?:press|type)\s+[0-9#*]/i,
  /(?:do not reply|noreply)/i,
  /(?:click .*link|visit our website)/i
];
const SHORT_CODE_REGEX = /^[a-z0-9#*\/]{1,6}$/i;

function detectBotLikeSample(text = '') {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (BOT_LIKE_PATTERNS.some((regex) => regex.test(trimmed))) {
    return true;
  }
  if (SHORT_CODE_REGEX.test(trimmed)) {
    return true;
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 3 && /\d/.test(trimmed)) {
    return true;
  }
  return false;
}

function createRadarService({ logger } = {}) {
  const statsMap = new Map();
  const MAX_SAMPLES = 5;

  const getOrCreate = (jid) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return null;
    }
    let entry = statsMap.get(normalized);
    if (!entry) {
      entry = {
        totalMessages: 0,
        botLikeMessages: 0,
        groups: new Set(),
        samples: [],
        lastSeen: 0,
        lastBotLike: 0,
        perGroup: new Map()
      };
      statsMap.set(normalized, entry);
    }
    return entry;
  };

  const recordMessage = ({ senderJid, remoteJid, text, messageType }) => {
    const normalizedRemote = normalizeJid(remoteJid);
    if (!normalizedRemote || !normalizedRemote.endsWith('@g.us')) {
      return;
    }
    const entry = getOrCreate(senderJid);
    if (!entry) {
      return;
    }

    entry.totalMessages += 1;
    entry.lastSeen = Date.now();
    entry.groups.add(normalizedRemote);

    const sampleText = typeof text === 'string' ? text.trim() : '';
    if (sampleText) {
      entry.samples.unshift(sampleText.slice(0, 160));
      if (entry.samples.length > MAX_SAMPLES) {
        entry.samples.length = MAX_SAMPLES;
      }
    }

    const groupStats = entry.perGroup.get(normalizedRemote) || {
      total: 0,
      botLike: 0,
      lastSeen: 0,
      lastBotLike: 0
    };
    groupStats.total += 1;
    groupStats.lastSeen = entry.lastSeen;

    const isBotLike = detectBotLikeSample(sampleText);
    if (isBotLike) {
      entry.botLikeMessages += 1;
      entry.lastBotLike = entry.lastSeen;
      groupStats.botLike += 1;
      groupStats.lastBotLike = entry.lastSeen;
    }

    entry.perGroup.set(normalizedRemote, groupStats);
  };

  const getStats = (jid) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return null;
    }
    const entry = statsMap.get(normalized);
    if (!entry) {
      return null;
    }
    const perGroup = [];
    for (const [groupJid, info] of entry.perGroup.entries()) {
      perGroup.push({
        groupJid,
        total: info.total,
        botLike: info.botLike,
        lastSeen: info.lastSeen,
        lastBotLike: info.lastBotLike
      });
    }

    return {
      totalMessages: entry.totalMessages,
      botLikeMessages: entry.botLikeMessages,
      groups: Array.from(entry.groups || []),
      samples: Array.from(entry.samples || []),
      lastSeen: entry.lastSeen,
      lastBotLike: entry.lastBotLike,
      perGroup
    };
  };

  const evaluateSuspicion = (stats) => {
    if (!stats || !stats.totalMessages) {
      return { suspicious: false, reason: 'Nessun messaggio registrato.' };
    }

    const ratio = stats.botLikeMessages / Math.max(1, stats.totalMessages);
    const lowActivity = stats.totalMessages < 6;
    const mostlyBot = ratio >= 0.7;
    const repeatedSamples =
      Array.isArray(stats.samples) &&
      stats.samples.length >= 3 &&
      new Set(stats.samples.map((sample) => sample.toLowerCase())).size === 1;

    const suspicious =
      mostlyBot ||
      (lowActivity && stats.botLikeMessages >= 2) ||
      (lowActivity && repeatedSamples);

    let reason = 'Nessun comportamento sospetto rilevato.';
    if (mostlyBot) {
      reason = 'Oltre il 70% dei messaggi raccolti sembra automatico.';
    } else if (lowActivity && stats.botLikeMessages >= 2) {
      reason = 'Attività minima e prevalentemente composta da messaggi automatici.';
    } else if (repeatedSamples) {
      reason = 'Messaggi pressoché identici inviati ripetutamente.';
    }

    return {
      suspicious,
      reason,
      ratio,
      lowActivity,
      repeatedSamples
    };
  };

  return {
    recordMessage,
    getStats,
    evaluateSuspicion
  };
}

module.exports = {
  createRadarService
};
