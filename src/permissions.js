const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { loadOwnerJid, loadWhitelist, saveWhitelist, loadModerators } = require('./config');

const PermissionLevel = Object.freeze({
  MEMBER: 0,
  MOD: 1,
  ADMIN: 2,
  WHITELIST: 3,
  OWNER: 4
});

const PermissionLabels = {
  [PermissionLevel.MEMBER]: 'Membro',
  [PermissionLevel.MOD]: 'Moderatore',
  [PermissionLevel.ADMIN]: 'Admin',
  [PermissionLevel.WHITELIST]: 'Whitelist',
  [PermissionLevel.OWNER]: 'Owner'
};

function resolveJidInput(rawJid) {
  if (!rawJid) {
    return '';
  }

  if (typeof rawJid === 'string') {
    return rawJid;
  }

  if (typeof rawJid === 'object') {
    if (rawJid.id) {
      return resolveJidInput(rawJid.id);
    }
    if (rawJid.jid) {
      return resolveJidInput(rawJid.jid);
    }
    if (rawJid._serialized) {
      return resolveJidInput(rawJid._serialized);
    }
    if (rawJid.user && rawJid.server) {
      return `${rawJid.user}@${rawJid.server}`;
    }
  }

  return String(rawJid);
}

function normalizeJid(rawJid) {
  if (!rawJid) {
    return '';
  }

  const stripDevice = (jid) => {
    if (!jid) {
      return '';
    }
    const [local, server] = jid.split('@');
    if (!server) {
      return jid;
    }
    const [user] = local.split(':');
    return `${user}@${server}`;
  };

  const input = resolveJidInput(rawJid).trim();
  if (!input) {
    return '';
  }

  if (input.endsWith('@g.us') || input.endsWith('@broadcast')) {
    return input;
  }

  try {
    const normalized = jidNormalizedUser(input);
    if (normalized) {
      return stripDevice(normalized);
    }
  } catch (error) {
    // fall back to manual normalization below
  }

  const segments = input.split(':');
  let base = segments.shift();

  if (base.includes('@')) {
    const [user] = base.split('@');
    const digits = user.replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : `${user}@s.whatsapp.net`;
  }

  const digits = base.replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : base;
}

function toWhitelistEntry(rawEntry) {
  if (!rawEntry) {
    return null;
  }

  if (typeof rawEntry === 'string') {
    const jid = normalizeJid(rawEntry);
    return jid ? { jid, name: undefined } : null;
  }

  if (typeof rawEntry === 'object') {
    const jid = normalizeJid(rawEntry.jid || rawEntry.id);
    if (!jid) {
      return null;
    }

    const name = typeof rawEntry.name === 'string' ? rawEntry.name.trim() : '';
    return { jid, name: name || undefined };
  }

  return null;
}

class PermissionService {
  constructor(ownerJids, whitelistEntries, moderatorEntries) {
    const jidList = Array.isArray(ownerJids) ? ownerJids : [ownerJids];
    const rawOwnerJids = jidList
      .map((jid) => resolveJidInput(jid).trim())
      .filter(Boolean);

    this.ownerJids = new Set();
    this.ownerRawJids = new Set();

    rawOwnerJids.forEach((jid) => {
      const normalized = normalizeJid(jid);
      if (normalized) {
        this.ownerJids.add(normalized);
        this.ownerRawJids.add(normalized);
      }
      this.ownerRawJids.add(jid);
    });

    this.whitelist = new Map();
    (whitelistEntries || []).forEach((entry) => {
      const normalized = toWhitelistEntry(entry);
      if (normalized) {
        this.whitelist.set(normalized.jid, normalized);
      }
    });
    this.moderators = new Set();
    (moderatorEntries || []).forEach((entry) => {
      const normalized = toWhitelistEntry(entry);
      if (normalized) {
        this.moderators.add(normalized.jid);
      }
    });
  }

  getOwnerJids() {
    return Array.from(this.ownerJids);
  }

  getOwnerJid() {
    return this.getOwnerJids()[0] || null;
  }

  getPermissionLabel(level) {
    return PermissionLabels[level] || 'Sconosciuto';
  }

  getWhitelistEntries() {
    return Array.from(this.whitelist.values());
  }

  getWhitelist() {
    return this.getWhitelistEntries();
  }

  getWhitelistEntryByIndex(index) {
    const entries = this.getWhitelistEntries();
    if (index < 0 || index >= entries.length) {
      return null;
    }
    return entries[index];
  }

  getModeratorEntries() {
    return Array.from(this.moderators).map((jid) => ({ jid }));
  }

  getModeratorEntryByIndex(index) {
    const entries = this.getModeratorEntries();
    if (index < 0 || index >= entries.length) {
      return null;
    }
    return entries[index];
  }

  async reloadWhitelist() {
    const whitelistEntries = await loadWhitelist();
    this.whitelist.clear();
    (whitelistEntries || []).forEach((entry) => {
      const normalized = toWhitelistEntry(entry);
      if (normalized) {
        this.whitelist.set(normalized.jid, normalized);
      }
    });
    return this.getWhitelistEntries();
  }

  async reloadModerators() {
    const moderatorEntries = await loadModerators();
    this.moderators.clear();
    (moderatorEntries || []).forEach((entry) => {
      const normalized = toWhitelistEntry(entry);
      if (normalized) {
        this.moderators.add(normalized.jid);
      }
    });
    return this.getModeratorEntries();
  }

  async addModerator(jid, name) {
    const normalizedJid = normalizeJid(jid);
    if (!normalizedJid) {
      throw new Error('JID non valido per il moderatore.');
    }

    this.moderators.add(normalizedJid);
    await saveModerators(this.getModeratorEntries());
    return { jid: normalizedJid, name: typeof name === 'string' ? name.trim() : undefined };
  }

  async removeModerator(jid) {
    const normalizedJid = normalizeJid(jid);
    if (!normalizedJid) {
      throw new Error('JID non valido per il moderatore.');
    }

    if (!this.moderators.has(normalizedJid)) {
      return null;
    }

    this.moderators.delete(normalizedJid);
    await saveModerators(this.getModeratorEntries());
    return { jid: normalizedJid };
  }

  async removeModeratorByIndex(index) {
    const entry = this.getModeratorEntryByIndex(index);
    if (!entry) {
      return null;
    }

    this.moderators.delete(entry.jid);
    await saveModerators(this.getModeratorEntries());
    return entry;
  }

  async clearModerators() {
    this.moderators.clear();
    await saveModerators([]);
  }

  async addToWhitelist(jid, name) {
    const normalizedJid = normalizeJid(jid);
    if (!normalizedJid) {
      throw new Error('JID non valido per la whitelist.');
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const existing = this.whitelist.get(normalizedJid);
    const entry = {
      jid: normalizedJid,
      name: trimmedName || existing?.name || undefined
    };

    this.whitelist.set(normalizedJid, entry);
    await saveWhitelist(this.getWhitelistEntries());
    return entry;
  }

  async removeFromWhitelist(jid) {
    const normalizedJid = normalizeJid(jid);
    if (!normalizedJid) {
      throw new Error('JID non valido per la whitelist.');
    }

    const entry = this.whitelist.get(normalizedJid);
    if (!entry) {
      return null;
    }

    this.whitelist.delete(normalizedJid);
    await saveWhitelist(this.getWhitelistEntries());
    return entry;
  }

  async removeFromWhitelistByIndex(index) {
    const entry = this.getWhitelistEntryByIndex(index);
    if (!entry) {
      return null;
    }
    this.whitelist.delete(entry.jid);
    await saveWhitelist(this.getWhitelistEntries());
    return entry;
  }

  async clearWhitelist() {
    this.whitelist.clear();
    await saveWhitelist([]);
  }

  async setWhitelistEntryName(jid, name) {
    const normalizedJid = normalizeJid(jid);
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedJid || !trimmedName) {
      return false;
    }

    const existing = this.whitelist.get(normalizedJid);
    if (!existing) {
      return false;
    }

    if (existing.name === trimmedName) {
      return false;
    }

    this.whitelist.set(normalizedJid, { ...existing, name: trimmedName });
    await saveWhitelist(this.getWhitelistEntries());
    return true;
  }

  isOwner(jid) {
    const normalized = normalizeJid(jid);
    if (this.ownerJids.has(normalized)) {
      return true;
    }

    const raw = resolveJidInput(jid).trim();
    return raw ? this.ownerRawJids.has(raw) : false;
  }

  isWhitelisted(jid) {
    return this.whitelist.has(normalizeJid(jid));
  }

  isModerator(jid) {
    return this.moderators.has(normalizeJid(jid));
  }

  getPermissionLevel(jid, groupMetadata) {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return PermissionLevel.MEMBER;
    }

    if (this.isOwner(normalized)) {
      return PermissionLevel.OWNER;
    }

    if (this.isWhitelisted(normalized)) {
      return PermissionLevel.WHITELIST;
    }

    if (groupMetadata?.participants?.length) {
      const participant = groupMetadata.participants.find((entry) => normalizeJid(entry.id) === normalized);
      if (participant && participant.admin) {
        return PermissionLevel.ADMIN;
      }
    }

    if (this.isModerator(normalized)) {
      return PermissionLevel.MOD;
    }

    return PermissionLevel.MEMBER;
  }
}

async function createPermissionService() {
  const ownerJid = loadOwnerJid();
  const whitelistEntries = await loadWhitelist();
  const moderatorEntries = await loadModerators();
  return new PermissionService(ownerJid, whitelistEntries, moderatorEntries);
}

module.exports = {
  PermissionLevel,
  PermissionLabels,
  normalizeJid,
  createPermissionService,
  PermissionService
};
