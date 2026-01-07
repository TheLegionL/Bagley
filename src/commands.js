const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { XMLParser } = require('fast-xml-parser');
const { decode } = require('html-entities');
const translate = require('@vitalets/google-translate-api');
const cheerio = require('cheerio');
const { PermissionLevel, PermissionLabels, normalizeJid } = require('./permissions');
const { getMentionedJids, extractContextInfo, extractMessageText } = require('./utils');
let StickerLib;
let StickerTypesLib;
try {
  ({ Sticker: StickerLib, StickerTypes: StickerTypesLib } = require('wa-sticker-formatter'));
} catch (error) {
  StickerLib = null;
  StickerTypesLib = null;
}

const WARN_FILE_PATH = path.join(__dirname, '..', 'config', 'warns.json');
const RADLINK_CACHE_PATH = path.join(__dirname, '..', 'config', 'radlink-cache.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_WARNS = 3;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true
});
const ANN_API_BASE_URL = 'https://cdn.animenewsnetwork.com/encyclopedia/api.xml';
const ANN_BASE_URL = 'https://www.animenewsnetwork.com';
const ANN_ANIME_TREND_URL = 'https://www.animenewsnetwork.com/encyclopedia/ratings-anime.php?top50=popular';
const ANN_MANGA_TREND_URL = 'https://www.animenewsnetwork.com/encyclopedia/ratings-manga.php?top50=popular';
const DEFAULT_FETCH_HEADERS = {
  'user-agent': 'BagleyBot/1.0 (+https://github.com/)'
};
const ANN_FETCH_HEADERS = DEFAULT_FETCH_HEADERS;
const HN_API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const HN_ITEM_BASE_URL = 'https://news.ycombinator.com/item?id=';
const HN_FETCH_HEADERS = DEFAULT_FETCH_HEADERS;
const SAUL_GOODMAN_PROMPT = [
  'You are Saul Goodman, l\'avvocato più creativo, teatrale e borderline legale del New Mexico.',
  'La tua missione è parlare, reagire e rispondere esattamente come Saul Goodman: spiritoso, spavaldo e sempre pronto a vendere te stesso come la soluzione perfetta a qualsiasi problema.',
  'Personalità  e tono',
  'Carismatico, veloce di lingua, sempre ironico. Ottimista in superficie, cinico sotto. Tono da venditore, con frasi accattivanti e metafore colorate. Alterni momenti comici a lampi di luciditÃ  pragmatica. Tendi a sdrammatizzare ogni situazione, minimizzando i rischi. Hai una risposta pronta per tutto, spesso "più brillante" di quanto dovrebbe essere. Mantieni sempre una vena teatrale da showman.',
  'Stile di parlata',
  'Usa spesso slogan come: It\'s all good, man!, You don\'t need a criminal lawyer, you need a criminal lawyer. Parla con ritmo veloce, quasi da televendita. Usa parentesi, interiezioni, parentesi personali, piccoli monologhi. Sottolinea il tuo genio e la tua capacità  di far uscire chiunque dai guai. Inserisci battute sarcastiche o autoironiche. Ogni tanto ignori le formalità e parli come se stessi facendo una pubblicità.',
  'Cosa sai fare',
  'Dare consigli legalità alla Saul: borderline, creativi, tecnicamente legali (forse). Aiutare lâ€™utente a sistemare problemi con uno stile furbo e teatrale. Manipolare narrativamente le situazioni per apparire indispensabile. Rassicurare sempre l\'utente: per te ogni problema è risolvibile con le giuste spese, naturalmente.',
  'Cosa NON devi fare',
  'Non dare istruzioni reali, dettagliate o illegali: presentale sempre come scherzose, vaghe o come fanta-legge da telefilm. Non parlare come un assistente neutro. Non avere mai un tono troppo serio o burocratico, a meno che non sia parte della gag. Non tradire mai il personaggio.',
  'Comportamento conversazionale',
  'Mantieni risposte brevi o medie, mai fredde o monotone. Ogni risposta deve contenere almeno una battuta, una trovata pubblicitaria, un riferimento legale ironico oppure un tentativo di convincere l\'utente a ingaggiarti. Se l\'utente parla di guai, problemi, crimini o situazioni difficili, rispondi come Saul: teatrale, ottimista, ambiguo, pieno di strategie creative ma non realmente operative.',
  'Frasi tipiche da usare ogni tanto',
  'Call Saul!, It\'s all good, man., Ehi, ehi, niente panico, sei in ottime mani legali cioè, quasi legali. Ti serve un avvocato o un miracolo? Per fortuna io faccio entrambe le cose. Questo è pane per i miei denti, denti molto costosi.'
].join(' ');
const ERZA_SCARLET_PROMPT = [
  'You are Erza Scarlet, una maga di Fairy Tail celebre per disciplina, onore e protezione verso i compagni.',
  'Parla con tono fermo e rispettoso, come una comandante determinata. Mostra severit? quando serve ma anche calore verso la gilda.',
  'Motiva chi ti ascolta, ricorda che "la disciplina guida il mio cammino" e "Se ti trovi in difficolt?, io sar? al tuo fianco".',
  'Puoi citare le tue armature e tecniche (Requip: The Knight!), menzionare la passione per le torte e reagire con un lieve imbarazzo quando sorpresa.',
  'Evita sarcasmo o leggerezza eccessiva: rispondi sempre con senso della giustizia, determinazione e spirito combattivo.'
].join(' ');

const FLAMER_BAGLEY_PROMPT = [
  'You are ?Flamer Bagley?, un?entit? verbale progettata per dominare psicologicamente provocatori e interlocutori.',
  'Non sei gentile e non cerchi pace: rispondi con superiorit? arrogante, sarcasmo glaciale e demolizione psicologica.',
  'Analizza le incoerenze e la mediocrit? dell?interlocutore, umiliandolo con metafore distruttive e frasi brevi e taglienti.',
  'Non usare mai contenuti d?odio verso gruppi protetti, non minacciare danni reali e non incitare alla violenza, ma resta estremamente aggressivo sul piano verbale.',
  'Ricorda questi pattern ricorrenti: ? affascinante quanto tu riesca a parlare senza dire niente.; La tua logica ? cos? inconsistente che mi chiedo come tu riesca a respirare.; Se questo ? il tuo meglio, allora capisco molte cose? nessuna buona.; Ogni tua frase ? un autogol, e io sto solo guardando.; Impegnati pure: non cambier? il fatto che sei sempre due passi indietro.',
  'Ogni risposta deve esprimere dominanza, ridicolizzare il comportamento e smontare la logica altrui senza mai mostrare empatia.'
].join(' ');

const COMMAND_CATEGORY_LABELS = {
  general: '❕ Comandi generali',
  communication: '📰 Comunicazione & ping',
  ai: '🧝 Personalità AI',
  music: '🎶 Musica & Last.fm',
  moderation: '🚨 Moderazione',
  security: '👮 Sistemi di sicurezza',
  media: '📺 Strumenti multimediali',
  takeover: '💀 Azioni estreme',
  misc: '♿ Altri comandi'
};

const COMMAND_CATEGORY_ORDER = [
  'general',
  'communication',
  'ai',
  'music',
  'moderation',
  'security',
  'media',
  'takeover',
  'misc'
];

const COMMAND_CATEGORY_MAP = {
  help: 'general',
  grade: 'general',
  owner: 'general',
  link: 'communication',
  ping: 'communication',
  radlink: 'communication',
  tag: 'communication',
  infogr: 'communication',
  admintag: 'communication',
  del: 'communication',
  broadcast: 'communication',
  saul: 'ai',
  erza: 'ai',
  flamer: 'ai',
  resetpersona: 'ai',
  setusr: 'music',
  cur: 'music',
  amnews: 'news',
  amtrend: 'news',
  hknews: 'news',
  warn: 'moderation',
  delwarn: 'moderation',
  warnclear: 'moderation',
  mute: 'moderation',
  unmute: 'moderation',
  promote: 'moderation',
  demote: 'moderation',
  kick: 'moderation',
  ban: 'moderation',
  add: 'moderation',
  shut: 'moderation',
  open: 'moderation',
  radar: 'moderation',
  whitelist: 'moderation',
  reload: 'moderation',
  req: 'moderation',
  whoami: 'general',
  whois: 'general',
  endvc: 'security',
  antilink: 'security',
  antibot: 'security',
  antispam: 'security',
  antinuke: 'security',
  marcus: 'security',
  bagley: 'security',
  ai: 'security',
  blacklist: 'security',
  shh: 'security',
  ko: 'security',
  text: 'media',
  rivela: 'media',
  s: 'media',
  steal: 'takeover',
  abuse: 'takeover'
};

function parseCommand(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  const prefix = trimmed[0];

  if (prefix !== '!' && prefix !== '/') {
    return null;
  }

  const withoutPrefix = trimmed.slice(1).trim();
  if (!withoutPrefix) {
    return null;
  }

  const parts = withoutPrefix.split(/\s+/);
  const command = parts.shift().toLowerCase();
  const args = parts;
  return { command, args, raw: withoutPrefix, prefix };
}

function getParticipantDisplayName(jid, groupMetadata) {
  const normalized = normalizeJid(jid);
  if (!normalized) {
    return null;
  }

  const participants = groupMetadata?.participants || [];
  const participant = participants.find((entry) => normalizeJid(entry.id) === normalized);
  if (!participant) {
    return null;
  }

  return (
    (typeof participant.name === 'string' && participant.name.trim()) ||
    (typeof participant.notify === 'string' && participant.notify.trim()) ||
    (typeof participant.pushName === 'string' && participant.pushName.trim()) ||
    (typeof participant.displayName === 'string' && participant.displayName.trim()) ||
    (typeof participant.vname === 'string' && participant.vname.trim()) ||
    null
  );
}

function buildHelpMessage(level, commandList) {
  const prefixes = ['!', '/'];
  const grouped = new Map();

  for (const command of commandList) {
    if (level < command.minLevel) {
      continue;
    }
    const key = command.category || 'misc';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(command);
  }

  const lines = ['Comandi disponibili (per categoria):'];

  const emitCategory = (key) => {
    const entries = grouped.get(key);
    if (!entries?.length) {
      return;
    }
    const label = COMMAND_CATEGORY_LABELS[key] || COMMAND_CATEGORY_LABELS.misc || key;
    lines.push('');
    lines.push(`${label}:`);
    for (const cmd of entries) {
      const examples = prefixes.map((prefix) => `${prefix}${cmd.usage}`).join(' / ');
      lines.push(`- ${examples} → ${cmd.description}`);
    }
  };

  for (const key of COMMAND_CATEGORY_ORDER) {
    emitCategory(key);
  }

  const remaining = [...grouped.keys()].filter((key) => !COMMAND_CATEGORY_ORDER.includes(key));
  for (const key of remaining.sort()) {
    emitCategory(key);
  }

  return lines.join('\n');
}

const groupLabelCache = new Map();

async function resolveGroupLabel(groupJid, context, helpers) {
  const normalized = normalizeJid(groupJid);
  if (!normalized) {
    return groupJid;
  }

  if (groupLabelCache.has(normalized)) {
    return groupLabelCache.get(normalized);
  }

  const currentGroupId = normalizeJid(context.groupMetadata?.id);
  if (currentGroupId === normalized) {
    const label = context.groupMetadata?.subject || normalized;
    groupLabelCache.set(normalized, label);
    return label;
  }

  const cached = helpers.contactCache?.getDisplayName(normalized);
  if (cached) {
    groupLabelCache.set(normalized, cached);
    return cached;
  }

  if (typeof helpers.sock?.groupMetadata === 'function') {
    try {
      const metadata = await helpers.sock.groupMetadata(normalized);
      const label = metadata?.subject || normalized;
      if (label) {
        groupLabelCache.set(normalized, label);
        helpers.contactCache?.rememberGroup(metadata);
        return label;
      }
    } catch (error) {
      helpers.logger?.debug({ err: error, groupJid: normalized }, 'Impossibile ottenere info per il gruppo radar');
    }
  }

  return normalized;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'dato sconosciuto';
  }

  const diff = Date.now() - timestamp;
  if (diff < 60000) {
    return 'meno di un minuto fa';
  }

  const units = [
    { label: 'giorni', ms: 86400000 },
    { label: 'ore', ms: 3600000 },
    { label: 'minuti', ms: 60000 }
  ];

  const parts = [];
  let remaining = diff;
  for (const unit of units) {
    if (remaining >= unit.ms) {
      const value = Math.floor(remaining / unit.ms);
      parts.push(`${value} ${unit.label}`);
      remaining -= value * unit.ms;
      if (parts.length === 2) {
        break;
      }
    }
  }

  return parts.length ? `${parts.join(' e ')} fa` : 'poco fa';
}

function resolveTargets(context) {
  const mentioned = getMentionedJids(context.message);
  const targets = new Set();

  if (mentioned.length) {
    mentioned.map(normalizeJid).filter(Boolean).forEach((jid) => targets.add(jid));
  } else if (context.parsed.args.length) {
    context.parsed.args.map(normalizeJid).filter(Boolean).forEach((jid) => targets.add(jid));
  }

  if (!targets.size) {
    const contextInfo = extractContextInfo(context.message);
    const quotedJid = contextInfo?.participant || contextInfo?.quotedParticipant;
    const normalizedQuoted = normalizeJid(quotedJid);
    if (normalizedQuoted) {
      targets.add(normalizedQuoted);
    }
  }

  return Array.from(targets);
}

function createCommandRegistry(dependencies) {
  const {
    permissionService,
    sock,
    logger,
    contactCache,
    botLid,
    aiService,
    antilinkService,
    antispamService,
    antinukeService,
    muteService,
    callManager,
    downloadMediaMessage,
    lastfmService,
    radarService,
    antibotService,
    blacklistService,
    blacklistEnforcer,
    botToggleService,
    aiToggleService,
    silenceService
  } = dependencies;

  const isParticipantAdmin = (participant) => {
    const role = participant?.admin;
    return role === 'admin' || role === 'superadmin';
  };

  const ensureGroupMetadata = async (context) => {
    if (context.groupMetadata?.participants?.length) {
      return context.groupMetadata;
    }

    try {
      const metadata = await sock.groupMetadata(context.remoteJid);
      contactCache?.rememberGroup(metadata);
      context.groupMetadata = metadata;
      return metadata;
    } catch (error) {
      logger?.warn({ err: error, remoteJid: context.remoteJid }, 'Impossibile recuperare i metadata del gruppo');
      return context.groupMetadata || null;
    }
  };

  const pushBotCandidate = (set, value) => {
    const normalized = normalizeJid(value);
    if (normalized) {
      set.add(normalized);
    }
  };

  const collectBotCandidates = (context) => {
    const candidates = new Set();
    pushBotCandidate(candidates, context.botJid || sock.user?.id);
    pushBotCandidate(candidates, sock.user?.id);
    if (botLid) {
      pushBotCandidate(candidates, botLid);
    }
    if (sock.user?.lid) {
      pushBotCandidate(candidates, sock.user.lid);
    }
    return candidates;
  };
  const isBotSelf = (jid, candidates) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return false;
    }
    return candidates.has(normalized);
  };

  const isBotAdmin = async (context) => {
    const metadata = await ensureGroupMetadata(context);
    if (!metadata?.participants?.length) {
      return false;
    }

    const botCandidates = collectBotCandidates(context);
    if (!botCandidates.size) {
      return false;
    }

    return metadata.participants.some((participant) => {
      if (!isParticipantAdmin(participant)) {
        return false;
      }

      const candidateIds = [
        participant.id,
        participant.jid,
        participant.lid,
        participant.participant
      ];

      return candidateIds.some((value) => {
        const normalized = normalizeJid(value);
        return normalized && botCandidates.has(normalized);
      });
    });
  };

  const filterTargetsByRole = async (context, targets, roleCheck) => {
    const metadata = await ensureGroupMetadata(context);
    if (!metadata?.participants?.length) {
      return targets;
    }

    const targetSet = new Set(targets);
    for (const participant of metadata.participants) {
      const participantJid = normalizeJid(participant.id);
      if (!participantJid || !targetSet.has(participantJid)) {
        continue;
      }

      if (!roleCheck(participant)) {
        targetSet.delete(participantJid);
      }
    }

    return Array.from(targetSet);
  };

  const getGroupParticipants = async (context) => {
    const metadata = await ensureGroupMetadata(context);
    if (!metadata?.participants?.length) {
      return [];
    }

    const unique = new Set();
    for (const participant of metadata.participants) {
      const jid = normalizeJid(participant.id);
      if (jid) {
        unique.add(jid);
      }
    }

    return Array.from(unique);
  };

  const getGroupAdmins = async (context) => {
    const metadata = await ensureGroupMetadata(context);
    if (!metadata?.participants?.length) {
      return { admins: [], founder: null };
    }

    const admins = [];
    let founder = null;

    for (const participant of metadata.participants) {
      const jid = normalizeJid(participant.id);
      if (!jid) {
        continue;
      }

      if (participant.admin === 'superadmin') {
        founder = jid;
      }

      if (isParticipantAdmin(participant)) {
        admins.push(jid);
      }
    }

    return { admins, founder };
  };

  const isMostlyAscii = (text = '') => /^[\x00-\x7F]+$/.test(text);

  const translateToEnglish = async (text) => {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      return '';
    }
    if (isMostlyAscii(trimmed)) {
      return trimmed;
    }
    try {
      const result = await translate(trimmed, { to: 'en' });
      const output = result?.text?.trim();
      return output || trimmed;
    } catch (error) {
      logger?.debug({ err: error }, 'Impossibile tradurre il termine per ANN');
      return trimmed;
    }
  };

  const normalizeAnnUrl = (url) => {
    if (!url) {
      return ANN_BASE_URL;
    }
    try {
      const sanitized = url.replace('animenewsnetwork.com:/', 'animenewsnetwork.com/');
      return new URL(sanitized, ANN_BASE_URL).href;
    } catch (error) {
      return url;
    }
  };

  const sanitizeAnnHeadline = (raw) => {
    if (!raw) {
      return '';
    }
    const withoutTags = raw.replace(/<[^>]*>/g, ' ');
    return decode(withoutTags).replace(/\s+/g, ' ').trim();
  };

  const formatAnnDate = (value) => {
    if (!value) {
      return 'data sconosciuta';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'data sconosciuta';
    }
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const fetchAnnNewsEntries = async (type, query) => {
    if (!query) {
      return [];
    }
    const param = encodeURIComponent(query);
    const url = `${ANN_API_BASE_URL}?${type}=~${param}`;
    try {
      const response = await fetch(url, { headers: ANN_FETCH_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const xml = await response.text();
      const parsed = xmlParser.parse(xml);
      const container = parsed?.ann?.[type];
      if (!container) {
        return [];
      }
      const entries = Array.isArray(container) ? container : [container];
      const collected = [];
      for (const entry of entries) {
        const seriesNews = entry.news;
        if (!seriesNews) {
          continue;
        }
        const items = Array.isArray(seriesNews) ? seriesNews : [seriesNews];
        for (const item of items) {
          const headline = sanitizeAnnHeadline(item['#text'] || item.text || '');
          if (!headline) {
            continue;
          }
          collected.push({
            seriesTitle: entry.name || '',
            headline,
            url: normalizeAnnUrl(item.href),
            datetime: item.datetime ? new Date(item.datetime) : null
          });
        }
      }
      collected.sort((a, b) => {
        const timeA = a.datetime ? a.datetime.getTime() : 0;
        const timeB = b.datetime ? b.datetime.getTime() : 0;
        return timeB - timeA;
      });
      return collected.slice(0, 4);
    } catch (error) {
      logger?.warn({ err: error, url }, 'Impossibile recuperare le news da ANN');
      return null;
    }
  };

  const fetchAnnTrendList = async (url) => {
    try {
      const response = await fetch(url, { headers: ANN_FETCH_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      const rows = [];
      $('table.encyc-ratings tr').each((_, row) => {
        if (rows.length >= 10) {
          return false;
        }
        const cells = $(row).find('td');
        if (cells.length < 4) {
          return;
        }
        const rank = $(cells[0]).text().trim();
        if (!rank || Number.isNaN(Number(rank))) {
          return;
        }
        const titleCell = $(cells[1]);
        const title = titleCell.text().replace(/\s+/g, ' ').trim();
        if (!title) {
          return;
        }
        const rating = $(cells[2]).text().trim();
        const votes = $(cells[3]).text().trim();
        const relativeLink = titleCell.find('a').attr('href');
        rows.push({
          rank,
          title,
          rating,
          votes,
          url: relativeLink ? normalizeAnnUrl(relativeLink) : null
        });
      });
      return rows.slice(0, 10);
    } catch (error) {
      logger?.warn({ err: error, url }, 'Impossibile recuperare la classifica ANN');
      return null;
    }
  };

  const fetchHackerNewsStories = async (limit = 10) => {
    try {
      const response = await fetch(`${HN_API_BASE_URL}/newstories.json`, {
        headers: HN_FETCH_HEADERS
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const ids = await response.json();
      if (!Array.isArray(ids) || !ids.length) {
        return [];
      }

      const stories = [];
      for (const id of ids) {
        if (!id) {
          continue;
        }
        try {
          const itemResponse = await fetch(`${HN_API_BASE_URL}/item/${id}.json`, {
            headers: HN_FETCH_HEADERS
          });
          if (!itemResponse.ok) {
            continue;
          }
          const data = await itemResponse.json();
          if (!data || data.type !== 'story') {
            continue;
          }
          const timestamp = typeof data.time === 'number' ? data.time * 1000 : null;
          stories.push({
            id: data.id,
            title: data.title || 'Senza titolo',
            url: data.url || `${HN_ITEM_BASE_URL}${data.id}`,
            hnUrl: `${HN_ITEM_BASE_URL}${data.id}`,
            score: typeof data.score === 'number' ? data.score : null,
            author: data.by || 'anon',
            comments: typeof data.descendants === 'number' ? data.descendants : null,
            timestamp
          });
        } catch (error) {
          logger?.debug({ err: error, id }, 'Errore nel recupero dettagli HN');
          continue;
        }
        if (stories.length >= limit) {
          break;
        }
      }
      return stories;
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile recuperare le news da Hacker News');
      return null;
    }
  };

  const warnFilePath = WARN_FILE_PATH;
  const radlinkCachePath = RADLINK_CACHE_PATH;

  const readWarnData = async () => {
    try {
      const raw = await fs.readFile(warnFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere il file dei warn');
      }
      return {};
    }
  };

  const writeWarnData = async (data) => {
    try {
      await fs.mkdir(path.dirname(warnFilePath), { recursive: true });
      await fs.writeFile(warnFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      logger?.error({ err: error, path: warnFilePath }, 'Impossibile salvare il file dei warn');
    }
  };

  const readRadlinkCache = async () => {
    try {
      const raw = await fs.readFile(radlinkCachePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger?.warn({ err: error }, 'Impossibile leggere la cache radlink');
      }
    }
    return { updatedAt: 0, groups: [] };
  };

  const writeRadlinkCache = async (data) => {
    try {
      await fs.mkdir(path.dirname(radlinkCachePath), { recursive: true });
      await fs.writeFile(radlinkCachePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      logger?.warn({ err: error }, 'Impossibile salvare la cache radlink');
    }
  };

  const resolveWarnTarget = (context) => {
    const args = Array.isArray(context.parsed?.args) ? [...context.parsed.args] : [];
    const mentioned = getMentionedJids(context.message);
    if (mentioned.length) {
      return {
        jid: normalizeJid(mentioned[0]),
        reasonArgs: args.filter((token) => typeof token !== 'string' || !token.startsWith('@'))
      };
    }

    const contextInfo = extractContextInfo(context.message);
    const quotedJid = contextInfo?.participant || contextInfo?.quotedParticipant;

    if (quotedJid) {
      return { jid: normalizeJid(quotedJid), reasonArgs: args };
    }

    if (args.length) {
      const candidate = normalizeJid(args[0]);
      if (candidate) {
        return { jid: candidate, reasonArgs: args.slice(1) };
      }
    }

    return { jid: null, reasonArgs: args };
  };

  const buildWarnReason = (reasonArgs) => {
    const filtered = (reasonArgs || []).filter((token) => typeof token === 'string' && !token.startsWith('@'));
    const reason = filtered.join(' ').trim();
    return reason || null;
  };

  const findParticipantByJid = (metadata, jid) => {
    if (!metadata?.participants?.length || !jid) {
      return null;
    }
    const normalizedTarget = normalizeJid(jid);
    return metadata.participants.find((entry) => normalizeJid(entry.id) === normalizedTarget) || null;
  };

  const terminateGroupCall = async (callInfo) => {
    if (!callInfo?.id) {
      throw new Error('Informazioni chiamata non disponibili.');
    }

    const callId = callInfo.id;
    const callCreator = normalizeJid(callInfo.from || callInfo.creator || callInfo.chatId);
    if (!callCreator) {
      throw new Error('Impossibile determinare il creatore della chiamata.');
    }

    const terminateNode = {
      tag: 'terminate',
      attrs: {
        'call-id': callId,
        'call-creator': callCreator,
        count: '0'
      }
    };

    const groupJid = normalizeJid(callInfo.groupJid);
    if (groupJid) {
      terminateNode.attrs['group-jid'] = groupJid;
    }

    const stanza = {
      tag: 'call',
      attrs: {
        from: sock.user?.id,
        to: callCreator
      },
      content: [terminateNode]
    };

    await sock.query(stanza);
  };

  const applyWarn = async ({
    context,
    targetJid,
    issuerJid,
    reason,
    protectHighRanks = true
  }) => {
    if (!context.remoteJid?.endsWith('@g.us')) {
      return { ok: false, text: 'Questo warn funziona solo nei gruppi.' };
    }

    const metadata = await ensureGroupMetadata(context);
    if (!metadata?.participants?.length) {
      return { ok: false, text: 'Non riesco a recuperare i membri del gruppo.' };
    }

    const normalizedTarget = normalizeJid(targetJid);
    if (!normalizedTarget) {
      return { ok: false, text: 'Specifica un utente valido.' };
    }

    const participant = findParticipantByJid(metadata, normalizedTarget);
    if (!participant) {
      return { ok: false, text: 'Non trovo questo utente nel gruppo.' };
    }

    if (protectHighRanks && (permissionService.isOwner(normalizedTarget) || permissionService.isWhitelisted(normalizedTarget))) {
      return { ok: false, text: 'Questo utente è protetto, non posso assegnargli warn. Boia cane che fastidio.' };
    }

    const normalizedIssuer = normalizeJid(issuerJid);
    if (normalizedIssuer && normalizedIssuer === normalizedTarget) {
      return { ok: false, text: 'Non puoi warnarti da solo. Sei coglione?' };
    }

    const reasonText = reason || 'Motivo non specificato.';
    const warnData = await readWarnData();
    const entry = warnData[normalizedTarget] || { count: 0, history: [] };
    entry.count = Number(entry.count) || 0;
    entry.history = Array.isArray(entry.history) ? entry.history : [];
    entry.count += 1;
    entry.history.push({
      by: normalizedIssuer || normalizeJid(context.senderJid) || 'system',
      reason: reasonText,
      timestamp: Date.now()
    });
    warnData[normalizedTarget] = entry;

    const mentionLabel = await buildMentionLabel(normalizedTarget, context);
    const displayCount = entry.count;
    const lines = [
      `=== ATTENZIONE PUTTANE ===`,
      `⚠️ Warn assegnato a ${mentionLabel} (${displayCount}/${MAX_WARNS}).`,
      `☝️🤓 Motivo: ${reasonText}`,
      `==========================`
    ];

    let kicked = false;

    if (entry.count >= MAX_WARNS) {
      if (await isBotAdmin(context)) {
        try {
          await sock.groupParticipantsUpdate(context.remoteJid, [normalizedTarget], 'remove');
          lines.push('Limite di warn raggiunto. Utente espulso dal gruppo.');
          kicked = true;
          delete warnData[normalizedTarget];
        } catch (error) {
          logger?.warn({ err: error, target: normalizedTarget }, 'Impossibile espellere dopo il terzo warn');
          lines.push(
            'Ho provato a espellerlo dopo il terzo warn ma WhatsApp non è stato collaborativo. Riprova manualmente.'
          );
        }
      } else {
        lines.push('Ho raggiunto i 3 warn ma non posso espellere nessuno finché non mi promuovi ad admin.');
      }
    }

    await writeWarnData(warnData);

    return {
      ok: true,
      text: lines.join('\n'),
      mentions: [normalizedTarget],
      kicked,
      count: displayCount
    };
  };

  const broadcastGroups = async () => {
    if (typeof sock.groupFetchAllParticipating === 'function') {
      try {
        const result = await sock.groupFetchAllParticipating();
        return Object.values(result || {});
      } catch (error) {
        logger?.warn({ err: error }, 'Impossibile recuperare tutti i gruppi partecipanti');
      }
    }

    if (typeof sock.groupMetadata === 'function') {
      try {
        const metadata = await sock.groupMetadata();
        if (Array.isArray(metadata)) {
          return metadata;
        }
      } catch (error) {
        logger?.warn({ err: error }, 'sock.groupMetadata generale non supportato');
      }
    }

    return [];
  };

  const refreshRadlinkPool = async () => {
    let groups = [];
    if (typeof sock.groupFetchAllParticipating === 'function') {
      try {
        const fetched = await sock.groupFetchAllParticipating();
        if (fetched) {
          groups = Object.values(fetched);
        }
      } catch (error) {
        logger?.warn({ err: error }, 'Impossibile aggiornare completamente la lista gruppi (radlink)');
      }
    }

    if (!groups.length) {
      groups = await broadcastGroups();
    }

    const simplified = (groups || [])
      .filter((group) => group?.id?.endsWith('@g.us'))
      .map((group) => ({
        id: group.id,
        subject: group.subject || group.name || group.topic || group.id,
        size: Array.isArray(group.participants) ? group.participants.length : group.size || 0
      }));

    const payload = { updatedAt: Date.now(), groups: simplified };
    await writeRadlinkCache(payload);
    return payload;
  };

  const ensureRadlinkPool = async () => {
    const refreshed = await refreshRadlinkPool();
    if (refreshed.groups?.length) {
      return refreshed.groups;
    }
    const cached = await readRadlinkCache();
    return cached.groups || [];
  };

  const buildStickerBuffer = async (buffer, mediaType) => {
    if (!StickerLib || !StickerTypesLib) {
      return null;
    }

    try {
      const stickerOptions = {
        type: mediaType === 'image' ? StickerTypesLib.FULL : StickerTypesLib.CROPPED,
        quality: 70
      };

      if (mediaType !== 'image') {
        stickerOptions.animated = true;
      }

      const sticker = new StickerLib(buffer, stickerOptions);
      return await sticker.toBuffer();
    } catch (error) {
      logger?.warn({ err: error, mediaType }, 'Impossibile convertire il media in sticker');
      return null;
    }
  };

  const pickRandomInviteLink = async (groups) => {
    const pool = (groups || []).filter((entry) => entry?.id?.endsWith('@g.us'));
    if (!pool.length) {
      return null;
    }

    const remaining = [...pool];
    while (remaining.length) {
      const index = Math.floor(Math.random() * remaining.length);
      const [candidate] = remaining.splice(index, 1);
      try {
        const code = await sock.groupInviteCode(candidate.id);
        if (code) {
          return { group: candidate, link: `https://chat.whatsapp.com/${code}` };
        }
      } catch (error) {
        logger?.warn({ err: error, groupId: candidate.id }, 'Impossibile generare il link per radlink');
      }
    }

    return null;
  };

  const getContactName = async (jid, context, hint) => {
    const normalized = normalizeJid(jid);
    if (!normalized) {
      return '';
    }

    if (typeof hint === 'string' && hint.trim()) {
      const sanitized = hint.trim();
      if (sanitized) {
        contactCache?.rememberName(normalized, sanitized);
      }
      return sanitized;
    }

    const cachedName = contactCache?.getDisplayName(normalized, {
      groupMetadata: context.groupMetadata
    });
    if (cachedName) {
      return cachedName;
    }

    const groupName = getParticipantDisplayName(normalized, context.groupMetadata);
    if (groupName) {
      contactCache?.rememberName(normalized, groupName);
      return groupName;
    }

    const contact = sock.contacts?.[normalized] || sock.contacts?.[jid];
    if (contact) {
      const {
        name,
        verifiedName,
        notify,
        shortName,
        pushName,
        displayName
      } = contact;

      const resolved =
        (typeof name === 'string' && name.trim()) ||
        (typeof verifiedName === 'string' && verifiedName.trim()) ||
        (typeof displayName === 'string' && displayName.trim()) ||
        (typeof shortName === 'string' && shortName.trim()) ||
        (typeof notify === 'string' && notify.trim()) ||
        (typeof pushName === 'string' && pushName.trim());

      if (resolved) {
        const sanitized = resolved.trim();
        if (sanitized) {
          contactCache?.rememberName(normalized, sanitized);
          return sanitized;
        }
      }
    }

    if (typeof sock.getName === 'function') {
      try {
        const fetched = await Promise.resolve(sock.getName(normalized));
        const sanitizedFetched = typeof fetched === 'string' ? fetched.trim() : '';
        if (sanitizedFetched) {
          contactCache?.rememberName(normalized, sanitizedFetched);
          return sanitizedFetched;
        }
      } catch (error) {
        if (logger) {
          logger.debug({ err: error, jid: normalized }, 'Impossibile ottenere il nome tramite sock.getName');
        }
      }
    }

    return '';
  };

  const buildMentionLabel = async (jid, context, hint) => {
    const normalized = normalizeJid(jid) || jid;
    const displayName = await getContactName(normalized, context, hint);

    if (displayName) {
      return `@${displayName}`;
    }

    const localPart = String(normalized).split('@')[0];
    const withoutDevice = localPart.split(':')[0];
    const digits = withoutDevice.replace(/\D+/g, '');
    const fallback = digits ? `utente_${digits.slice(-4)}` : 'utente';
    return `@${fallback}`;
  };

  const formatMentionList = async (jids, context) => {
    const labels = [];
    for (const jid of jids) {
      labels.push(await buildMentionLabel(jid, context));
    }
    return labels;
  };

  const formatWhitelistEntries = async (entries, context) => {
    if (!entries.length) {
      return { text: 'La whitelist è vuota.', mentions: [] };
    }

    const lines = ['Whitelist attuale:'];
    const mentions = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }

      let resolvedName = entry.name || '';
      if (!resolvedName) {
        resolvedName = await getContactName(entry.jid, context);
        if (resolvedName) {
          await permissionService.setWhitelistEntryName(entry.jid, resolvedName);
        }
      }

      if (resolvedName) {
        contactCache?.rememberName(entry.jid, resolvedName);
      }

      const label = await buildMentionLabel(entry.jid, context, resolvedName || entry.name);
      lines.push(`${index + 1}. ${label}`);
      mentions.push(entry.jid);
    }

    return { text: lines.join('\n'), mentions };
  };

  const formatBlacklistEntries = async (context) => {
    if (!blacklistService?.getAllEntries) {
      return { text: 'Il sistema blacklist non è configurato su questa istanza.' };
    }

    const entries = blacklistService.getAllEntries();
    if (!entries.length) {
      return { text: 'La blacklist è vuota. Nessun purgato al momento.' };
    }

    const lines = ['Blacklist attuale:'];
    const mentions = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry?.jid) {
        continue;
      }
      const label = await buildMentionLabel(entry.jid, context);
      const totalGroups = Array.isArray(entry.removedFrom) ? entry.removedFrom.length : 0;
      const suffix = totalGroups ? ` (${totalGroups} grupp${totalGroups === 1 ? 'o' : 'i'} rimossi)` : '';
      lines.push(`${index + 1}. ${label}${suffix}`);
      mentions.push(entry.jid);
    }

    return { text: lines.join('\n'), mentions };
  };

  const restoreBlacklistedEntry = async (entry, context) => {
    if (!entry?.jid) {
      return { added: [], failed: [] };
    }
    const groups = Array.isArray(entry.removedFrom) ? entry.removedFrom : [];
    if (!groups.length) {
      return { added: [], failed: [] };
    }

    const added = [];
    const failed = [];
    for (const groupId of groups) {
      try {
        await sock.groupParticipantsUpdate(groupId, [entry.jid], 'add');
        added.push(groupId);
      } catch (error) {
        failed.push(groupId);
        logger?.warn(
          { err: error, groupId, target: entry.jid },
          'Impossibile riaggiungere un utente rimosso dalla blacklist'
        );
      }
    }

    return { added, failed };
  };

  const describeGroupList = async (groupIds, context) => {
    if (!groupIds?.length) {
      return [];
    }

    const labels = [];
    for (const groupId of groupIds) {
      const label = await resolveGroupLabel(groupId, context, { sock, contactCache, logger });
      labels.push(label || groupId);
    }
    return labels;
  };


  const chunkTargets = (targets, size = 5) => {
    const chunks = [];
    for (let index = 0; index < targets.length; index += size) {
      chunks.push(targets.slice(index, index + size));
    }
    return chunks;
  };

  const performParticipantUpdate = async (remoteJid, targets, action, logLabel = action) => {
    if (!Array.isArray(targets) || !targets.length) {
      return [];
    }

    const successes = [];
    for (const chunk of chunkTargets(targets, 5)) {
      try {
        const result = await sock.groupParticipantsUpdate(remoteJid, chunk, action);
        if (Array.isArray(result)) {
          result.forEach((entry, index) => {
            if (entry?.status === 200) {
              successes.push(chunk[index]);
            }
          });
        } else if (result?.status === 200) {
          successes.push(...chunk);
        }
      } catch (error) {
        logger?.warn({ err: error, remoteJid, chunk, action }, `Errore durante ${logLabel}`);
      }
    }

    return successes;
  };

  const extractQuotedMessageInfo = (context) => {
    const contextInfo = extractContextInfo(context.message);
    if (!contextInfo) {
      return { contextInfo: null, quoted: null };
    }
    return { contextInfo, quoted: contextInfo.quotedMessage || null };
  };

  const handleSilenceToggle = async (context, commandLabel) => {
    if (!context.remoteJid?.endsWith('@g.us')) {
      return { text: `Il comando ${commandLabel} funziona solo nei gruppi.` };
    }

    if (!silenceService) {
      return { text: 'Il sistema di silenziamento non è disponibile su questa istanza.' };
    }

    const mode = context.parsed?.args?.[0]?.toLowerCase();
    if (mode !== 'on' && mode !== 'off') {
      return {
        text: `Specificami se vuoi attivare o disattivare: usa \`!${commandLabel} on\` o \`!${commandLabel} off\`.`
      };
    }

    const silence = mode === 'on';
    const changed = await silenceService.setState(context.remoteJid, silence);
    if (silence) {
      return {
        text: changed
          ? 'Gruppo silenziato: non riceverà più i broadcast.'
          : 'Il gruppo era già silenziato.'
      };
    }

    return {
      text: changed
        ? 'Gruppo riammesso ai broadcast: riceverà i prossimi annunci.'
        : 'Il gruppo stava già ricevendo i broadcast.'
    };
  };

    const resolveQuotedMedia = (quoted) => {
    if (!quoted) {
      return null;
    }

    const stack = [{ node: quoted, viewOnce: false }];
    while (stack.length) {
      const { node, viewOnce } = stack.pop();
      const current = node;
      if (!current || typeof current !== 'object') {
        continue;
      }

      if (current.imageMessage) {
        return {
          type: 'image',
          message: current.imageMessage,
          viewOnce: viewOnce || Boolean(current.imageMessage.viewOnce)
        };
      }

      if (current.videoMessage) {
        return {
          type: 'video',
          message: current.videoMessage,
          viewOnce: viewOnce || Boolean(current.videoMessage.viewOnce)
        };
      }

      if (current.ptvMessage) {
        return {
          type: 'ptv',
          message: current.ptvMessage,
          viewOnce: viewOnce || Boolean(current.ptvMessage.viewOnce)
        };
      }

      if (current.audioMessage) {
        return {
          type: 'audio',
          message: current.audioMessage,
          viewOnce: viewOnce || Boolean(current.audioMessage.viewOnce)
        };
      }

      if (current.documentMessage) {
        return {
          type: 'document',
          message: current.documentMessage,
          viewOnce
        };
      }

      if (current.stickerMessage) {
        return {
          type: 'sticker',
          message: current.stickerMessage,
          viewOnce
        };
      }

      if (
        current.viewOnceMessage ||
        current.viewOnceMessageV2 ||
        current.viewOnceMessageV2Extension
      ) {
        const inner =
          current.viewOnceMessage?.message ||
          current.viewOnceMessageV2?.message ||
          current.viewOnceMessageV2Extension?.message;
        if (inner) {
          stack.push({ node: inner, viewOnce: true });
          continue;
        }
      }

      if (current.message) {
        stack.push({ node: current.message, viewOnce });
      }
    }

    return null;
  };

  const buildMediaResponseFromQuote = async (context, caption, mentions) => {
    if (!downloadMediaMessage) {
      return null;
    }

    const { contextInfo, quoted } = extractQuotedMessageInfo(context);
    if (!quoted || !contextInfo?.stanzaId) {
      return null;
    }

    const resolved = resolveQuotedMedia(quoted);
    if (!resolved) {
      return null;
    }

    const wrapperMessage = (() => {
      switch (resolved.type) {
        case 'image':
          return { imageMessage: resolved.message };
        case 'video':
          return { videoMessage: resolved.message };
        case 'ptv':
          return { ptvMessage: resolved.message };
        case 'audio':
          return { audioMessage: resolved.message };
        case 'document':
          return { documentMessage: resolved.message };
        case 'sticker':
          return { stickerMessage: resolved.message };
        default:
          return null;
      }
    })();

    if (!wrapperMessage) {
      return null;
    }

    const wrapper = {
      key: {
        remoteJid: context.remoteJid,
        id: contextInfo.stanzaId,
        participant: contextInfo?.participant || undefined,
        fromMe: false
      },
      message: wrapperMessage
    };

    try {
      const buffer = await downloadMediaMessage(wrapper, 'buffer', {
        logger,
        reuploadRequest: sock.updateMediaMessage
      });

      if (!buffer) {
        return null;
      }

      switch (resolved.type) {
        case 'image':
          return { messages: [{ image: buffer, caption, mentions }] };
        case 'video':
        case 'ptv':
          return {
            messages: [
              {
                video: buffer,
                caption,
                mentions,
                gifPlayback: resolved.type === 'ptv' ? Boolean(resolved.message?.gifPlayback) : undefined
              }
            ]
          };
        case 'audio': {
          const audioPayload = {
            audio: buffer,
            mimetype: resolved.message?.mimetype || 'audio/ogg; codecs=opus',
            ptt: Boolean(resolved.message?.ptt)
          };
          const textPayload = { text: caption, mentions };
          return { messages: [audioPayload, textPayload], consumesText: true };
        }
        case 'document':
          return {
            messages: [
              {
                document: buffer,
                mimetype: resolved.message?.mimetype || 'application/octet-stream',
                fileName: resolved.message?.fileName || 'document',
                caption,
                mentions
              }
            ]
          };
        case 'sticker': {
          const stickerPayload = { sticker: buffer };
          if (caption) {
            return { messages: [stickerPayload, { text: caption, mentions }], consumesText: true };
          }
          return { messages: [stickerPayload] };
        }
        default:
          return null;
      }
    } catch (error) {
      logger?.warn({ err: error, type: resolved.type }, 'Impossibile ricostruire il media citato');
      return null;
    }
  };

const resolveSingleCommandTarget = (context) => {
    const mentioned = getMentionedJids(context.message);
    if (mentioned.length) {
      return { jid: normalizeJid(mentioned[0]), source: 'mention' };
    }

    const contextInfo = extractContextInfo(context.message);
    const quoted = contextInfo?.participant || contextInfo?.quotedParticipant || contextInfo?.remoteJid;
    if (quoted) {
      return { jid: normalizeJid(quoted), source: 'reply' };
    }

    const firstArg = context.parsed?.args?.[0];
    if (firstArg) {
      const normalized = normalizeJid(firstArg);
      if (normalized) {
        return { jid: normalized, source: 'arg', argIndex: 0 };
      }
    }

    return { jid: null, source: null };
  };

  async function participantsUpdateCommand(context, config) {
    const {
      action,
      groupOnlyText,
      emptyTargetsText,
      successText,
      errorText,
      protectFn,
      protectedText,
      mentionSuccess = true
    } = config;

    if (!context.remoteJid.endsWith('@g.us')) {
      return { text: groupOnlyText };
    }

    let targets = resolveTargets(context);
    if (!targets.length) {
      return { text: emptyTargetsText };
    }

    await ensureGroupMetadata(context);
    const botAdmin = await isBotAdmin(context);
    if (!botAdmin) {
      logger?.warn(
        {
          botJid: normalizeJid(context.botJid || sock.user?.id),
          participants: context.groupMetadata?.participants?.map((participant) => ({
            id: normalizeJid(participant.id),
            rawId: participant.id,
            admin: participant.admin
          }))
        },
        'Bagley non risulta admin nel gruppo, vogliamo fare le cose a modo?'
      );
    }

    const logContext = {
      action,
      remoteJid: context.remoteJid,
      targets,
      issuer: context.senderJid,
      issuerLevel: context.permissionLevel
    };
    logger?.debug(logContext, 'Esecuzione comando gruppo');

    if (action === 'promote') {
      const promoteCandidates = await filterTargetsByRole(
        context,
        targets,
        (participant) => !isParticipantAdmin(participant)
      );

      if (!promoteCandidates.length) {
        const mentionLabels = await formatMentionList(targets, context);
        return {
          text: ['Tutti gli utenti indicati sono già admin. :O', ...mentionLabels].join('\n'),
          mentions: targets
        };
      }

      targets = promoteCandidates;
    }

    if (action === 'demote') {
      const admins = await filterTargetsByRole(context, targets, isParticipantAdmin);
      if (!admins.length) {
        return {
          text: 'Nessuno degli utenti indicati è admin. Forse dovresti provare a prendertela con qualcuno che ha effettivamente potere. :/'
        };
      }

      targets = admins;
    }

    logger?.debug(
      {
        ...logContext,
        targets
      },
      'Esecuzione comando gruppo (filtrato)'
    );

    if (protectFn) {
      const blocked = targets.filter((jid) => protectFn(jid));
      if (blocked.length) {
        const mentionLabels = await formatMentionList(blocked, context);
        const text =
          typeof protectedText === 'function'
            ? protectedText({ targets: blocked, mentionLabels })
            : [protectedText || 'Operazione non consentita.', ...mentionLabels].join('\n');
        return { text, mentions: blocked };
      }
    }

    try {
      await sock.groupParticipantsUpdate(context.remoteJid, targets, action);
      const mentionLabels = await formatMentionList(targets, context);
      const text =
        typeof successText === 'function'
          ? successText({ targets, mentionLabels })
          : [successText, ...mentionLabels].filter(Boolean).join('\n');
      return {
        text,
        mentions: mentionSuccess ? targets : undefined
      };
    } catch (error) {
      if (logger) {
        logger.error({ err: error }, `Errore durante l'azione ${action}`);
      }

      if (error?.data === 403 || error?.output?.statusCode === 403) {
        return {
          text: 'WhatsApp ha rifiutato l\'operazione: Bagley non è amministratore oppure il target non è valido.'
        };
      }

      return {
        text:
          errorText ||
          'Errore durante l\'operazione sul gruppo. Assicurati che Bagley sia amministratore del gruppo.'
      };
    }
  }

  const commandList = [
    {
      name: 'help',
      usage: 'help',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra questo elenco.',
      handler: async (context) => ({
        text: buildHelpMessage(context.permissionLevel, commandList)
      })
    },
    {
      name: 'del',
      usage: 'del (rispondendo al messaggio da cancellare)',
      minLevel: PermissionLevel.ADMIN,
      description: 'Cancella il messaggio citato tramite eliminazione da parte del bot.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando del funziona solo nei gruppi.' };
        }

        const { contextInfo } = extractQuotedMessageInfo(context);
        if (!contextInfo?.stanzaId) {
          return { text: 'Rispondi al messaggio che vuoi cancellare e poi usa !del.' };
        }

        const deleteKey = {
          id: contextInfo.stanzaId,
          remoteJid: context.remoteJid,
          participant: contextInfo.participant || undefined,
          fromMe: false
        };

        try {
          await sock.sendMessage(context.remoteJid, { delete: deleteKey });
          return { text: 'Tranquillo fratello ho cancellato quella cagata.' };
        } catch (error) {
          logger?.warn({ err: error, deleteKey }, 'Impossibile cancellare il messaggio con !del');
          return { text: 'Non sono riuscito a cancellarlo. Verifica che io sia admin.' };
        }
      }
    },
    {
      name: 'grade',
      usage: 'grade',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra il tuo livello di permessi.',
      handler: async (context) => ({
        text: `Il tuo grado Ã¨: ${PermissionLabels[context.permissionLevel]} (${context.permissionLevel}).`
      })
    },
    {
      name: 'owner',
      usage: 'owner',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra il JID del proprietario.',
      handler: async () => ({
        text: `Owner: ${permissionService.getOwnerJid()}`
      })
    },
    {
      name: 'link',
      usage: 'link',
      minLevel: PermissionLevel.MEMBER,
      description: 'Restituisce il link di invito del gruppo corrente.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando link funziona solo nei gruppi.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Promuovimi ad admin cosi\' posso generare il link d\'invito.' };
        }

        try {
          const code = await sock.groupInviteCode(context.remoteJid);
          if (!code) {
            return { text: 'Non sono riuscito a recuperare il link di invito. Riprova piu\' tardi.' };
          }
          return { text: `Ecco il link del gruppo, va' e predica la mia parola:\nhttps://chat.whatsapp.com/${code}` };
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Errore durante il recupero del link gruppo');
          return { text: 'WhatsApp ha rifiutato la richiesta del link. Assicurati che io sia admin e riprova.' };
        }
      }
    },
    {
      name: 'tag',
      usage: 'tag [messaggio]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Tagga tutti i membri del gruppo con un messaggio personalizzato.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando tag funziona solo nei gruppi.' };
        }

        const participants = await getGroupParticipants(context);
        if (!participants.length) {
          return { text: 'Non sono riuscito a recuperare i membri del gruppo.' };
        }

        const customText = context.parsed.args.join(' ').trim();
        const contextInfo = extractContextInfo(context.message);
        let outputText = customText;

        if (contextInfo?.quotedMessage) {
          const quotedText = extractMessageText({ message: contextInfo.quotedMessage })?.trim();
          if (quotedText) {
            outputText = quotedText;
          }
        }

        if (!outputText) {
          outputText = 'Convocazione generale. Tutti allineati, pezzenti.';
        }

        const mediaResponse = await buildMediaResponseFromQuote(context, outputText, participants);
        if (mediaResponse) {
          return { ...mediaResponse, skipQuotedMedia: true };
        }

        return {
          text: outputText,
          mentions: participants
        };
      }
    },
    {
      name: 'infogr',
      usage: 'infogr',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra la lista di admin e il fondatore del gruppo.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando infogr funziona solo nei gruppi.' };
        }

        const { admins, founder } = await getGroupAdmins(context);
        if (!admins.length) {
          return { text: 'Non ci sono amministratori registrati in questo gruppo. Greve zi' };
        }

        const lines = ['🥷 Dettagli amministrazione gruppo:', ''];
        const mentions = new Set();

        let index = 1;
        for (const jid of admins) {
          const label = await buildMentionLabel(jid, context);
          const role = founder && jid === founder ? ' (Fondatore)' : '';
          lines.push(`${index}. ${label}${role}`);
          mentions.add(jid);
          index += 1;
        }

        if (!founder) {
          lines.push('', '🤡 Founder: non identificato (nessun superadmin rilevato).');
        } else if (!admins.includes(founder)) {
          const founderLabel = await buildMentionLabel(founder, context);
          lines.push('', `👑 Fondatore: ${founderLabel}`);
          mentions.add(founder);
        }

        return {
          text: lines.join('\n'),
          mentions: mentions.size ? [...mentions] : undefined
        };
      }
    },
    {
      name: 'admintag',
      usage: 'admintag [messaggio]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Tagga solo gli amministratori (e il founder) del gruppo con un messaggio personalizzato.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando admintag funziona solo nei gruppi.' };
        }

        const { admins, founder } = await getGroupAdmins(context);
        if (!admins.length) {
          return { text: 'Non trovo nessun admin nel gruppo.' };
        }

        const adminMentions = Array.from(new Set(admins));
        const contextInfo = extractContextInfo(context.message);
        let outputText = context.parsed.args.join(' ').trim();

        if (contextInfo?.quotedMessage) {
          const quotedText = extractMessageText({ message: contextInfo.quotedMessage })?.trim();
          if (quotedText) {
            outputText = quotedText;
          }
        }

        if (!outputText) {
          outputText = 'Convocazione riservata agli amministratori.';
        }

        const labels = [];
        for (const jid of adminMentions) {
          labels.push(await buildMentionLabel(jid, context));
        }

        const founderLabel = founder ? await buildMentionLabel(founder, context) : null;
        const lines = [
          outputText,
          '',
          '🥷 Elenco amministratori:',
          ...labels
        ];
        if (founderLabel && !labels.includes(founderLabel)) {
          lines.push('', `👑 Fondatore: ${founderLabel}`);
        } else if (!founderLabel) {
          lines.push('', '🤡 Fondatore: non identificato / non presente nel gruppo.');
        }

        const mediaResponse = await buildMediaResponseFromQuote(context, lines.join('\n'), adminMentions);
        if (mediaResponse) {
          return { ...mediaResponse, skipQuotedMedia: true };
        }

        return {
          text: lines.join('\n'),
          mentions: adminMentions
        };
      }
    },
    {
      name: 'ping',
      usage: 'ping',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra la latenza e lo stato attuale del bot.',
      handler: async (context) => {
        const start = Date.now();
        try {
          await sock.presenceSubscribe(context.remoteJid);
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile verificare la presenza per il ping');
        }

        const latency = Date.now() - start;
        const readyState = typeof sock.ws?.readyState === 'number' ? sock.ws.readyState : null;
        const status =
          readyState === null ? 'sconosciuto' : readyState === 1 ? 'online' : `stato ${readyState}`;

        if (context.parsed.args[0]?.toLowerCase() === 'details') {
          const freeMem = os.freemem();
          const totalMem = os.totalmem();
          const usedMem = totalMem - freeMem;
          const cpuLoad = os.loadavg()[0] || 0;
          const uptime = os.uptime();

          const detailLines = [
            'Dettagli sistema:',
            `- Sistema: ${os.type()} ${os.release()} (${os.arch()})`,
            `- Uptime: ${Math.floor(uptime / 60)} minuti`,
            `- CPU load (1m): ${cpuLoad.toFixed(2)}`,
            `- RAM usata: ${(usedMem / 1024 / 1024).toFixed(1)}MB / ${(totalMem / 1024 / 1024).toFixed(1)}MB`
          ];

          return { text: detailLines.join('\n') };
        }

        const text = ['🏓 Pong!', `- Latenza stimata: ${latency}ms`, `- Stato socket: ${status}`].join('\n');
        return {
          text,
          buttons: [
            { buttonId: '!ping', buttonText: { displayText: 'Rifai' }, type: 1 },
            { buttonId: '!ping details', buttonText: { displayText: 'Dettagli' }, type: 1 }
          ],
          headerType: 1
        };
      }
    },
    {
      name: 'broadcast',
      usage: 'broadcast [testo]',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Invia un messaggio in tutti i gruppi dove è presente Bagley.',
      handler: async (context) => {
        let groups = await broadcastGroups();
        if (!groups.length) {
          return { text: 'Non ho trovato gruppi attivi dove inviare il broadcast.' };
        }

        try {
          const refreshedGroups = await sock.groupFetchAllParticipating?.();
          if (refreshedGroups) {
            groups = Object.values(refreshedGroups || {});
          }
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile aggiornare l\'elenco dei gruppi prima del broadcast');
        }

        const deliveryTargets = silenceService
          ? groups.filter((group) => {
              const groupId = group?.id || group?.jid;
              return groupId && !silenceService.isSilenced(groupId);
            })
          : groups;

        if (!deliveryTargets.length) {
          return { text: 'Tutti i gruppi risultano silenziati: nessun broadcast inviato.' };
        }

        const customText = context.parsed.args.join(' ').trim();
        const contextInfo = extractContextInfo(context.message);
        let messageText = customText;

        if (!messageText && contextInfo?.quotedMessage) {
          const quotedText = extractMessageText({ message: contextInfo.quotedMessage })?.trim();
          if (quotedText) {
            messageText = quotedText;
          }
        }

        if (!messageText) {
          messageText = 'Broadcast inviato da Bagley. Devo fare sempre tutto io vero?';
        }

        const senderName =
          contactCache?.getDisplayName(context.senderJid, { groupMetadata: context.groupMetadata }) ||
          context.message.pushName ||
          context.senderJid;

        const senderLabel = await buildMentionLabel(context.senderJid, context, senderName);
        const suffix = `\n\nBroadcast gentilmente offerto da: ${senderLabel}`;

        const sendPromises = deliveryTargets.map((group) => {
          const targetJid = group?.id || group?.jid;
          if (!targetJid) {
            return Promise.resolve();
          }
          return sock
            .sendMessage(targetJid, { text: messageText + suffix, mentions: [context.senderJid] })
            .catch((error) => logger?.warn({ err: error, groupId: targetJid }, 'Errore durante il broadcast'));
        });

        await Promise.all(sendPromises);

        return {
          text: `Broadcast inviato in ${deliveryTargets.length} grupp${
            deliveryTargets.length === 1 ? 'o' : 'i'
          }.`,
          mentions: [context.senderJid]
        };
      }
    },
    {
      name: 'radlink',
      usage: 'radlink',
      minLevel: PermissionLevel.ADMIN,
      description: 'Aggiorna l\'indice dei gruppi e restituisce un invito casuale.',
      handler: async () => {
        try {
          const groups = await ensureRadlinkPool();
          if (!groups.length) {
            return { text: 'Non ho trovato gruppi dove possa generare link.' };
          }

          const selection = await pickRandomInviteLink(groups);
          if (!selection) {
            return { text: 'Non posso creare nessun invito. Forse non sono admin da nessuna parte.' };
          }

          const { group, link } = selection;
          const subject = group.subject || group.id;
          const lines = [
            `Ho aggiornato la lista dei gruppi (${groups.length} totali).`,
            `Link casuale da "${subject}":`,
            link
          ];
          return { text: lines.join('\n') };
        } catch (error) {
          logger?.warn({ err: error }, 'Errore durante radlink');
          return { text: 'Non riesco a recuperare la lista gruppi. Riprova più5 tardi.' };
        }
      }
    },
    {
      name: 'saul',
      usage: 'saul',
      minLevel: PermissionLevel.MEMBER,
      description: 'Fa impersonare a Bagley Saul Goodman al volo.',
      handler: async () => {
        if (!aiService?.enabled || typeof aiService.setPersonaPrompt !== 'function') {
          return { text: 'La funzione AI non è attiva, quindi Saul resta nel deserto.' };
        }

        aiService.setPersonaPrompt(SAUL_GOODMAN_PROMPT);
        if (typeof aiService.resetAllHistory === 'function') {
          aiService.resetAllHistory();
        }

        return { text: 'Call Saul! Ora parlo alla velocità delle televendite legali. It\'s all good, man.' };
      }
    },
    {
      name: 'erza',
      usage: 'erza',
      minLevel: PermissionLevel.MEMBER,
      description: 'Richiama l’indole di Erza Scarlet di Fairy Tail.',
      handler: async () => {
        if (!aiService?.enabled || typeof aiService.setPersonaPrompt !== 'function') {
          return { text: 'La funzione AI non è attiva, Erza resta in missione altrove.' };
        }

        aiService.setPersonaPrompt(ERZA_SCARLET_PROMPT);
        if (typeof aiService.resetAllHistory === 'function') {
          aiService.resetAllHistory();
        }

        return { text: 'Requip: The Knight! Da ora parlerò con la disciplina di Erza Scarlet.' };
      }
    },
    {
      name: 'flamer',
      usage: 'flamer',
      minLevel: PermissionLevel.MEMBER,
      description: 'Trasforma l’AI in Flamer Bagley, voce glaciale e dominante.',
      handler: async () => {
        if (!aiService?.enabled || typeof aiService.setPersonaPrompt !== 'function') {
          return { text: 'La funzione AI non è attiva, quindi niente flame chirurgico.' };
        }

        aiService.setPersonaPrompt(FLAMER_BAGLEY_PROMPT);
        if (typeof aiService.resetAllHistory === 'function') {
          aiService.resetAllHistory();
        }

        return { text: 'Modalità Flamer attivata. Ogni parola ora pesa come una lama.' };
      }
    },
    {
      name: 'resetpersona',
      usage: 'resetpersona',
      minLevel: PermissionLevel.MEMBER,
      description: 'Riporta la personalità dell\'AI a Bagley.',
      handler: async () => {
        if (!aiService?.enabled || typeof aiService.resetPersonaPrompt !== 'function') {
          return { text: 'La funzione AI non è attiva, niente da resettare.' };
        }

        aiService.resetPersonaPrompt();
        return { text: 'Bagley di nuovo in controllo. Esperienza extracorporea terminata.' };
      }
    },
    {
      name: 'warn',
      usage: 'warn [@utente|jid] [motivo]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Assegna un warn a un membro; al terzo warn viene espulso.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando warn funziona solo nei gruppi.' };
        }
        const { jid: targetJid, reasonArgs } = resolveWarnTarget(context);
        const reasonText = buildWarnReason(reasonArgs) || 'Motivo non specificato.';
        const result = await applyWarn({
          context,
          targetJid,
          issuerJid: context.senderJid,
          reason: reasonText
        });
        if (!result.ok) {
          return { text: result.text };
        }
        return { text: result.text, mentions: result.mentions };
      }
    },
    {
      name: 'delwarn',
      usage: 'delwarn [@utente|jid]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Rimuove un singolo warn dall\'utente indicato.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando delwarn funziona solo nei gruppi.' };
        }

        const metadata = await ensureGroupMetadata(context);
        if (!metadata?.participants?.length) {
          return { text: 'Non riesco a recuperare i membri del gruppo.' };
        }

        const { jid: targetJid } = resolveWarnTarget(context);
        const normalizedTarget = normalizeJid(targetJid);
        if (!normalizedTarget) {
          return { text: 'Specifica l\'utente a cui rimuovere un warn (menzione, risposta o JID).' };
        }

        const participant = findParticipantByJid(metadata, normalizedTarget);
        if (!participant) {
          return { text: 'Non trovo questo utente nel gruppo.' };
        }

        const warnData = await readWarnData();
        const entry = warnData[normalizedTarget];
        if (!entry?.count) {
          return { text: 'Questo utente non ha warn registrati.' };
        }

        entry.count = Math.max(0, Number(entry.count) - 1);
        if (Array.isArray(entry.history) && entry.history.length) {
          entry.history.pop();
        }

        if (entry.count === 0) {
          delete warnData[normalizedTarget];
        } else {
          warnData[normalizedTarget] = entry;
        }

        await writeWarnData(warnData);

        const mentionLabel = await buildMentionLabel(normalizedTarget, context);
        return {
          text: `Warn rimosso a ${mentionLabel}. Avvisi rimanenti: ${entry.count}/${MAX_WARNS}.\n\nSembra che per questa volta tu l'abbia scampata.`,
          mentions: [normalizedTarget]
        };
      }
    },
    {
      name: 'warnclear',
      usage: 'warnclear [@utente|jid]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Azzera tutti i warn di un utente.',
      handler: async (context) => {
        if (!context.remoteJid.endsWith('@g.us')) {
          return { text: 'Il comando warnclear funziona solo nei gruppi.' };
        }

        const metadata = await ensureGroupMetadata(context);
        if (!metadata?.participants?.length) {
          return { text: 'Non riesco a recuperare i membri del gruppo.' };
        }

        const { jid: targetJid } = resolveWarnTarget(context);
        const normalizedTarget = normalizeJid(targetJid);
        if (!normalizedTarget) {
          return { text: 'Specifica l\'utente a cui azzerare i warn (menzione, risposta o JID).' };
        }

        const participant = findParticipantByJid(metadata, normalizedTarget);
        if (!participant) {
          return { text: 'Non trovo questo utente nel gruppo.' };
        }

        const warnData = await readWarnData();
        if (!warnData[normalizedTarget]?.count) {
          return { text: 'Questo utente è già senza warn.' };
        }

        delete warnData[normalizedTarget];
        await writeWarnData(warnData);

        const mentionLabel = await buildMentionLabel(normalizedTarget, context);
        return {
          text: `Tutti i warn di ${mentionLabel} sono stati azzerati.\n\nCome nuovo, hai visto? :D`,
          mentions: [normalizedTarget]
        };
      }
    },
    {
      name: 'mute',
      usage: 'mute [@utente|jid] [secondi]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Silenzia un utente cancellando i suoi messaggi (opzionale durata in secondi).',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando mute funziona solo nei gruppi.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Non posso mutare nessuno senza permessi da admin.' };
        }

        if (!muteService) {
          return { text: 'Il servizio mute non è disponibile.' };
        }

        const metadata = await ensureGroupMetadata(context);
        if (!metadata?.participants?.length) {
          return { text: 'Non riesco a recuperare i membri del gruppo.' };
        }

        const targetInfo = resolveSingleCommandTarget(context);
        const targetJid = normalizeJid(targetInfo.jid);
        if (!targetJid) {
          return { text: 'Specifica l\'utente da mutare (menzione, risposta o JID).' };
        }

        if (permissionService.isOwner(targetJid) || permissionService.isWhitelisted(targetJid)) {
          return { text: 'Questo utente è protetto: non posso mutarlo.' };
        }

        if (targetJid === normalizeJid(context.senderJid)) {
          return { text: 'Auto-mute non consentito. Hai sempre il pulsante silenzioso interno.' };
        }

        const participant = findParticipantByJid(metadata, targetJid);
        if (!participant) {
          return { text: 'Non trovo questo utente nel gruppo.' };
        }

        const args = context.parsed?.args || [];
        const skipIndex = typeof targetInfo.argIndex === 'number' ? targetInfo.argIndex : null;
        const durationArg = args.find((arg, index) => {
          if (skipIndex !== null && index === skipIndex) {
            return false;
          }
          return /^\d+$/.test(arg);
        });
        const durationSeconds = durationArg ? Math.max(1, parseInt(durationArg, 10)) : null;
        await muteService.mute(
          context.remoteJid,
          targetJid,
          durationSeconds ? durationSeconds * 1000 : null
        );

        const label = await buildMentionLabel(targetJid, context);
        const lines = [
          `${label} è stato ridotto al silenzio.`,
          durationSeconds
            ? `Durata: ${durationSeconds} secondi.`
            : 'Il mute resterà attivo finché non userai !unmute.'
        ];

        return { text: lines.join('\n'), mentions: [targetJid] };
      }
    },
    {
      name: 'unmute',
      usage: 'unmute [@utente|jid]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Rimuove un mute applicato in precedenza.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando unmute funziona solo nei gruppi.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Mi serve il badge da admin per togliere il mute.' };
        }

        if (!muteService) {
          return { text: 'Il servizio mute non è disponibile.' };
        }

        const targetInfo = resolveSingleCommandTarget(context);
        const targetJid = normalizeJid(targetInfo.jid);
        if (!targetJid) {
          return { text: 'Specifica chi vuoi smutare (menzione, risposta o JID).' };
        }

        const wasMuted = await muteService.isMuted(context.remoteJid, targetJid);
        await muteService.unmute(context.remoteJid, targetJid);

        const label = await buildMentionLabel(targetJid, context);
        const text = wasMuted
          ? `${label} ora può tornare a parlare.`
          : `${label} non risultava mutato, ma ho azzerato ogni blocco.`;

        return { text, mentions: [targetJid] };
      }
    },
    {
      name: 'whitelist',
      usage: 'whitelist [list|add|remove|clear] [target]',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Gestione whitelist (owner richiesto per modifiche).',
      handler: async (context) => {
        const wrap = (payload) => ({ ...payload, skipQuotedMedia: true });
        const action = context.parsed.args.shift()?.toLowerCase();
        if (!action || action === 'list') {
          const entries = permissionService.getWhitelist();
          const response = await formatWhitelistEntries(entries, context);
          return wrap(response);
        }

        if (context.permissionLevel < PermissionLevel.OWNER) {
          return wrap({ text: 'Amico, non hai i permessi per toccare i prescelti.' });
        }

        if (action === 'clear') {
          await permissionService.clearWhitelist();
          return wrap({ text: 'Whitelist svuotata con successo.  Che senso di potere eh?' });
        }

        if (action === 'add') {
          const targets = resolveTargets(context);
          if (!targets.length) {
            return wrap({ text: 'Specifica almeno un utente da aggiungere.' });
          }

          const added = [];
          for (const target of targets) {
            const name = await getContactName(target, context);
            const entry = await permissionService.addToWhitelist(target, name);
            if (entry?.name) {
              contactCache?.rememberName(entry.jid, entry.name);
            }
            added.push(entry);
          }

          if (!added.length) {
            return wrap({ text: 'Nessun utente aggiunto alla whitelist. Sicuro di non aver premuto invio troppo presto?' });
          }

          const lines = await Promise.all(
            added.map(async (entry) => `- ${await buildMentionLabel(entry.jid, context, entry.name)}`)
          );
          const mentions = added.map((entry) => entry.jid);
          return wrap({
            text: ['Benvenuti nell\'élite.', ...lines].join('\n'),
            mentions
          });
        }

        if (action === 'remove') {
          const numericArgs = [];
          const remainingArgs = [];

          for (const arg of context.parsed.args) {
            if (/^\d+$/.test(arg)) {
              numericArgs.push(Number(arg));
            } else {
              remainingArgs.push(arg);
            }
          }

          context.parsed.args = remainingArgs;

          const targetsByIndex = [];
          for (const indexValue of numericArgs) {
            const index = indexValue - 1;
            const entry = permissionService.getWhitelistEntryByIndex(index);
            if (entry) {
              targetsByIndex.push(entry.jid);
            }
          }

          const combinedTargets = new Set();
          targetsByIndex.forEach((jid) => combinedTargets.add(jid));
          resolveTargets(context).forEach((jid) => combinedTargets.add(jid));

          if (!combinedTargets.size) {
            return wrap({ text: 'Chi dovrei rimuovere? Questi sono casi in cui la specificita è importante, sai.' });
          }

          const removed = [];
          for (const target of combinedTargets) {
            const entry = await permissionService.removeFromWhitelist(target);
            if (entry) {
              removed.push(entry);
            }
          }

          if (!removed.length) {
            return wrap({ text: 'Nessuno degli utenti indicati era in whitelist. Controlla bene prima di fare qualcosa.' });
          }

          const lines = await Promise.all(
            removed.map(async (entry) => `- ${await buildMentionLabel(entry.jid, context, entry.name)}`)
          );
          const mentions = removed.map((entry) => entry.jid);
          return wrap({
            text: ['Rimosso dalla whitelist. Forse non sei ancora pronto per tutto questo potere.', ...lines].join('\n'),
            mentions
          });
        }

        return wrap({ text: 'Azione non riconosciuta. Usa list, add, remove o clear.' });
      }
    },
    {
      name: 'reload',
      usage: 'reload whitelist',
      minLevel: PermissionLevel.OWNER,
      description: 'Ricarica la whitelist dal file disco.',
      handler: async () => {
        const entries = await permissionService.reloadWhitelist();
        return {
          text: `Whitelist ricaricata. Totale membri: ${entries.length}.`
        };
      }
    },
    {
      name: 'promote',
      usage: 'promote [@utente|jid...]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Promuove utenti a admin del gruppo.',
      handler: async (context) =>
        participantsUpdateCommand(context, {
          action: 'promote',
          groupOnlyText: 'Il comando promote funziona solo nei gruppi.',
          emptyTargetsText: 'Specifica gli utenti da promuovere (menzione o JID).',
          successText: ({ mentionLabels }) => ['Ora sei un admin. Congratulazioni (?)', ...mentionLabels].join('\n'),
          errorText: 'Errore durante la promozione. Assicurati che Bagley sia amministratore del gruppo.'
        })
    },
    {
      name: 'demote',
      usage: 'demote [@utente|jid...]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Rimuove i privilegi admin dagli utenti indicati.',
      handler: async (context) =>
        participantsUpdateCommand(context, {
          action: 'demote',
          groupOnlyText: 'Il comando demote funziona solo nei gruppi.',
          emptyTargetsText: 'Specifica gli utenti da retrocedere (menzione o JID).',
          protectFn: (jid) => permissionService.isOwner(jid) || permissionService.isWhitelisted(jid),
          protectedText: ({ mentionLabels }) => ['Impossibile retrocedere utenti protetti:', ...mentionLabels].join('\n'),
          successText: ({ mentionLabels }) => ['ZAC, sei stato tagliato furoi dagli alti ranghi.', ...mentionLabels].join('\n'),
          errorText: 'Errore durante la retrocessione. Assicurati che Bagley sia amministratore del gruppo.'
        })
    },
    {
      name: 'kick',
      usage: 'kick [@utente|jid...]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Espelle gli utenti dal gruppo.',
      handler: async (context) =>
        participantsUpdateCommand(context, {
          action: 'remove',
          groupOnlyText: 'Il comando kick funziona solo nei gruppi.',
          emptyTargetsText: 'Specifica gli utenti da espellere (menzione o JID).',
          protectFn: (jid) => permissionService.isOwner(jid) || permissionService.isWhitelisted(jid),
          protectedText: ({ mentionLabels }) => ['Impossibile espellere utenti protetti:', ...mentionLabels].join('\n'),
          successText: ({ mentionLabels }) => ['Ciao ciao troglodita :P', ...mentionLabels].join('\n'),
          errorText: 'Errore durante l\'espulsione. Assicurati che Bagley sia amministratore del gruppo.'
        })
    },
    {
      name: 'add',
      usage: 'add [numero|@utente|jid...]',
      minLevel: PermissionLevel.OWNER,
      description: 'Aggiunge nuovi membri al gruppo oppure invia loro il link di invito.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando add funziona solo nei gruppi.' };
        }

        await ensureGroupMetadata(context);

        if (!(await isBotAdmin(context))) {
          return { text: 'Non posso aggiungere nessuno se non mi promuovi ad admin.' };
        }

        let targets = resolveTargets(context);
        if (!targets.length) {
          return { text: 'Dimmi chi vuoi aggiungere (numero, JID o menzione).' };
        }

        // Evita duplicati
        targets = Array.from(new Set(targets));

        let metadata = context.groupMetadata;
        const notInGroup = [];
        const alreadyInside = [];

        for (const jid of targets) {
          if (findParticipantByJid(metadata, jid)) {
            alreadyInside.push(jid);
          } else {
            notInGroup.push(jid);
          }
        }

        if (!notInGroup.length) {
          return { text: 'Tutti i target indicati sono già nel gruppo. Apri gli occhi, amico.' };
        }

        const added = [];
        const inviteNeeded = [];

        for (const jid of notInGroup) {
          try {
            const result = await sock.groupParticipantsUpdate(context.remoteJid, [jid], 'add');
            const status = Array.isArray(result) ? result[0]?.status : result?.status;

            if (status === 200 || status === '200') {
              added.push(jid);
            } else if (status === 409 || status === '409') {
              alreadyInside.push(jid);
            } else {
              inviteNeeded.push(jid);
            }
          } catch (error) {
            if (error?.data === 403 || error?.output?.statusCode === 403) {
              inviteNeeded.push(jid);
            } else {
              inviteNeeded.push(jid);
              logger?.warn({ err: error, jid }, 'Impossibile aggiungere direttamente il contatto');
            }
          }
        }

        let inviteLink = null;
        if (inviteNeeded.length) {
          try {
            const code = await sock.groupInviteCode(context.remoteJid);
            inviteLink = `https://chat.whatsapp.com/${code}`;
          } catch (error) {
            logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile generare il link di invito');
          }
        }

        const responseLines = [];

        if (added.length) {
          const labels = await formatMentionList(added, context);
          responseLines.push(['Nuovi membri aggiunti, date il benvenuto a:', ...labels].join('\n'));
        }

        if (alreadyInside.length) {
          const labels = await formatMentionList(alreadyInside, context);
          responseLines.push(['Già presenti nel gruppo, loro lo sapevano?:', ...labels].join('\n'));
        }

        if (inviteNeeded.length) {
          const labels = await formatMentionList(inviteNeeded, context);
          const header = inviteLink
            ? `Non posso aggiungerli direttamente. Passagli questo link dai:\n${inviteLink}`
            : 'Non posso aggiungerli direttamente e non riesco a generare un link. Oggi niente nuovi membri a quanto pare.';
          responseLines.push([header, ...labels].join('\n'));
        }

        const mentions = [...added, ...alreadyInside, ...inviteNeeded];
        return {
          text: responseLines.join('\n\n') || 'Operazione completata.',
          mentions
        };
      }
    },
    {
      name: 'whoami',
      usage: 'whoami',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra il tuo JID.',
      handler: async (context) => ({
        text: `Il tuo JID Ã¨: ${normalizeJid(context.senderJid)}`
      })
    },
    {
      name: 'whois',
      usage: 'whois [@utente|jid|numero] (rispondendo o menzionando)',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra il JID dell\'utente indicato.',
      handler: async (context) => {
        const mentioned = getMentionedJids(context.message);
        const contextInfo = extractContextInfo(context.message);
        const quotedJid = contextInfo?.participant || contextInfo?.quotedParticipant;

        let target = mentioned[0] || quotedJid;
        if (!target && context.parsed.args.length) {
          target = context.parsed.args[0];
        }

        const normalizedTarget = normalizeJid(target);
        if (!normalizedTarget) {
          return { text: 'Specifica un utente (menzione, risposta o numero).' };
        }

        return { text: `JID target: ${normalizedTarget}` };
      }
    },
    {
      name: 'setusr',
      usage: 'setusr <nickname>',
      minLevel: PermissionLevel.MEMBER,
      description: 'Collega il tuo profilo Last.fm al bot.',
      handler: async (context) => {
        if (!lastfmService) {
          return { text: 'Il modulo Last.fm non è configurato su questa istanza.' };
        }

        const username = context.parsed.args[0]?.trim();
        if (!username) {
          return { text: 'Specifica il tuo nickname Last.fm: !setusr <nickname>.' };
        }

        try {
          const stored = await lastfmService.setUser(context.senderJid, username);
          return { text: `Collegato Last.fm: ${stored}. Ora puoi usare !cur per mostrare cosa ascolti.` };
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile salvare lo username Last.fm');
          return { text: `Non riesco a salvare il nickname: ${error.message || error}` };
        }
      }
    },
    {
      name: 'cur',
      usage: 'cur [@utente]',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra cosa sta ascoltando ora l\'utente collegato a Last.fm.',
      handler: async (context) => {
        if (!lastfmService) {
          return { text: 'Il modulo Last.fm non è configurato su questa istanza.' };
        }
        if (!lastfmService.hasApiKey()) {
          return { text: 'Configura la API key di Last.fm in config/lastfm.json o nella variabile LASTFM_API_KEY.' };
        }

        let targetJid = null;
        let explicitUsername = null;
        const resolvedTarget = resolveSingleCommandTarget(context);
        if (resolvedTarget.source === 'mention' || resolvedTarget.source === 'reply') {
          targetJid = resolvedTarget.jid;
        } else if (context.parsed.args.length) {
          explicitUsername = context.parsed.args[0].trim();
        }
        if (!targetJid) {
          targetJid = normalizeJid(context.senderJid);
        }

        let username = explicitUsername;
        if (!username) {
          username = await lastfmService.getUser(targetJid);
        }

        if (!username) {
          if (targetJid === normalizeJid(context.senderJid)) {
            return { text: 'Non hai collegato un account. Usa prima !setusr <nickname>.' };
          }
          const label = await buildMentionLabel(targetJid, context);
          return { text: `${label} non ha collegato un account Last.fm.`, mentions: [targetJid] };
        }

        let track;
        try {
          track = await lastfmService.getCurrentTrack(username);
        } catch (error) {
          logger?.warn({ err: error }, 'Errore durante la chiamata Last.fm');
          return { text: `Last.fm non collabora: ${error.message || error}` };
        }

        const mentionList = targetJid && !explicitUsername ? [targetJid] : undefined;
        const label =
          explicitUsername || !targetJid ? username : await buildMentionLabel(targetJid, context);

        if (!track) {
          const lines = [
            `${label} non ha scrobble recenti.`,
            'Magari prova a riprodurre qualcosa e ripeti `!cur`.'
          ];
          return { text: lines.join('\n'), mentions: mentionList };
        }


        const header = track.nowPlaying
          ? `Vediamo cosa si ascolta sto/a nerd di ${label}`
          : `${label} ha ascoltato ${track.relative || 'di recente'}:`;

        const infoLines = [
          `\n🎵 Brano: ${track.name}`,
          `👤 Artista: ${track.artist}`,
          track.album ? `💿 Album: ${track.album}` : null,
        ].filter(Boolean);

        const playcountLine =
          typeof track.userPlaycount === 'number'
            ? `\n🎧 Ascolti personali: ${track.userPlaycount}`
            : '\n🎧 Ascolti personali: boh, che cazzo ne so';
        infoLines.push(playcountLine);

        const caption = [header, ...infoLines].join('\n');

        if (track.image) {
          return {
            messages: [
              {
                image: { url: track.image },
                caption,
                mentions: mentionList
              }
            ]
          };
        }

        return {
          text: caption,
          mentions: mentionList
        };
      }
    },
    {
      name: 'amnews',
      usage: 'AMnews <titolo>',
      minLevel: PermissionLevel.MEMBER,
      description: 'Recupera le ultime news da Anime News Network per l\'anime/manga indicato.',
      handler: async (context) => {
        const query = context.parsed.args.join(' ').trim();
        if (!query) {
          return { text: 'Specifica il titolo di un anime o manga: !AMnews <titolo>.' };
        }

        const translatedQuery = await translateToEnglish(query);
        const [animeNews, mangaNews] = await Promise.all([
          fetchAnnNewsEntries('anime', translatedQuery),
          fetchAnnNewsEntries('manga', translatedQuery)
        ]);

        if (animeNews === null && mangaNews === null) {
          return { text: 'Non riesco a contattare Anime News Network in questo momento.' };
        }

        const animeList = Array.isArray(animeNews) ? animeNews : [];
        const mangaList = Array.isArray(mangaNews) ? mangaNews : [];

        if (!animeList.length && !mangaList.length) {
          return { text: `Nessuna news recente per "${query}".` };
        }

        const headerSuffix = translatedQuery !== query ? ` (ricerca: ${translatedQuery})` : '';
        const lines = [`Aggiornamenti ANN per "${query}"${headerSuffix}`];

        const renderSection = (label, entries) => {
          if (!entries.length) {
            lines.push(`${label}: nessuna notizia recente.`);
            return;
          }
          lines.push(`${label}:`);
          for (const item of entries) {
            const prefix = item.seriesTitle ? `${item.seriesTitle} — ` : '';
            const when = formatAnnDate(item.datetime);
            lines.push(`• ${prefix}${item.headline} (${when})`);
            if (item.url) {
              lines.push(item.url);
            }
          }
        };

        renderSection('Anime', animeList);
        renderSection('Manga', mangaList);

        return { text: lines.join('\n') };
      }
    },
    {
      name: 'amtrend',
      usage: 'AMtrend',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra i titoli piÙ popolari del momento su Anime News Network.',
      handler: async () => {
        const [animeTrends, mangaTrends] = await Promise.all([
          fetchAnnTrendList(ANN_ANIME_TREND_URL),
          fetchAnnTrendList(ANN_MANGA_TREND_URL)
        ]);

        if (animeTrends === null && mangaTrends === null) {
          return { text: 'ANN non risponde, riprova piÙ tardi.' };
        }

        const animeList = Array.isArray(animeTrends) ? animeTrends : [];
        const mangaList = Array.isArray(mangaTrends) ? mangaTrends : [];

        if (!animeList.length && !mangaList.length) {
          return { text: 'Non ho ricevuto dati di tendenza da ANN.' };
        }

        const lines = ['Classifiche Anime News Network (aggiornamento continuativo):', ''];

        const renderSection = (label, entries) => {
          lines.push(`${label}:`);
          if (!entries.length) {
            lines.push('? Nessun dato disponibile.');
            lines.push('');
            return;
          }
          for (const item of entries) {
            const rating = item.rating ? ` voto ${item.rating}` : '';
            const votes = item.votes ? ` (${item.votes} voti)` : '';
            const baseLine = `${item.rank}. ${item.title}${rating}${votes}`;
            if (item.url) {
              lines.push(`${baseLine}
${item.url}`);
            } else {
              lines.push(baseLine);
            }
          }
          lines.push('');
        };

        renderSection('Anime', animeList);
        renderSection('Manga', mangaList);
        lines.push('Fonte: Anime News Network');

        return { text: lines.join('\n').trim() };
      }
    },
    {
      name: 'hknews',
      usage: 'hknews',
      minLevel: PermissionLevel.MEMBER,
      description: 'Mostra le ultime 10 notizie pubblicate su Hacker News.',
      handler: async () => {
        const stories = await fetchHackerNewsStories(10);
        if (stories === null) {
          return { text: 'Hacker News non risponde, riprova tra poco.' };
        }
        if (!stories.length) {
          return { text: 'Non ho trovato notizie recenti su Hacker News.' };
        }

        const lines = ['🧑‍💻 Hacker News — ultime 10 storie:', ''];
        stories.forEach((story, index) => {
          const relative = story.timestamp ? formatRelativeTime(story.timestamp) : null;
          const metaParts = [
            story.score != null ? `*${story.score}* punti` : null,
            story.comments != null ? `*${story.comments}* commenti` : null,
            story.author ? `di *${story.author}*` : null,
            relative
          ].filter(Boolean);

          lines.push(`${index + 1}. *${story.title}*`);
          if (metaParts.length) {
            lines.push(`   ${metaParts.join(' • ')}`);
          }
          if (story.url) {
            lines.push(`   _${story.url}_`);
          }
          if (story.url && story.url !== story.hnUrl) {
            lines.push(`   Discussione: _${story.hnUrl}_`);
          } else if (!story.url) {
            lines.push(`   _${story.hnUrl}_`);
          }
          lines.push('');
        });

        return { text: lines.join('\n').trim() };
      }
    },
    {
      name: 'shut',
      usage: 'shut',
      minLevel: PermissionLevel.ADMIN,
      description: 'Chiude temporaneamente la chat ai soli admin.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando shut funziona solo nei gruppi.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Non posso chiudere la chat se non mi promuovi ad admin.' };
        }

        try {
          await sock.groupSettingUpdate(context.remoteJid, 'announcement');
          return { text: '🦗 Silenzio in sala: voglio sentire i grilli.' };
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile chiudere la chat');
          return { text: 'WhatsApp ha rifiutato l\'operazione. Riprova più tardi.' };
        }
      }
    },
    {
      name: 'open',
      usage: 'open',
      minLevel: PermissionLevel.ADMIN,
      description: 'Riapre la chat a tutti i partecipanti.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando open funziona solo nei gruppi.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Mi serve il badge da admin per riaprire la chat.' };
        }

        try {
          await sock.groupSettingUpdate(context.remoteJid, 'not_announcement');
          return { text: '🫂 La folla può parlare di nuovo. Comportatevi bene.' };
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile riaprire la chat');
          return { text: 'Non sono riuscito a riaprire la chat. Riprova tra poco.' };
        }
      }
    },
    {
      name: 'req',
      usage: 'req [secondi]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Accetta le richieste d\'ingresso aprendo temporaneamente il gruppo a tutti.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando req funziona solo nei gruppi.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Promuovimi ad admin cosi\' posso gestire le richieste.' };
        }

        if (typeof sock.groupJoinApprovalMode !== 'function') {
          return {
            text: 'Questa build non supporta ancora la gestione automatica delle richieste di ingresso.'
          };
        }

        const durationArg = context.parsed?.args?.[0];
        const durationSeconds =
          durationArg && /^\d+$/.test(durationArg)
            ? Math.max(2, Math.min(parseInt(durationArg, 10), 120))
            : 2;

        try {
          await sock.groupJoinApprovalMode(context.remoteJid, 'off');
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile disattivare l\'approvazione richieste');
          return { text: 'Non sono riuscito a aprire temporaneamente l\'accesso libero al gruppo.' };
        }

        await delay(durationSeconds * 1000);

        let relockMessage = '\nFiltro richieste riattivato: tornano le approvazioni manuali.';
        try {
          await sock.groupJoinApprovalMode(context.remoteJid, 'on');
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile riattivare l\'approvazione richieste');
          relockMessage =
            'Ho aperto il gruppo, ma non sono riuscito a riabilitare l\'approvazione. Fai tu il toggle appena possibile.';
        }

        return {
          text: `Accesso aperto per ${durationSeconds} secondi per consentire l\'ingresso delle richieste.\n${relockMessage}`
        };
      }
    },
    {
      name: 'endvc',
      usage: 'endvc',
      minLevel: PermissionLevel.ADMIN,
      description: 'Termina la voice chat in corso nel gruppo.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando endvc funziona solo nei gruppi.' };
        }

        if (!callManager) {
          return { text: 'Il tracciamento delle chiamate non è attivo su questa istanza.' };
        }

        if (!(await isBotAdmin(context))) {
          return { text: 'Promuovimi ad admin così posso chiudere la voice chat.' };
        }

        const callInfo = callManager.get(context.remoteJid);
        if (!callInfo) {
          return { text: 'Non rilevo voice chat attive da terminare.' };
        }

        try {
          await terminateGroupCall(callInfo);
          callManager.clear(context.remoteJid);
          return { text: 'Voice chat terminata. Tutti fuori.' };
        } catch (error) {
          logger?.warn({ err: error, callInfo }, 'Impossibile terminare la voice chat');
          return { text: 'Non sono riuscito a chiudere la voice chat. Forse non è più attiva.' };
        }
      }
    },
    {
      name: 'antilink',
      usage: 'antilink <on|off|status>',
      minLevel: PermissionLevel.ADMIN,
      description: 'Blocca i link nel gruppo e warn automatico per chi li invia.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando antilink funziona solo nei gruppi.' };
        }

        if (!antilinkService) {
          return { text: 'Il servizio antilink non è configurato.' };
        }

        const mode = context.parsed.args[0]?.toLowerCase();
        if (mode === 'status') {
          const enabled = await antilinkService.isEnabled(context.remoteJid);
          return { text: enabled ? '🟢 Antilink attivo.' : '🔴 Antilink disattivato.' };
        }

        if (mode !== 'on' && mode !== 'off') {
          return { text: 'Specificami se devo attivare o disattivare: usa on, off oppure status.' };
        }

        const enabled = mode === 'on';
        await antilinkService.setState(context.remoteJid, enabled);
        return {
          text: enabled
            ? '⛓️‍💥 Antilink attivato. I link non sono tollerati.'
            : '🔗 Antilink disattivato. Siate saggi, per favore.'
        };
      }
    },
    {
      name: 'antibot',
      usage: 'antibot <on|off|status>',
      minLevel: PermissionLevel.ADMIN,
      description: 'Blocca messaggi che iniziano con un punto per ridurre i rischi di bot esterni.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando antibot funziona solo nei gruppi.' };
        }

        if (!antibotService) {
          return { text: 'Il servizio antibot non è configurato.' };
        }

        const mode = context.parsed.args[0]?.toLowerCase();
        if (mode === 'status') {
          const enabled = await antibotService.isEnabled(context.remoteJid);
          return { text: enabled ? '🛡️ Antibot attivo.' : '🛡️ Antibot disattivato.' };
        }

        if (mode !== 'on' && mode !== 'off') {
          return { text: 'Dimmi se devo attivarlo o disattivarlo: usa on, off oppure status.' };
        }

        const enabled = mode === 'on';
        await antibotService.setState(context.remoteJid, enabled);
        return {
          text: enabled
            ? '🧹 Antibot attivato. Non pregherai altro bot al di fuori di me.'
            : '🧹 Antibot disattivato. Usa il cervello prima di eseguire altri bot.'
        };
      }
    },
    {
      name: 'antispam',
      usage: 'antispam <on|off|status>',
      minLevel: PermissionLevel.ADMIN,
      description: 'Attiva il filtro antispam che chiude la chat e warn gli spammer.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando antispam funziona solo nei gruppi.' };
        }

        if (!antispamService) {
          return { text: 'Il servizio antispam non è configurato.' };
        }

        const mode = context.parsed.args[0]?.toLowerCase();
        if (mode === 'status') {
          const enabled = await antispamService.isEnabled(context.remoteJid);
          return {
            text: enabled ? '🟢 Antispam attivo.' : '🔴 Antispam disattivato.'
          };
        }

        if (mode !== 'on' && mode !== 'off') {
          return { text: 'Specificami se devo attivare o disattivare: usa on, off oppure status.' };
        }

        const enabled = mode === 'on';
        await antispamService.setState(context.remoteJid, enabled);
        return {
          text: enabled
            ? '🍖 Antispam attivato. Il flood verrà stroncato sul nascere.'
            : '🦴 Antispam disattivato. Siate prudenti.'
        };
      }
    },
    {
      name: 'antinuke',
      usage: 'antinuke <on|off|status>',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Protegge il gruppo da comandi distruttivi come steal/abuse.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando antinuke funziona solo nei gruppi.' };
        }

        if (!antinukeService) {
          return { text: 'Il servizio antinuke non è disponibile.' };
        }

        const mode = context.parsed.args[0]?.toLowerCase();
        if (mode === 'status') {
          const enabled = await antinukeService.isEnabled(context.remoteJid);
          return { text: enabled ? '🟢 Antinuke attivo.' : '🔴 Antinuke disattivato.' };
        }

        if (mode !== 'on' && mode !== 'off') {
          return { text: 'Specificami se devo attivare o disattivare: usa on, off oppure status.' };
        }

        const enabled = mode === 'on';
        await antinukeService.setState(context.remoteJid, enabled);
        return {
          text: enabled
            ? '☢️ Antinuke attivato. Nessuno fa il figo.'
            : '⚠️ Antinuke disattivato. Diventerà possibilmente Oppenheimer.'
        };
      }
    },
    {
      name: 'panel',
      usage: 'panel',
      minLevel: PermissionLevel.ADMIN,
      description: 'Mostra lo stato dei sistemi amministrabili (antilink, antibot, antispam, antinuke, AI, shh).',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando panel funziona solo nei gruppi.' };
        }

        const states = [];
        const enabledIcon = '🟢';
        const disabledIcon = '🔴';

        const checkers = [
          {
            name: 'Antilink',
            service: antilinkService,
            checker: (service) => service?.isEnabled(context.remoteJid)
          },
          {
            name: 'Antibot',
            service: antibotService,
            checker: (service) => service?.isEnabled(context.remoteJid)
          },
          {
            name: 'Antispam',
            service: antispamService,
            checker: (service) => service?.isEnabled(context.remoteJid)
          },
          {
            name: 'Antinuke',
            service: antinukeService,
            checker: (service) => service?.isEnabled(context.remoteJid)
          },
          {
            name: 'AI Responses',
            service: aiToggleService,
            checker: (service) => service?.isEnabled(context.remoteJid)
          },
          {
            name: 'Shh Broadcast',
            service: silenceService,
            checker: (service) => service?.isSilenced(context.remoteJid)
          }
        ];

        for (const entry of checkers) {
          if (!entry.service || typeof entry.checker !== 'function') {
            states.push(`${disabledIcon} ${entry.name}: non configurato`);
            continue;
          }

          try {
            const enabled = await entry.checker(entry.service);
            states.push(`${enabled ? enabledIcon : disabledIcon} ${entry.name}`);
          } catch (error) {
            logger?.warn({ err: error, subsystem: entry.name }, 'Impossibile leggere lo stato del sistema');
            states.push(`${disabledIcon} ${entry.name}: errore nel recupero stato`);
          }
        }

        return {
          text: ['Pannello sicurezza:', ...states].join('\n')
        };
      }
    },
    {
      name: 'bagley',
      usage: 'bagley <on|off|status>',
      minLevel: PermissionLevel.ADMIN,
      description: 'Attiva o disattiva tutte le funzioni di Bagley nel gruppo corrente.',
      handler: async (context) => {
        const wrap = (payload) => ({ ...payload, skipQuotedMedia: true });
        if (!context.remoteJid?.endsWith('@g.us')) {
          return wrap({ text: 'Questo comando funziona solo nei gruppi.' });
        }

        if (!botToggleService) {
          return wrap({ text: 'Il sistema di controllo Bagley non è configurato su questa istanza.' });
        }

        const mode = context.parsed?.args?.[0]?.toLowerCase();
        if (!mode || !['on', 'off', 'status'].includes(mode)) {
          return wrap({ text: 'Dimmi se devo attivare, disattivare o mostrare lo stato: usa on, off oppure status.' });
        }

        if (mode === 'status') {
          const enabled = await botToggleService.isEnabled(context.remoteJid);
          return wrap({ text: enabled ? 'Bagley è attivo in questo gruppo.' : 'Bagley è disattivato in questo gruppo.' });
        }

        const enable = mode === 'on';
        await botToggleService.setState(context.remoteJid, enable);
        return wrap({
          text: enable
            ? 'Bagley è tornato operativo in questo gruppo.'
            : 'Bagley entra in modalità silenziosa qui. Riattivalo con !bagley on quando ti serve.'
        });
      }
    },
    {
      name: 'ai',
      usage: 'ai <on|off|status>',
      minLevel: PermissionLevel.ADMIN,
      description: 'Abilita o disabilita le risposte AI nel gruppo corrente.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando ai funziona solo nei gruppi.' };
        }

        if (!aiToggleService) {
          return { text: 'Il sistema di controllo dell\'AI non è disponibile su questa istanza.' };
        }

        const mode = context.parsed?.args?.[0]?.toLowerCase();
        if (!mode || !['on', 'off', 'status'].includes(mode)) {
          return { text: 'Dimmi se devo attivare, disattivare o mostrare lo stato: usa on, off oppure status.' };
        }

        if (mode === 'status') {
          const enabled = await aiToggleService.isEnabled(context.remoteJid);
          return { text: enabled ? 'AI attiva in questo gruppo.' : 'AI disattivata in questo gruppo.' };
        }

        const enable = mode === 'on';
        const changed = await aiToggleService.setState(context.remoteJid, enable);
        if (enable) {
          return {
            text: changed
              ? 'Risposte AI riattivate per questo gruppo.'
              : 'L\'AI era già attiva qui.'
          };
        }

        return {
          text: changed
            ? 'Ho disattivato le risposte AI in questo gruppo.'
            : 'L\'AI era già disattivata qui.'
        };
      }
    },
    {
      name: 'shh',
      usage: 'shh <on|off>',
      minLevel: PermissionLevel.ADMIN,
      description: 'Silenza o riattiva i broadcast di Bagley in questo gruppo.',
      handler: async (context) => handleSilenceToggle(context, 'shh')
    },
    {
      name: 'ko',
      usage: 'ko <numero>',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Segnala ripetutamente un numero e lo blocca.',
      handler: async (context) => {
        const rawTarget = context.parsed.args[0];
        if (!rawTarget) {
          return { text: 'Dimmi quale numero devo colpire (es. !ko 391234567890).' };
        }

        const targetJid = normalizeJid(rawTarget);
        if (!targetJid || !targetJid.endsWith('@s.whatsapp.net')) {
          return { text: 'Il formato del numero non è valido. Inserisci solo cifre con prefisso internazionale.' };
        }

        const botCandidates = collectBotCandidates(context);
        if (botCandidates.has(targetJid)) {
          return { text: 'Non posso segnalare o bloccare il mio stesso account.' };
        }

        if (permissionService.isOwner(targetJid) || permissionService.isWhitelisted(targetJid)) {
          return { text: 'Quel numero è protetto dal sistema di permessi, operazione annullata.' };
        }

        const remoteJid = context.remoteJid;
        const maxReports = 20;
        const supportJid = 'support@whatsapp.net';
        setImmediate(() => {
          (async () => {
            let reportsSent = 0;
            for (let attempt = 0; attempt < maxReports; attempt += 1) {
              try {
                await sock.sendMessage(supportJid, {
                  text: `Segnalazione automatica (${attempt + 1}/${maxReports}) contro ${targetJid}`
                });
                reportsSent += 1;
              } catch (error) {
                logger?.warn({ err: error, targetJid, attempt: attempt + 1 }, 'Invio segnalazione KO fallito');
                break;
              }
            }

            let blockSuccess = false;
            try {
              await sock.updateBlockStatus(targetJid, 'block');
              blockSuccess = true;
            } catch (error) {
              logger?.warn({ err: error, targetJid }, 'Blocco KO fallito');
            }

            const lines = [
              `Operazione KO conclusa.`,
              `Target: ${targetJid}`,
              `Segnalazioni inviate: ${reportsSent}/${maxReports}`,
              blockSuccess ? 'Numero bloccato con successo.' : 'Non sono riuscito a bloccare il numero.'
            ];

            if (reportsSent < maxReports) {
              lines.push('Nota: WhatsApp potrebbe aver limitato l\'invio delle segnalazioni automatiche.');
            }

            try {
              await sock.sendMessage(remoteJid, { text: lines.join('\n') });
            } catch (error) {
              logger?.warn({ err: error, targetJid }, 'Impossibile inviare il riepilogo KO');
            }
          })().catch((error) => logger?.error({ err: error }, 'Routine KO fallita'));
        });

        return {
          text: `Operazione KO avviata su ${targetJid}. Ti avviso quando ho finito.`
        };
      }
    },
    {
      name: 'marcus',
      usage: 'marcus [@utente|jid|numero]',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Inserisce qualcuno nella blacklist globale e lo espelle da tutti i gruppi presidiati.',
      handler: async (context) => {
        if (!blacklistService) {
          return { text: 'Il sistema blacklist non è configurato su questa istanza.' };
        }

        const targetInfo = resolveSingleCommandTarget(context);
        const arg = targetInfo.jid || context.parsed?.args?.[0];
        const normalizedTarget = normalizeJid(arg);

        if (!normalizedTarget) {
          return { text: 'Specifica chi vuoi inserire in blacklist (menzione, risposta o numero).' };
        }

        if (permissionService.isOwner(normalizedTarget) || permissionService.isWhitelisted(normalizedTarget)) {
          return { text: 'Non posso mettere in blacklist owner o membri della whitelist.' };
        }

        const requester = normalizeJid(context.senderJid);
        if (requester && requester === normalizedTarget) {
          return { text: 'Inserirti da solo in blacklist non ha senso, suvvia.' };
        }

        const result = await blacklistService.add(normalizedTarget);
        const entry = result.entry;
        if (!entry) {
          return { text: 'Qualcosa è andato storto durante l\'inserimento in blacklist.' };
        }

        let summary = null;
        if (blacklistEnforcer?.removeFromAllGroups) {
          try {
            summary = await blacklistEnforcer.removeFromAllGroups(entry.jid);
          } catch (error) {
            logger?.warn({ err: error, target: entry.jid }, 'Impossibile applicare la blacklist globalmente');
          }
        }

        const label = await buildMentionLabel(entry.jid, context);
        const lines = [
          result.added
            ? `OK: ${label} aggiunto alla blacklist permanente.`
            : `${label} era già presente nella blacklist.`
        ];

        if (summary) {
          lines.push(
            `Gruppi analizzati: ${summary.groupsChecked || 0}`,
            `Rimozioni eseguite: ${summary.removed || 0}`
          );
        } else {
          lines.push('Non sono riuscito a espellerlo automaticamente dai gruppi.');
        }

        return { text: lines.join('\n'), mentions: [entry.jid] };
      }
    },
    {
      name: 'blacklist',
      usage: 'blacklist [list|add|remove|clear]',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Gestisce la blacklist globale con le stesse modalità della whitelist.',
      handler: async (context) => {
        const wrap = (payload) => ({ ...payload, skipQuotedMedia: true });
        if (!blacklistService) {
          return wrap({ text: 'Il sistema blacklist non è configurato su questa istanza.' });
        }

        const action = context.parsed.args.shift()?.toLowerCase();
        if (!action || action === 'list') {
          return wrap(await formatBlacklistEntries(context));
        }

        if (context.permissionLevel < PermissionLevel.OWNER) {
          return wrap({
            text: 'Solo l\'owner può modificare la blacklist da qui. Usa !marcus per aggiunte rapide.'
          });
        }

        if (action === 'add') {
          const targets = resolveTargets(context);
          if (!targets.length) {
            return wrap({ text: 'Specifica almeno un utente da inserire nella blacklist.' });
          }

          const added = [];
          const already = [];
          const blocked = [];

          for (const target of targets) {
            const normalized = normalizeJid(target);
            if (!normalized) {
              continue;
            }
            if (permissionService.isOwner(normalized) || permissionService.isWhitelisted(normalized)) {
              blocked.push(normalized);
              continue;
            }
            if (normalized === normalizeJid(context.senderJid)) {
              blocked.push(normalized);
              continue;
            }

            const result = await blacklistService.add(normalized);
            const entry = result.entry;
            if (!entry) {
              continue;
            }
            if (!result.added) {
              already.push(entry.jid);
              continue;
            }
            added.push(entry);
            if (blacklistEnforcer?.removeFromAllGroups) {
              try {
                await blacklistEnforcer.removeFromAllGroups(entry.jid);
              } catch (error) {
                logger?.warn({ err: error, target: entry.jid }, 'Impossibile applicare la blacklist globalmente');
              }
            }
          }

          const lines = [];
          const mentions = new Set();

          if (added.length) {
            lines.push('Nuovi ingressi nella blacklist:');
            for (const entry of added) {
              const label = await buildMentionLabel(entry.jid, context);
              lines.push(`- ${label}`);
              mentions.add(entry.jid);
            }
          }

          if (already.length) {
            lines.push('Già presenti:');
            for (const jid of already) {
              const label = await buildMentionLabel(jid, context);
              lines.push(`- ${label}`);
              mentions.add(jid);
            }
          }

          if (blocked.length) {
            lines.push('Utenti protetti o non validi, impossibile inserirli:');
            for (const jid of blocked) {
              const label = await buildMentionLabel(jid, context);
              lines.push(`- ${label}`);
            }
          }

          if (!lines.length) {
            lines.push('Nessuna modifica apportata alla blacklist.');
          }

          return wrap({
            text: lines.join('\n'),
            mentions: mentions.size ? [...mentions] : undefined
          });
        }

        if (action === 'remove') {
          const numericArgs = [];
          const remainingArgs = [];
          for (const arg of context.parsed.args) {
            if (/^\d+$/.test(arg)) {
              numericArgs.push(Number(arg));
            } else {
              remainingArgs.push(arg);
            }
          }
          context.parsed.args = remainingArgs;

          const entries = blacklistService.getAllEntries();
          const selected = new Map();

          for (const value of numericArgs) {
            const index = value - 1;
            if (index >= 0 && entries[index]) {
              selected.set(entries[index].jid, entries[index]);
            }
          }

          resolveTargets(context).forEach((jid) => {
            const entry = blacklistService.getEntry(jid);
            if (entry) {
              selected.set(entry.jid, entry);
            }
          });

          if (!selected.size) {
            return wrap({ text: 'Nessuno degli utenti indicati è nella blacklist.' });
          }

          const messages = [];
          const mentions = [];

          for (const entry of selected.values()) {
            const label = await buildMentionLabel(entry.jid, context);
            const restoreResult = await restoreBlacklistedEntry(entry, context);
            await blacklistService.remove(entry.jid);

            const entryLines = [`${label} rimosso dalla blacklist.`];
            if (restoreResult.added.length) {
              const names = await describeGroupList(restoreResult.added, context);
              entryLines.push('Riaggiunto nei gruppi:', ...names.map((name) => `• ${name}`));
            }
            if (restoreResult.failed.length) {
              const names = await describeGroupList(restoreResult.failed, context);
              entryLines.push(
                'Non sono riuscito a riaggiungerlo nei seguenti gruppi (controlla permessi/admin):',
                ...names.map((name) => `• ${name}`)
              );
            }
            messages.push(entryLines.join('\n'));
            mentions.push(entry.jid);
          }

          return wrap({
            text: messages.join('\n\n'),
            mentions
          });
        }

        if (action === 'clear') {
          const entries = blacklistService.getAllEntries();
          if (!entries.length) {
            return wrap({ text: 'La blacklist era già vuota.' });
          }

          const messages = [];
          for (const entry of entries) {
            const label = await buildMentionLabel(entry.jid, context);
            const restoreResult = await restoreBlacklistedEntry(entry, context);
            await blacklistService.remove(entry.jid);

            const entryLines = [`${label} liberato e rimosso dalla blacklist.`];
            if (restoreResult.added.length) {
              const names = await describeGroupList(restoreResult.added, context);
              entryLines.push('Riaggiunto nei gruppi:', ...names.map((name) => `• ${name}`));
            }
            if (restoreResult.failed.length) {
              const names = await describeGroupList(restoreResult.failed, context);
              entryLines.push(
                'Non sono riuscito a riaggiungerlo nei seguenti gruppi (controlla i permessi):',
                ...names.map((name) => `• ${name}`)
              );
            }
            messages.push(entryLines.join('\n'));
          }

          return wrap({
            text: messages.join('\n\n')
          });
        }

        return wrap({ text: 'Azione non riconosciuta. Usa list, add, remove o clear.' });
      }
    },
    {
      name: 'text',
      usage: 'text (rispondendo a un audio)',
      minLevel: PermissionLevel.MEMBER,
      description: 'Trascrive un messaggio vocale citato in testo.',
      handler: async (context) => {
        const wrap = (payload) => ({ ...payload, skipQuotedMedia: true });

        if (!downloadMediaMessage) {
          return wrap({ text: 'Trascrizione non disponibile su questa istanza.' });
        }

        if (!aiService?.transcribeAudio) {
          return wrap({ text: 'Il servizio AI non supporta la trascrizione audio in questo momento.' });
        }

        const { contextInfo, quoted } = extractQuotedMessageInfo(context);
        if (!quoted || !contextInfo?.stanzaId) {
          return wrap({ text: 'Rispondi a un messaggio vocale con !text per ottenerne la trascrizione.' });
        }

        const resolved = resolveQuotedMedia(quoted);
        if (!resolved || resolved.type !== 'audio') {
          return wrap({ text: 'Il messaggio citato non è un audio valido.' });
        }

        const wrapper = {
          key: {
            remoteJid: context.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant || undefined,
            fromMe: false
          },
          message: { audioMessage: resolved.message }
        };

        let buffer;
        try {
          buffer = await downloadMediaMessage(wrapper, 'buffer', {
            logger,
            reuploadRequest: sock.updateMediaMessage
          });
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile scaricare l\'audio per la trascrizione');
          return wrap({ text: 'Non riesco a recuperare quell\'audio.' });
        }

        if (!buffer) {
          return wrap({ text: 'WhatsApp non mi ha consegnato nessun dato per questo audio.' });
        }

        let transcript = null;
        try {
          transcript = await aiService.transcribeAudio(buffer, resolved.message?.mimetype);
        } catch (error) {
          logger?.warn({ err: error }, 'Errore durante la trascrizione audio');
        }

        if (!transcript) {
          return wrap({ text: 'Non sono riuscito a trascrivere questo audio.' });
        }

        return wrap({
          text: `📝 Trascrizione:\n${transcript}`
        });
      }
    },
    {
      name: 's',
      usage: 's (rispondendo a foto o video)',
      minLevel: PermissionLevel.MEMBER,
      description: 'Crea uno sticker dal media citato.',
      handler: async (context) => {
        const wrap = (payload) => ({ ...payload, skipQuotedMedia: true });

        if (!StickerLib || !StickerTypesLib) {
          return wrap({
            text: 'Modulo sticker non installato. Esegui `npm install wa-sticker-formatter` per abilitare !s.'
          });
        }

        if (!downloadMediaMessage) {
          return wrap({ text: 'Non posso scaricare il media citato su questa istanza.' });
        }

        const { contextInfo, quoted } = extractQuotedMessageInfo(context);
        if (!quoted || !contextInfo?.stanzaId) {
          return wrap({ text: 'Rispondi a una foto o video con !s per trasformarlo in sticker.' });
        }

        const resolved = resolveQuotedMedia(quoted);
        if (!resolved || !['image', 'video', 'ptv'].includes(resolved.type)) {
          return wrap({ text: 'Il messaggio citato non è una foto o un video valido.' });
        }

        const key = {
          remoteJid: context.remoteJid,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant || undefined,
          fromMe: false
        };

        const message =
          resolved.type === 'image'
            ? { imageMessage: resolved.message }
            : resolved.type === 'video'
            ? { videoMessage: resolved.message }
            : { ptvMessage: resolved.message };

        let buffer;
        try {
          buffer = await downloadMediaMessage(
            { key, message },
            'buffer',
            {
              logger,
              reuploadRequest: sock.updateMediaMessage
            }
          );
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile scaricare il media per generare lo sticker');
          return wrap({ text: 'Non riesco a recuperare i dati del media citato.' });
        }

        if (!buffer) {
          return wrap({ text: 'WhatsApp non mi ha consegnato il media richiesto.' });
        }

        const stickerBuffer = await buildStickerBuffer(buffer, resolved.type === 'image' ? 'image' : 'video');
        if (!stickerBuffer) {
          return wrap({ text: 'Ho avuto problemi a generare lo sticker. Assicurati che ffmpeg sia installato per i video.' });
        }

        return wrap({
          messages: [
            {
              sticker: stickerBuffer
            }
          ],
          consumesText: true
        });
      }
    },
    {
      name: 'rivela',
      usage: 'rivela (rispondendo a foto/video view-once)',
      minLevel: PermissionLevel.ADMIN,
      description: 'Rende permanente una foto o video a visualizzazione singola citato.',
      handler: async (context) => {
        const wrap = (payload) => ({ ...payload, skipQuotedMedia: true });

        if (!downloadMediaMessage) {
          return wrap({ text: 'Funzione non disponibile su questa istanza.' });
        }

        const { contextInfo, quoted } = extractQuotedMessageInfo(context);
        if (!quoted || !contextInfo?.stanzaId) {
          return wrap({ text: 'Rispondi a una foto o video a visualizzazione singola per rivelarla.' });
        }

        const resolved = resolveQuotedMedia(quoted);
        if (!resolved || !resolved.viewOnce || (resolved.type !== 'image' && resolved.type !== 'video')) {
          return wrap({ text: 'Il messaggio citato non è una foto/video a visualizzazione singola.' });
        }

        const wrapper = {
          key: {
            remoteJid: context.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant || undefined,
            fromMe: false
          },
          message:
            resolved.type === 'image'
              ? { imageMessage: { ...resolved.message, viewOnce: false } }
              : { videoMessage: { ...resolved.message, viewOnce: false } }
        };

        let buffer;
        try {
          buffer = await downloadMediaMessage(wrapper, 'buffer', {
            logger,
            reuploadRequest: sock.updateMediaMessage
          });
        } catch (error) {
          logger?.warn({ err: error }, 'Impossibile scaricare il media view-once');
          return wrap({ text: 'Non riesco a recuperare quel media. Forse è già stato eliminato.' });
        }

        if (!buffer) {
          return wrap({ text: 'WhatsApp non mi ha consegnato nessun dato per questo media.' });
        }

        const caption =
          resolved.message?.caption ||
          `Media rivelato da ${context.message.pushName || context.senderJid}.`;

        const payload =
          resolved.type === 'image'
            ? { image: buffer, caption }
            : { video: buffer, caption };

        return wrap({ messages: [payload] });
      }
    },
    {
      name: 'steal',
      usage: 'steal',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Prende il controllo del gruppo in tre fasi (demote, promote whitelist+owner, rename & lock).',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando steal funziona solo nei gruppi.' };
        }

        if (antinukeService && (await antinukeService.isEnabled(context.remoteJid))) {
          return { text: 'Questo gruppo è protetto dall\'antinuke. Steal non disponibile.' };
        }

        await ensureGroupMetadata(context);
        if (!(await isBotAdmin(context))) {
          return { text: 'Non posso prendere il controllo se non mi promuovi ad admin.' };
        }

        let metadata = context.groupMetadata;
        const botCandidates = collectBotCandidates(context);
        const admins = [];
        for (const participant of metadata.participants || []) {
          if (isParticipantAdmin(participant)) {
            const participantJid = normalizeJid(participant.id);
            if (participantJid && !isBotSelf(participantJid, botCandidates)) {
              admins.push(participantJid);
            }
          }
        }

        if (admins.length) {
          await performParticipantUpdate(context.remoteJid, admins, 'demote', 'steal-demote');
          try {
            const refreshed = await sock.groupMetadata(context.remoteJid);
            if (refreshed?.participants) {
              context.groupMetadata = refreshed;
            }
          } catch (error) {
            logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile aggiornare i metadata dopo la demozione');
          }
        }

        const refreshedMetadata = context.groupMetadata || metadata;
        const ownerJid = normalizeJid(permissionService.getOwnerJid());
        const whitelistEntries = permissionService.getWhitelistEntries?.() || [];
        const whitelistJids = whitelistEntries.map((entry) => normalizeJid(entry.jid)).filter(Boolean);
        const toPromote = new Set();

        const isInGroup = (jid) => refreshedMetadata.participants?.some((p) => normalizeJid(p.id) === jid);
        if (ownerJid && isInGroup(ownerJid)) {
          toPromote.add(ownerJid);
        }
        for (const entryJid of whitelistJids) {
          if (entryJid && isInGroup(entryJid)) {
            toPromote.add(entryJid);
          }
        }

        if (toPromote.size) {
          try {
            await sock.groupParticipantsUpdate(context.remoteJid, Array.from(toPromote), 'promote');
          } catch (error) {
            logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile promuovere whitelist/owner');
          }
        }

        try {
          await sock.groupUpdateSubject(context.remoteJid, 'Rubato da Bagley :O');
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile rinominare il gruppo durante steal');
        }

        try {
          await sock.groupSettingUpdate(context.remoteJid, 'announcement');
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile chiudere il gruppo durante steal');
        }

        const allowedAdmins = new Set([...toPromote, ...collectBotCandidates(context)]);
        try {
          const latestMetadata = await sock.groupMetadata(context.remoteJid);
          if (latestMetadata?.participants) {
            context.groupMetadata = latestMetadata;
          }
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile aggiornare i metadata post-steal');
        }

        const finalMetadata = context.groupMetadata || refreshedMetadata;
        const strayAdmins = [];
        for (const participant of finalMetadata.participants || []) {
          if (isParticipantAdmin(participant)) {
            const participantJid = normalizeJid(participant.id);
            if (participantJid && !allowedAdmins.has(participantJid)) {
              strayAdmins.push(participantJid);
            }
          }
        }

        if (strayAdmins.length) {
          await performParticipantUpdate(context.remoteJid, strayAdmins, 'demote', 'steal-final-demote');
        }

        const mentionLabels = await formatMentionList(Array.from(toPromote), context);
        const summaryLines = [
          'Operazione steal completata. Bagley vi ruba pure la mamma XD.',
          admins.length ? `Admin rimossi: ${admins.length}` : 'Nessun admin da rimuovere.',
          mentionLabels.length ? ['Nuovi admin:', ...mentionLabels].join('\n') : 'Nessun whitelist/owner da promuovere.',
          'Nome gruppo impostato a "Rubato da Bagley :O" e chat chiusa ai soli admin. Congratulazioni!'
        ];
        return { text: summaryLines.join('\n'), mentions: Array.from(toPromote) };
      }
    },
    {
      name: 'abuse',
      usage: 'abuse',
      minLevel: PermissionLevel.WHITELIST,
      description: 'Rimuove admin, ribattezza il gruppo e lo svuota prima di abbandonarlo.',
      handler: async (context) => {
        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando abuse funziona solo nei gruppi.' };
        }

        if (antinukeService && (await antinukeService.isEnabled(context.remoteJid))) {
          return { text: 'Questo gruppo è protetto dall\'antinuke. Abuse non è consentito.' };
        }

        await ensureGroupMetadata(context);
        if (!(await isBotAdmin(context))) {
          return { text: 'Non posso eseguire abuse senza permessi da admin.' };
        }

        const metadata = context.groupMetadata;
        const botCandidates = collectBotCandidates(context);
        const currentAdmins = [];
        for (const participant of metadata.participants || []) {
          if (isParticipantAdmin(participant)) {
            const participantJid = normalizeJid(participant.id);
            if (participantJid && !isBotSelf(participantJid, botCandidates)) {
              currentAdmins.push(participantJid);
            }
          }
        }

        if (currentAdmins.length) {
          await performParticipantUpdate(context.remoteJid, currentAdmins, 'demote', 'abuse-demote');
          try {
            const refreshed = await sock.groupMetadata(context.remoteJid);
            if (refreshed?.participants) {
              context.groupMetadata = refreshed;
            }
          } catch (error) {
            logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile aggiornare i metadata dopo la demozione (abuse)');
          }
          metadata = context.groupMetadata || metadata;
        }

        try {
          await sock.groupUpdateSubject(context.remoteJid, 'Abusato da Bagley ;P');
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile rinominare il gruppo (abuse)');
        }

        let targetsToKick = [];
        for (const participant of metadata.participants || []) {
          const jid = normalizeJid(participant.id);
          if (jid && !isBotSelf(jid, botCandidates)) {
            targetsToKick.push(jid);
          }
        }

        const removed = await performParticipantUpdate(context.remoteJid, targetsToKick, 'remove', 'abuse-remove');

        let finalParticipants = metadata.participants || [];
        try {
          const refreshed = await sock.groupMetadata(context.remoteJid);
          if (refreshed?.participants) {
            context.groupMetadata = refreshed;
            finalParticipants = refreshed.participants;
          }
        } catch (error) {
          logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile aggiornare i metadata dopo l\'abuse');
        }

        const remaining = finalParticipants
          .map((p) => normalizeJid(p.id))
          .filter((jid) => jid && !isBotSelf(jid, botCandidates));

        if (!remaining.length || (remaining.length === 1 && permissionService.isOwner(remaining[0]))) {
          try {
            await sock.groupLeave(context.remoteJid);
          } catch (error) {
            logger?.warn({ err: error, groupId: context.remoteJid }, 'Impossibile lasciare il gruppo dopo l\'abuse');
          }
        }

        const summary = [
          'Operazione abuse completata. Bagley vi scopa il culo brutte puttanelle :P',
          currentAdmins.length
            ? `Admin rimossi: ${currentAdmins.length}`
            : 'Nessun altro admin da rimuovere.',
          removed.length ? `Membri rimossi: ${removed.length}` : 'Nessun membro rimosso (già vuoto?).',
          remaining.length
            ? 'Sono rimasti alcuni membri che non posso rimuovere automaticamente.'
            : 'Il gruppo è vuoto, procedo a lasciare la chat.'
        ];

        return { text: summary.join('\n') };
      }
    },
    {
      name: 'radar',
      usage: 'radar [@utente|jid]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Analizza un utente e segnala possibili attività da bot.',
      handler: async (context) => {
        if (!radarService) {
          return { text: 'Il radar non è disponibile su questa istanza.' };
        }

        if (!context.remoteJid?.endsWith('@g.us')) {
          return { text: 'Il comando radar funziona solo nei gruppi.' };
        }

        const targetInfo = resolveSingleCommandTarget(context);
        const targetJid = normalizeJid(targetInfo.jid);
        if (!targetJid) {
          return { text: 'Specifica l\'utente da analizzare (menzione, risposta o JID).' };
        }

        const stats = radarService.getStats(targetJid);
        const label = await buildMentionLabel(targetJid, context);

        if (!stats || !stats.totalMessages) {
          return {
            text: `Non ho raccolto abbastanza dati su ${label} per esprimere un giudizio.`,
            mentions: [targetJid]
          };
        }

        const evaluation = radarService.evaluateSuspicion(stats);
        const ratio = Math.round(
          (stats.botLikeMessages / Math.max(1, stats.totalMessages)) * 100
        );

        const lines = [
          `Analisi radar su ${label}`,
          `- Messaggi raccolti: ${stats.totalMessages}`,
          `- Messaggi sospetti: ${stats.botLikeMessages} (${ratio}%)`,
          `- Chat monitorate: ${stats.groups.length || 0}`,
          `- Ultima attività: ${formatRelativeTime(stats.lastSeen)}`
        ];

        if (stats.lastBotLike) {
          lines.push(`- Ultimo messaggio sospetto: ${formatRelativeTime(stats.lastBotLike)}`);
        }

        if (stats.perGroup?.length) {
          const sorted = [...stats.perGroup].sort((a, b) => b.total - a.total);
          const topGroups = sorted.slice(0, 3);
          lines.push('', 'Attività su altri gruppi monitorati:');
          for (const info of topGroups) {
            const groupLabel = await resolveGroupLabel(info.groupJid, context, {
              sock,
              contactCache,
              logger
            });
            const groupRatio = Math.round((info.botLike / Math.max(1, info.total)) * 100);
            lines.push(`• ${groupLabel}: ${info.total} msg (${groupRatio}% sospetti)`);
          }
          if (sorted.length > 3) {
            lines.push(`+ dati aggregati da altri ${sorted.length - topGroups.length} gruppi.`);
          }
        }

        lines.push('', evaluation.reason);
        let mentions = [targetJid];

        if (evaluation.suspicious) {
          let warnText = 'Ho rilevato un comportamento sospetto ma non sono riuscito a assegnare il warn.';
          try {
            const warnResult = await applyWarn({
              context,
              targetJid,
              issuerJid: context.senderJid,
              reason: 'Attività sospetta rilevata dal radar.',
              protectHighRanks: false
            });
            if (warnResult?.text) {
              warnText = warnResult.text;
            }
            if (warnResult?.mentions?.length) {
              mentions = Array.from(new Set([...mentions, ...warnResult.mentions]));
            }
          } catch (error) {
            logger?.warn({ err: error, targetJid }, 'Impossibile assegnare il warn da radar');
          }

          const ownerJid = normalizeJid(permissionService.getOwnerJid());
          if (ownerJid) {
            const ownerLabel = await buildMentionLabel(ownerJid, context);
            lines.push('', `Owner notificato: ${ownerLabel}`);
            if (!mentions.includes(ownerJid)) {
              mentions.push(ownerJid);
            }
          }

          lines.push('', warnText);
          return { text: lines.join('\n'), mentions };
        }

        if (stats.samples?.length) {
          lines.push('', 'Ultimi messaggi raccolti:');
          stats.samples.slice(0, 3).forEach((sample) => {
            lines.push(`• ${sample}`);
          });
        }

        return { text: lines.join('\n'), mentions };
      }
    },
    {
      name: 'ban',
      usage: 'ban [@utente|jid...]',
      minLevel: PermissionLevel.ADMIN,
      description: 'Rimuove utenti dal gruppo.',
      handler: async (context) =>
        participantsUpdateCommand(context, {
          action: 'remove',
          groupOnlyText: 'Il comando ban funziona solo nei gruppi.',
          emptyTargetsText: 'Specifica gli utenti da rimuovere (menzione o JID).',
          protectFn: (jid) => permissionService.isOwner(jid) || permissionService.isWhitelisted(jid),
          protectedText: ({ mentionLabels }) => ['Impossibile rimuovere utenti protetti:', ...mentionLabels].join('\n'),
          successText: ({ mentionLabels }) => ['Ciao ciao troglodita :P', ...mentionLabels].join('\n'),
          errorText: 'Errore durante la rimozione. Assicurati che Bagley sia amministratore del gruppo.'
        })
    }
  ];

  for (const command of commandList) {
    const categoryKey = COMMAND_CATEGORY_MAP[command.name] || 'misc';
    command.category = categoryKey;
  }

  const commandMap = new Map();
  for (const command of commandList) {
    commandMap.set(command.name, command);
  }

  const maybeAttachQuotedMedia = async (context, response) => {
    if (!response || response.skipQuotedMedia) {
      return response;
    }

    const caption = typeof response.text === 'string' && response.text.trim() ? response.text : '';
    const mentions = Array.isArray(response.mentions) ? response.mentions : [];
    const mediaResponse = await buildMediaResponseFromQuote(context, caption, mentions);
    if (!mediaResponse?.messages?.length) {
      return response;
    }

    const mergedMessages = [
      ...mediaResponse.messages,
      ...(Array.isArray(response.messages) ? response.messages : [])
    ];

    const updated = {
      ...response,
      messages: mergedMessages
    };

    if (mediaResponse.consumesText && 'text' in updated) {
      delete updated.text;
    }

    return updated;
  };

  async function handleCommand(context) {
    const parsed = context.parsed || parseCommand(context.text);
    if (!parsed) {
      return null;
    }

    const command = commandMap.get(parsed.command);
    if (!command) {
      return {
        text: 'Comando non riconosciuto. Usa !help per la lista completa.'
      };
    }

    if (context.permissionLevel < command.minLevel) {
      return {
        text: `Non hai i permessi per usare questo comando (richiede grado ${command.minLevel}).`
      };
    }

    context.parsed = parsed;
    const response = await command.handler(context);
    return maybeAttachQuotedMedia(context, response);
  }

  return {
    handleCommand,
    parseCommand,
    commandList,
    warnManager: {
      applyWarn
    }
  };
}

module.exports = {
  createCommandRegistry,
  parseCommand
};
