const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const STORAGE_PATH = path.join(__dirname, '..', 'config', 'antighost.json');

async function createAntighostService({ logger }) {
  let enabledGroups = new Set();

  const load = async () => {
    try {
      const raw = await fs.readFile(STORAGE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        enabledGroups = new Set(parsed.map((jid) => normalizeJid(jid)).filter(Boolean));
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.enabled)) {
        enabledGroups = new Set(parsed.enabled.map((jid) => normalizeJid(jid)).filter(Boolean));
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere lo stato antighost');
      }
    }
  };

  const save = async () => {
    try {
      await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });
      await fs.writeFile(STORAGE_PATH, JSON.stringify([...enabledGroups], null, 2), 'utf8');
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare lo stato antighost');
    }
  };

  await load();

  const setState = async (groupJid, enabled = true) => {
    const normalized = normalizeJid(groupJid);
    if (!normalized || !normalized.endsWith('@g.us')) {
      return false;
    }
    const currentlyEnabled = enabledGroups.has(normalized);
    if (enabled && !currentlyEnabled) {
      enabledGroups.add(normalized);
      await save();
      return true;
    }
    if (!enabled && currentlyEnabled) {
      enabledGroups.delete(normalized);
      await save();
      return true;
    }
    return false;
  };

  const isEnabled = async (groupJid) => {
    const normalized = normalizeJid(groupJid);
    if (!normalized || !normalized.endsWith('@g.us')) {
      return false;
    }
    return enabledGroups.has(normalized);
  };

  return {
    setState,
    isEnabled
  };
}

module.exports = {
  createAntighostService
};
