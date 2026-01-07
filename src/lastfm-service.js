const path = require('node:path');
const fs = require('fs-extra');
const { CONFIG_DIR } = require('./config');
const { normalizeJid } = require('./permissions');

const LASTFM_CONFIG_FILE = path.join(CONFIG_DIR, 'lastfm.json');
const LASTFM_USERS_FILE = path.join(CONFIG_DIR, 'lastfm-users.json');

function loadApiKey(logger) {
  const envKey = process.env.LASTFM_API_KEY && process.env.LASTFM_API_KEY.trim();
  if (envKey) {
    return envKey;
  }

  try {
    if (fs.existsSync(LASTFM_CONFIG_FILE)) {
      const data = fs.readJsonSync(LASTFM_CONFIG_FILE);
      const value = typeof data?.apiKey === 'string' ? data.apiKey.trim() : '';
      return value || null;
    }
  } catch (error) {
    logger?.warn({ err: error }, 'Impossibile leggere config/lastfm.json');
  }

  return null;
}

async function ensureUsersFile() {
  if (await fs.pathExists(LASTFM_USERS_FILE)) {
    return;
  }

  await fs.outputJson(LASTFM_USERS_FILE, {}, { spaces: 2 });
}

async function readMappings(logger) {
  try {
    await ensureUsersFile();
    const data = await fs.readJson(LASTFM_USERS_FILE);
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    logger?.warn({ err: error }, 'Impossibile leggere lastfm-users');
    return {};
  }
}

async function writeMappings(data, logger) {
  try {
    await fs.outputJson(LASTFM_USERS_FILE, data, { spaces: 2 });
  } catch (error) {
    logger?.error({ err: error }, 'Impossibile salvare lastfm-users');
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return null;
  }

  const diffMs = Date.now() - timestamp * 1000;
  if (diffMs < 0) {
    return null;
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'pochi secondi fa';
  }
  if (diffMinutes === 1) {
    return '1 minuto fa';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minuti fa`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) {
    return '1 ora fa';
  }
  if (diffHours < 24) {
    return `${diffHours} ore fa`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? '1 giorno fa' : `${diffDays} giorni fa`;
}

function createLastfmService({ logger }) {
  const apiKey = loadApiKey(logger);

  const getNormalizedJid = (jid) => normalizeJid(jid);

  const fetchTrackUserPlaycount = async ({ artist, name, user }) => {
    if (!artist || !name || !user) {
      return null;
    }

    try {
      const url = new URL('https://ws.audioscrobbler.com/2.0/');
      url.searchParams.set('method', 'track.getInfo');
      url.searchParams.set('artist', artist);
      url.searchParams.set('track', name);
      url.searchParams.set('user', user);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('format', 'json');

      const response = await fetch(url.toString());
      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const playcount = payload?.track?.userplaycount;
      if (typeof playcount === 'string') {
        const parsed = parseInt(playcount, 10);
        return Number.isNaN(parsed) ? null : parsed;
      }
      if (typeof playcount === 'number') {
        return playcount;
      }
    } catch (error) {
      logger?.debug({ err: error }, 'Impossibile recuperare il playcount personale da Last.fm');
    }

    return null;
  };

  return {
    hasApiKey() {
      return Boolean(apiKey);
    },
    async setUser(jid, username) {
      const normalizedJid = getNormalizedJid(jid);
      if (!normalizedJid) {
        throw new Error('JID non valido per la configurazione del Last.fm.');
      }

      const trimmed = typeof username === 'string' ? username.trim() : '';
      if (!trimmed) {
        throw new Error('Specificare un username Last.fm valido.');
      }

      const mappings = await readMappings(logger);
      mappings[normalizedJid] = trimmed;
      await writeMappings(mappings, logger);
      return trimmed;
    },
    async getUser(jid) {
      const normalizedJid = getNormalizedJid(jid);
      if (!normalizedJid) {
        return null;
      }

      const mappings = await readMappings(logger);
      return mappings[normalizedJid] || null;
    },
    async getCurrentTrack(username) {
      if (!apiKey) {
        throw new Error('API key Last.fm non configurata.');
      }

      const user = username.trim();
      const url = new URL('https://ws.audioscrobbler.com/2.0/');
      url.searchParams.set('method', 'user.getrecenttracks');
      url.searchParams.set('user', user);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('_', Date.now().toString());

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Last.fm ha risposto con status ${response.status}`);
      }

      const payload = await response.json();
      const recent = payload?.recenttracks?.track;
      if (!recent) {
        return null;
      }

      const track = Array.isArray(recent) ? recent[0] : recent;
      if (!track) {
        return null;
      }

      const artist = track.artist?.['#text'] || 'Sconosciuto';
      const name = track.name || '??';
      const album = track.album?.['#text'] || '';
      const urlTrack = track.url || '';
      const image = Array.isArray(track.image) ? track.image.pop()?.['#text'] : null;
      const nowPlaying = track['@attr']?.nowplaying === 'true';
      const timestamp = track.date?.uts ? Number(track.date.uts) : null;
      const userPlaycount = await fetchTrackUserPlaycount({ artist, name, user });

      return {
        artist,
        name,
        album,
        url: urlTrack,
        image,
        nowPlaying,
        timestamp,
        relative: timestamp ? formatRelativeTime(timestamp) : null,
        userPlaycount
      };
    }
  };
}

module.exports = {
  createLastfmService,
  LASTFM_CONFIG_FILE,
  LASTFM_USERS_FILE
};
