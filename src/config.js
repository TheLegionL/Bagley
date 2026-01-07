const path = require('node:path');
const fs = require('fs-extra');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const OWNER_FILE = path.join(CONFIG_DIR, 'owner.json');
const OWNER_EXAMPLE_FILE = path.join(CONFIG_DIR, 'owner.example.json');
const OPENAI_FILE = path.join(CONFIG_DIR, 'openai.json');
const OPENAI_EXAMPLE_FILE = path.join(CONFIG_DIR, 'openai.example.json');
const WHITELIST_FILE = path.join(CONFIG_DIR, 'whitelist.json');

function assertExampleExists(examplePath) {
  if (fs.existsSync(examplePath)) {
    return;
  }

  throw new Error(
    `Missing required config example at ${examplePath}. Restore it to see the expected structure.`
  );
}

function loadOwnerJid() {
  const envOwner = process.env.OWNER_JID && process.env.OWNER_JID.trim();
  if (envOwner) {
    return envOwner;
  }

  if (!fs.existsSync(OWNER_FILE)) {
    assertExampleExists(OWNER_EXAMPLE_FILE);
    throw new Error(
      'Owner configuration missing. Create config/owner.json based on config/owner.example.json and set the "ownerJid" value.'
    );
  }

  const { ownerJid } = fs.readJsonSync(OWNER_FILE);
  const normalized = typeof ownerJid === 'string' ? ownerJid.trim() : '';

  if (!normalized) {
    throw new Error('The ownerJid field inside config/owner.json is empty. Set it to the WhatsApp JID of the bot owner.');
  }

  return normalized;
}

function loadOpenAIKey() {
  const envKey = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
  if (envKey) {
    return envKey;
  }

  if (!fs.existsSync(OPENAI_FILE)) {
    if (fs.existsSync(OPENAI_EXAMPLE_FILE)) {
      return null;
    }
    assertExampleExists(OPENAI_EXAMPLE_FILE);
    return null;
  }

  const { apiKey } = fs.readJsonSync(OPENAI_FILE);
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  return normalized || null;
}

async function ensureWhitelistFile() {
  if (fs.existsSync(WHITELIST_FILE)) {
    return;
  }

  await fs.outputJson(WHITELIST_FILE, [], { spaces: 2 });
}

async function loadWhitelist() {
  await ensureWhitelistFile();

  const data = await fs.readJson(WHITELIST_FILE);
  if (Array.isArray(data)) {
    return data
      .map((entry) => {
        if (typeof entry === 'string') {
          const jid = entry.trim();
          return jid ? { jid } : null;
        }

        if (entry && typeof entry === 'object') {
          const jid = typeof entry.jid === 'string' ? entry.jid.trim() : '';
          const name = typeof entry.name === 'string' ? entry.name.trim() : '';
          return jid ? { jid, name: name || undefined } : null;
        }

        return null;
      })
      .filter(Boolean);
  }

  return [];
}

async function saveWhitelist(entries) {
  const normalized = (entries || [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const jid = typeof entry.jid === 'string' ? entry.jid.trim() : '';
      if (!jid) {
        return null;
      }

      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      return name ? { jid, name } : { jid };
    })
    .filter(Boolean);

  await fs.outputJson(WHITELIST_FILE, normalized, { spaces: 2 });
}

module.exports = {
  CONFIG_DIR,
  OWNER_FILE,
  OPENAI_FILE,
  WHITELIST_FILE,
  loadOwnerJid,
  loadOpenAIKey,
  loadWhitelist,
  saveWhitelist
};
