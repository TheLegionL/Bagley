const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const WARN_FILE_PATH = path.join(__dirname, '..', 'config', 'warns.json');
const MAX_WARNS = 3;

function sanitizeJid(jid) {
  return normalizeJid(jid);
}

function createWarnStore(logger) {
  let cache = null;
  let loading = null;

  const readFromDisk = async () => {
    if (loading) {
      return loading;
    }
    loading = (async () => {
      try {
        const raw = await fs.readFile(WARN_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        cache = parsed && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          logger?.warn({ err: error }, 'Impossibile leggere il file dei warn');
        }
        cache = {};
      } finally {
        loading = null;
      }
    })();
    await loading;
  };

  const ensureCache = async () => {
    if (!cache) {
      await readFromDisk();
    }
    if (!cache) {
      cache = {};
    }
    return cache;
  };

  const persist = async () => {
    try {
      await fs.mkdir(path.dirname(WARN_FILE_PATH), { recursive: true });
      await fs.writeFile(WARN_FILE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
      logger?.error({ err: error, path: WARN_FILE_PATH }, 'Impossibile salvare il file dei warn');
    }
  };

  const cloneEntry = (entry) => {
    if (!entry) {
      return null;
    }
    return {
      count: entry.count,
      history: Array.isArray(entry.history) ? [...entry.history] : []
    };
  };

  return {
    async addWarn(jid, meta = {}) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return null;
      }
      const data = await ensureCache();
      const entry = data[normalized] || { count: 0, history: [] };
      entry.count = Number(entry.count) || 0;
      entry.history = Array.isArray(entry.history) ? entry.history : [];
      entry.count += 1;
      entry.history.push({
        by: sanitizeJid(meta.issuer),
        reason: typeof meta.reason === 'string' && meta.reason.trim() ? meta.reason.trim() : null,
        timestamp: Date.now()
      });
      data[normalized] = entry;
      await persist();
      return cloneEntry(entry);
    },

    async decrementWarn(jid) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return null;
      }
      const data = await ensureCache();
      const entry = data[normalized];
      if (!entry || !entry.count) {
        return null;
      }
      entry.count = Math.max(0, Number(entry.count) - 1);
      if (Array.isArray(entry.history) && entry.history.length) {
        entry.history.pop();
      }
      if (entry.count === 0) {
        delete data[normalized];
      }
      await persist();
      return cloneEntry(entry);
    },

    async clearWarns(jid) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return false;
      }
      const data = await ensureCache();
      if (!data[normalized]) {
        return false;
      }
      delete data[normalized];
      await persist();
      return true;
    },

    async getEntry(jid) {
      const normalized = sanitizeJid(jid);
      if (!normalized) {
        return null;
      }
      const data = await ensureCache();
      return cloneEntry(data[normalized]);
    }
  };
}

let sharedStore = null;
function getWarnStore(logger) {
  if (!sharedStore) {
    sharedStore = createWarnStore(logger);
  }
  return sharedStore;
}

module.exports = {
  MAX_WARNS,
  WARN_FILE_PATH,
  createWarnStore,
  getWarnStore
};
