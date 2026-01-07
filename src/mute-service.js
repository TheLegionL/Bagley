const path = require('node:path');
const fs = require('fs-extra');
const { normalizeJid } = require('./permissions');

const MUTE_FILE = path.join(__dirname, '..', 'config', 'mutes.json');

function createMuteService({ logger } = {}) {
  let cache = null;

  const ensureLoaded = async () => {
    if (cache) {
      return cache;
    }

    try {
      const exists = await fs.pathExists(MUTE_FILE);
      if (!exists) {
        cache = {};
        return cache;
      }

      const data = await fs.readJson(MUTE_FILE);
      cache = data && typeof data === 'object' ? data : {};
      return cache;
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile caricare il file mute');
      cache = {};
      return cache;
    }
  };

  const save = async (data) => {
    cache = data;
    try {
      await fs.outputJson(MUTE_FILE, cache, { spaces: 2 });
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare il file mute');
    }
  };

  const normalizeGroup = (jid) => {
    const normalized = normalizeJid(jid);
    return normalized && normalized.endsWith('@g.us') ? normalized : null;
  };

  const normalizeUser = (jid) => normalizeJid(jid);

  const getEntry = async (groupJid, userJid) => {
    const normalizedGroup = normalizeGroup(groupJid);
    const normalizedUser = normalizeUser(userJid);
    if (!normalizedGroup || !normalizedUser) {
      return null;
    }

    const data = await ensureLoaded();
    const groupEntries = data[normalizedGroup];
    if (!groupEntries) {
      return null;
    }

    return groupEntries[normalizedUser] || null;
  };

  const setEntry = async (groupJid, userJid, entry) => {
    const normalizedGroup = normalizeGroup(groupJid);
    const normalizedUser = normalizeUser(userJid);
    if (!normalizedGroup || !normalizedUser) {
      throw new Error('JID non valido per il mute.');
    }

    const data = await ensureLoaded();
    if (!entry) {
      if (data[normalizedGroup]) {
        delete data[normalizedGroup][normalizedUser];
        if (!Object.keys(data[normalizedGroup]).length) {
          delete data[normalizedGroup];
        }
      }
      await save(data);
      return;
    }

    if (!data[normalizedGroup]) {
      data[normalizedGroup] = {};
    }
    data[normalizedGroup][normalizedUser] = entry;
    await save(data);
  };

  return {
    async mute(groupJid, userJid, durationMs) {
      const expiresAt = typeof durationMs === 'number' && durationMs > 0 ? Date.now() + durationMs : null;
      await setEntry(groupJid, userJid, {
        mutedAt: Date.now(),
        expiresAt
      });
    },
    async unmute(groupJid, userJid) {
      await setEntry(groupJid, userJid, null);
    },
    async isMuted(groupJid, userJid) {
      const entry = await getEntry(groupJid, userJid);
      if (!entry) {
        return null;
      }

      if (typeof entry.expiresAt === 'number' && entry.expiresAt <= Date.now()) {
        await setEntry(groupJid, userJid, null);
        return null;
      }

      return entry;
    }
  };
}

module.exports = {
  createMuteService,
  MUTE_FILE
};
