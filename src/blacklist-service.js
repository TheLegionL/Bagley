const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeJid } = require('./permissions');

const BLACKLIST_FILE_PATH = path.join(__dirname, '..', 'config', 'blacklist.json');

const toEntry = (jid, data = {}) => ({
  jid,
  removedFrom: Array.from(
    new Set(
      Array.isArray(data.removedFrom)
        ? data.removedFrom
            .map((groupJid) => normalizeJid(groupJid))
            .filter((value) => value && value.endsWith('@g.us'))
        : []
    )
  )
});

const cloneEntry = (entry) => ({
  jid: entry.jid,
  removedFrom: [...(entry.removedFrom || [])]
});

async function createBlacklistService({ logger }) {
  let blacklist = new Map();

  const load = async () => {
    try {
      const raw = await fs.readFile(BLACKLIST_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];

      blacklist = new Map();
      for (const rawEntry of entries) {
        const normalized =
          typeof rawEntry === 'string'
            ? normalizeJid(rawEntry)
            : normalizeJid(rawEntry?.jid || rawEntry?.id);
        if (!normalized) {
          continue;
        }
        blacklist.set(normalized, toEntry(normalized, rawEntry));
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere la blacklist');
      }
    }
  };

  const save = async () => {
    try {
      await fs.mkdir(path.dirname(BLACKLIST_FILE_PATH), { recursive: true });
      await fs.writeFile(
        BLACKLIST_FILE_PATH,
        JSON.stringify([...blacklist.values()], null, 2),
        'utf8'
      );
    } catch (error) {
      logger?.error({ err: error }, 'Impossibile salvare la blacklist');
    }
  };

  await load();

  const add = async (jid) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return { added: false, entry: null };
    }
    if (blacklist.has(normalized)) {
      return { added: false, entry: cloneEntry(blacklist.get(normalized)) };
    }
    const entry = toEntry(normalized);
    blacklist.set(normalized, entry);
    await save();
    return { added: true, entry: cloneEntry(entry) };
  };

  const remove = async (jid) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return null;
    }
    const entry = blacklist.get(normalized);
    if (!entry) {
      return null;
    }
    blacklist.delete(normalized);
    await save();
    return cloneEntry(entry);
  };

  const isBlacklisted = (jid) => {
    const normalized = normalizeJid(jid);
    return normalized ? blacklist.has(normalized) : false;
  };

  const getEntry = (jid) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return null;
    }
    const entry = blacklist.get(normalized);
    return entry ? cloneEntry(entry) : null;
  };

  const getAllEntries = () => [...blacklist.values()].map(cloneEntry);

  const recordRemoval = async (jid, groupJid) => {
    const normalizedJid = normalizeJid(jid);
    const normalizedGroup = normalizeJid(groupJid);
    if (
      !normalizedJid ||
      !normalizedGroup ||
      !normalizedGroup.endsWith('@g.us')
    ) {
      return false;
    }
    let entry = blacklist.get(normalizedJid);
    if (!entry) {
      entry = toEntry(normalizedJid);
      blacklist.set(normalizedJid, entry);
    }
    if (entry.removedFrom.includes(normalizedGroup)) {
      return false;
    }
    entry.removedFrom.push(normalizedGroup);
    await save();
    return true;
  };

  const clearRemovalHistory = async (jid) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return false;
    }
    const entry = blacklist.get(normalized);
    if (!entry || !entry.removedFrom.length) {
      return false;
    }
    entry.removedFrom = [];
    await save();
    return true;
  };

  return {
    add,
    remove,
    isBlacklisted,
    getEntry,
    getAllEntries,
    recordRemoval,
    clearRemovalHistory
  };
}

module.exports = {
  createBlacklistService
};
