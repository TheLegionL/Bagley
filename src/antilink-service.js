const path = require('node:path');
const fs = require('fs-extra');
const { normalizeJid } = require('./permissions');

const ANTILINK_FILE = path.join(__dirname, '..', 'config', 'antilink.json');

function createAntilinkService({ logger } = {}) {
  let cache = null;

  const ensureLoaded = async () => {
    if (cache) {
      return cache;
    }

    try {
      const exists = await fs.pathExists(ANTILINK_FILE);
      if (!exists) {
        cache = {};
        return cache;
      }

      const data = await fs.readJson(ANTILINK_FILE);
      cache = data && typeof data === 'object' ? data : {};
      return cache;
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile caricare il file antilink, userò impostazioni vuote');
      cache = {};
      return cache;
    }
  };

  const save = async (data) => {
    cache = data;
    try {
      await fs.outputJson(ANTILINK_FILE, cache, { spaces: 2 });
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare il file antilink');
    }
  };

  const normalizeGroup = (jid) => normalizeJid(jid);

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
        throw new Error('JID gruppo non valido per antilink.');
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
  createAntilinkService,
  ANTILINK_FILE
};
