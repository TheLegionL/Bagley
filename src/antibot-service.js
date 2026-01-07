const path = require('node:path');
const fs = require('fs-extra');
const { normalizeJid } = require('./permissions');

const ANTIBOT_FILE = path.join(__dirname, '..', 'config', 'antibot.json');

function createAntibotService({ logger } = {}) {
  let cache = null;

  const ensureLoaded = async () => {
    if (cache) {
      return cache;
    }

    try {
      const exists = await fs.pathExists(ANTIBOT_FILE);
      if (!exists) {
        cache = {};
        return cache;
      }

      const data = await fs.readJson(ANTIBOT_FILE);
      cache = data && typeof data === 'object' ? data : {};
      return cache;
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile caricare la config antibot, userò impostazioni vuote');
      cache = {};
      return cache;
    }
  };

  const save = async (data) => {
    cache = data;
    try {
      await fs.outputJson(ANTIBOT_FILE, cache, { spaces: 2 });
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare la config antibot');
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
      const settings = await ensureLoaded();
      return Boolean(settings[normalized]);
    },
    async setState(groupJid, enabled) {
      const normalized = normalizeGroup(groupJid);
      if (!normalized) {
        throw new Error('JID gruppo non valido per antibot.');
      }
      const settings = await ensureLoaded();
      if (enabled) {
        settings[normalized] = true;
      } else {
        delete settings[normalized];
      }
      await save(settings);
      return enabled;
    },
    async getAll() {
      const settings = await ensureLoaded();
      return { ...settings };
    }
  };
}

module.exports = {
  createAntibotService,
  ANTIBOT_FILE
};
