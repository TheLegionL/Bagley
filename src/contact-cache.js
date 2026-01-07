const { normalizeJid } = require('./permissions');
const { extractContextInfo } = require('./utils');

function sanitizeName(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.replace(/\s+/g, ' ').trim();
}

class ContactCache {
  constructor({ sock, logger }) {
    this.sock = sock;
    this.logger = logger;
    this.names = new Map();
  }

  #setName(jid, rawName) {
    const normalized = normalizeJid(jid);
    const cleanName = sanitizeName(rawName);
    if (!normalized || !cleanName) {
      return;
    }

    this.names.set(normalized, cleanName);
    const bare = normalized.split(':')[0];
    if (bare) {
      this.names.set(bare, cleanName);
    }
  }

  rememberName(jid, name) {
    this.#setName(jid, name);
  }

  rememberMessage(msg) {
    if (!msg) {
      return;
    }

    const senderJid = msg.key?.participant || msg.participant || msg.key?.remoteJid;
    if (senderJid) {
      this.rememberName(senderJid, msg.pushName);
    }

    const contextInfo = extractContextInfo(msg);
    if (!contextInfo) {
      return;
    }

    if (contextInfo.participant && contextInfo.quotedMessage) {
      this.rememberName(contextInfo.participant, contextInfo?.quotedMessage?.pushName);
    }

    if (Array.isArray(contextInfo.mentionedJid) && Array.isArray(contextInfo.mentionedJidName)) {
      contextInfo.mentionedJid.forEach((jid, index) => {
        const name = contextInfo.mentionedJidName[index];
        this.rememberName(jid, name);
      });
    }
  }

  rememberGroup(metadata) {
    if (!metadata?.participants) {
      return;
    }

    metadata.participants.forEach((participant) => {
      if (!participant?.id) {
        return;
      }
      const candidate =
        sanitizeName(participant.name) ||
        sanitizeName(participant.notify) ||
        sanitizeName(participant.pushName) ||
        sanitizeName(participant.displayName) ||
        sanitizeName(participant.vname);
      if (candidate) {
        this.rememberName(participant.id, candidate);
      }
    });
  }

  #fromContacts(jid) {
    if (!this.sock?.contacts) {
      return '';
    }

    const normalized = normalizeJid(jid);
    const bare = normalized?.split(':')[0];
    const fallback = String(jid || '').split(':')[0];

    const contact =
      this.sock.contacts[normalized] ||
      (bare ? this.sock.contacts[bare] : null) ||
      (fallback ? this.sock.contacts[fallback] : null);

    if (!contact) {
      return '';
    }

    const { name, verifiedName, notify, shortName, pushName, displayName } = contact;
    return (
      sanitizeName(name) ||
      sanitizeName(verifiedName) ||
      sanitizeName(displayName) ||
      sanitizeName(shortName) ||
      sanitizeName(notify) ||
      sanitizeName(pushName)
    );
  }

  getDisplayName(jid, options = {}) {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return '';
    }

    const hint = sanitizeName(options.hint);
    if (hint) {
      this.rememberName(normalized, hint);
      return hint;
    }

    const stored =
      this.names.get(normalized) ||
      this.names.get(normalized.split(':')[0]) ||
      this.names.get(String(jid).split(':')[0]);
    if (stored) {
      return stored;
    }

    const groupMetadata = options.groupMetadata;
    if (groupMetadata?.participants) {
      const participant = groupMetadata.participants.find(
        (entry) => normalizeJid(entry.id) === normalized
      );
      if (participant) {
        const candidate =
          sanitizeName(participant.name) ||
          sanitizeName(participant.notify) ||
          sanitizeName(participant.pushName) ||
          sanitizeName(participant.displayName);
        if (candidate) {
          this.rememberName(normalized, candidate);
          return candidate;
        }
      }
    }

    const contactName = this.#fromContacts(normalized);
    if (contactName) {
      this.rememberName(normalized, contactName);
      return contactName;
    }

    return '';
  }
}

function createContactCache({ sock, logger }) {
  const cache = new ContactCache({ sock, logger });

  return {
    rememberMessage: (msg) => cache.rememberMessage(msg),
    rememberName: (jid, name) => cache.rememberName(jid, name),
    rememberGroup: (metadata) => cache.rememberGroup(metadata),
    getDisplayName: (jid, options) => cache.getDisplayName(jid, options)
  };
}

module.exports = {
  createContactCache
};
