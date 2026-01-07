const path = require('node:path');
const fs = require('fs-extra');
const { normalizeJid } = require('./permissions');

const ANTINUKE_FILE = path.join(__dirname, '..', 'config', 'antinuke.json');

function createAntinukeService({ logger } = {}) {
  let cache = null;

  const ensureLoaded = async () => {
    if (cache) {
      return cache;
    }

    try {
      if (!(await fs.pathExists(ANTINUKE_FILE))) {
        cache = {};
        return cache;
      }

      const data = await fs.readJson(ANTINUKE_FILE);
      cache = data && typeof data === 'object' ? data : {};
      return cache;
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile caricare antinuke.json, inizializzo a vuoto');
      cache = {};
      return cache;
    }
  };

  const save = async (data) => {
    cache = data;
    try {
      await fs.outputJson(ANTINUKE_FILE, cache, { spaces: 2 });
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare antinuke.json');
    }
  };

  const normalizeGroup = (jid) => {
    const normalized = normalizeJid(jid);
    return normalized && normalized.endsWith('@g.us') ? normalized : null;
  };

  return {
    async isEnabled(groupJid) {
      const normalized = normalizeGroup(groupJid);
      if (!normalized) {
        return false;
      }
      const data = await ensureLoaded();
      return Boolean(data[normalized]);
    },
    async setState(groupJid, enabled) {
      const normalized = normalizeGroup(groupJid);
      if (!normalized) {
        throw new Error('JID gruppo non valido per l\'antinuke.');
      }
      const data = await ensureLoaded();
      if (enabled) {
        data[normalized] = true;
      } else {
        delete data[normalized];
      }
      await save(data);
      return enabled;
    }
  };
}

module.exports = {
  createAntinukeService,
  ANTINUKE_FILE
};
