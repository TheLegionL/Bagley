const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const STORAGE_PATH = path.join(__dirname, '..', 'config', 'ai-toggle.json');

async function createAiToggleService({ logger }) {
  let disabledGroups = new Set();

  const load = async () => {
    try {
      const raw = await fs.readFile(STORAGE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        disabledGroups = new Set(parsed.map((jid) => normalizeJid(jid)).filter(Boolean));
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.disabled)) {
        disabledGroups = new Set(parsed.disabled.map((jid) => normalizeJid(jid)).filter(Boolean));
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere lo stato AI (ai-toggle)');
      }
    }
  };

  const save = async () => {
    try {
      await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });
      await fs.writeFile(STORAGE_PATH, JSON.stringify([...disabledGroups], null, 2), 'utf8');
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare lo stato AI (ai-toggle)');
    }
  };

  await load();

  const setState = async (groupJid, enabled = true) => {
    const normalized = normalizeJid(groupJid);
    if (!normalized || !normalized.endsWith('@g.us')) {
      return false;
    }

    const wasDisabled = disabledGroups.has(normalized);
    if (enabled && wasDisabled) {
      disabledGroups.delete(normalized);
      await save();
      return true;
    }
    if (!enabled && !wasDisabled) {
      disabledGroups.add(normalized);
      await save();
      return true;
    }
    return false;
  };

  const isEnabled = async (groupJid) => {
    const normalized = normalizeJid(groupJid);
    if (!normalized || !normalized.endsWith('@g.us')) {
      return true;
    }
    return !disabledGroups.has(normalized);
  };

  return {
    setState,
    isEnabled
  };
}

module.exports = {
  createAiToggleService
};
