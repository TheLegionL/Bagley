const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const STORAGE_PATH = path.join(__dirname, '..', 'config', 'silenced-groups.json');

async function createSilenceService({ logger }) {
  let silenced = new Set();

  const load = async () => {
    try {
      const raw = await fs.readFile(STORAGE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray(parsed.groups)
        ? parsed.groups
        : [];
      silenced = new Set(values.map((jid) => normalizeJid(jid)).filter(Boolean));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere la lista dei gruppi silenziati');
      }
    }
  };

  const save = async () => {
    try {
      await fs.mkdir(path.dirname(STORAGE_PATH), { recursive: true });
      await fs.writeFile(STORAGE_PATH, JSON.stringify([...silenced], null, 2), 'utf8');
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare la lista dei gruppi silenziati');
    }
  };

  await load();

  const setState = async (groupJid, silence) => {
    const normalized = normalizeJid(groupJid);
    if (!normalized || !normalized.endsWith('@g.us')) {
      return false;
    }

    const already = silenced.has(normalized);
    if (silence && !already) {
      silenced.add(normalized);
      await save();
      return true;
    }
    if (!silence && already) {
      silenced.delete(normalized);
      await save();
      return true;
    }
    return false;
  };

  const isSilenced = (groupJid) => {
    const normalized = normalizeJid(groupJid);
    if (!normalized || !normalized.endsWith('@g.us')) {
      return false;
    }
    return silenced.has(normalized);
  };

  return {
    setState,
    isSilenced,
    list: () => [...silenced]
  };
}

module.exports = {
  createSilenceService
};
