const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'osint.json');
const MIN_LIMIT = 100;
const MAX_LIMIT = 10000;
const DEFAULT_CONFIG = {
  endpoint: 'https://leakosintapi.com/',
  token: null,
  defaultLimit: 100,
  defaultLang: 'en',
  defaultType: 'json',
  botName: null,
  timeoutMs: 15000
};

const clampLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CONFIG.defaultLimit;
  }
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, parsed));
};

const sanitizeLang = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_CONFIG.defaultLang;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_CONFIG.defaultLang;
  }
  return trimmed.slice(0, 8);
};

const sanitizeType = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_CONFIG.defaultType;
  }
  const candidate = value.trim().toLowerCase();
  if (!candidate) {
    return DEFAULT_CONFIG.defaultType;
  }
  if (['json', 'short', 'html'].includes(candidate)) {
    return candidate;
  }
  return DEFAULT_CONFIG.defaultType;
};

const sanitizeBotName = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeRequestList = (query, queries) => {
  const payload = [];
  const pushCandidate = (entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const sanitized = entry.trim();
    if (sanitized) {
      payload.push(sanitized);
    }
  };

  if (Array.isArray(queries)) {
    for (const entry of queries) {
      pushCandidate(entry);
    }
  }

  if (typeof query === 'string') {
    const lines = query.split(/\r?\n/);
    if (lines.length > 1) {
      for (const line of lines) {
        pushCandidate(line);
      }
    } else {
      pushCandidate(query);
    }
  }

  if (!payload.length) {
    return null;
  }

  if (payload.length === 1) {
    return payload[0];
  }

  return payload;
};

async function loadConfig(logger) {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      endpoint: parsed.endpoint || DEFAULT_CONFIG.endpoint,
      token: parsed.token || null,
      defaultLimit: clampLimit(parsed.defaultLimit || DEFAULT_CONFIG.defaultLimit),
      defaultLang: sanitizeLang(parsed.defaultLang || DEFAULT_CONFIG.defaultLang),
      defaultType: sanitizeType(parsed.defaultType || DEFAULT_CONFIG.defaultType),
      botName: sanitizeBotName(parsed.botName) || null,
      timeoutMs:
        Number.isFinite(Number(parsed.timeoutMs)) && parsed.timeoutMs > 0
          ? Number(parsed.timeoutMs)
          : DEFAULT_CONFIG.timeoutMs
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      logger?.warn({ err: error }, 'Impossibile leggere la configurazione OSINT');
    }
    return { ...DEFAULT_CONFIG };
  }
}

async function createOsintService({ logger }) {
  let config = await loadConfig(logger);

  const refreshConfig = async () => {
    config = await loadConfig(logger);
    return { ...config };
  };

  const isConfigured = () => Boolean(config.token && config.endpoint);

  const buildPayload = ({ query, queries, limit, lang, type, botName }) => {
    const requestField = normalizeRequestList(query, queries);
    if (!requestField) {
      return { error: 'Richiesta OSINT vuota.' };
    }

    const payload = {
      token: config.token,
      request: requestField,
      limit: clampLimit(limit || config.defaultLimit),
      lang: sanitizeLang(lang || config.defaultLang),
      type: sanitizeType(type || config.defaultType)
    };

    const resolvedBotName = sanitizeBotName(botName || config.botName);
    if (resolvedBotName) {
      payload.bot_name = resolvedBotName;
    }

    return { payload };
  };

  const search = async (options = {}) => {
    if (!isConfigured()) {
      throw new Error('OSINT API non configurata');
    }

    const { payload, error } = buildPayload(options);
    if (error) {
      throw new Error(error);
    }

    const endpoint = config.endpoint || DEFAULT_CONFIG.endpoint;
    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Number(options.timeoutMs)
      : config.timeoutMs || DEFAULT_CONFIG.timeoutMs;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId =
      controller && timeoutMs
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller?.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Timeout durante la richiesta al servizio OSINT');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      logger?.error({ err: error }, 'Impossibile contattare il servizio OSINT');
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      const errorMessage = `Richiesta OSINT fallita (${response.status}): ${text.slice(0, 200)}`;
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      data,
      contentType,
      requestPayload: payload
    };
  };

  return {
    isConfigured,
    refreshConfig,
    getConfig: () => ({ ...config }),
    search
  };
}

module.exports = {
  createOsintService
};
