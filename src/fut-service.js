const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeJid } = require('./permissions');

const FUT_DATA_PATH = path.join(__dirname, '..', 'config', 'fut-leagues.json');
const FUT_STATE_PATH = path.join(__dirname, '..', 'config', 'fut-state.json');

const DEFAULT_LEAGUES = {
  leagues: [
    {
      id: 'premier-league',
      name: 'Premier League',
      country: 'Inghilterra',
      code: 'eng.1',
      teams: [
        {
          id: 'arsenal',
          name: 'Arsenal',
          shortName: 'ARS',
          rating: 86,
          players: ['Bukayo Saka', 'Martin Odegaard', 'Gabriel Jesus', 'Declan Rice']
        },
        {
          id: 'manchester-city',
          name: 'Manchester City',
          shortName: 'MCI',
          rating: 90,
          players: ['Erling Haaland', 'Kevin De Bruyne', 'Phil Foden', 'Rodri']
        },
        {
          id: 'chelsea',
          name: 'Chelsea',
          shortName: 'CHE',
          rating: 83,
          players: ['Raheem Sterling', 'Cole Palmer', 'Enzo Fernandez', 'Christopher Nkunku']
        },
        {
          id: 'liverpool',
          name: 'Liverpool',
          shortName: 'LIV',
          rating: 88,
          players: ['Mohamed Salah', 'Darwin Nunez', 'Luis Diaz', 'Trent Alexander-Arnold']
        }
      ]
    },
    {
      id: 'la-liga',
      name: 'La Liga',
      country: 'Spagna',
      code: 'esp.1',
      teams: [
        {
          id: 'real-madrid',
          name: 'Real Madrid',
          shortName: 'RMA',
          rating: 89,
          players: ['Vinicius Jr.', 'Jude Bellingham', 'Rodrygo', 'Luka Modric']
        },
        {
          id: 'barcelona',
          name: 'FC Barcelona',
          shortName: 'BAR',
          rating: 87,
          players: ['Robert Lewandowski', 'Pedri', 'Gavi', 'Joao Felix']
        },
        {
          id: 'atletico-madrid',
          name: 'Atletico Madrid',
          shortName: 'ATM',
          rating: 85,
          players: ['Antoine Griezmann', 'Alvaro Morata', 'Rodrigo De Paul', 'Joao Felix']
        },
        {
          id: 'sevilla',
          name: 'Sevilla',
          shortName: 'SEV',
          rating: 81,
          players: ['Youssef En-Nesyri', 'Ivan Rakitic', 'Lucas Ocampos', 'Suso']
        }
      ]
    },
    {
      id: 'serie-a',
      name: 'Serie A',
      country: 'Italia',
      code: 'ita.1',
      teams: [
        {
          id: 'juventus',
          name: 'Juventus',
          shortName: 'JUV',
          rating: 85,
          players: ['Dusan Vlahovic', 'Federico Chiesa', 'Manuel Locatelli', 'Adrien Rabiot']
        },
        {
          id: 'inter',
          name: 'Inter',
          shortName: 'INT',
          rating: 87,
          players: ['Lautaro Martinez', 'Marcus Thuram', 'Hakan Calhanoglu', 'Nicolo Barella']
        },
        {
          id: 'milan',
          name: 'AC Milan',
          shortName: 'MIL',
          rating: 84,
          players: ['Rafael Leao', 'Olivier Giroud', 'Theo Hernandez', 'Christian Pulisic']
        },
        {
          id: 'napoli',
          name: 'Napoli',
          shortName: 'NAP',
          rating: 86,
          players: ['Victor Osimhen', 'Khvicha Kvaratskhelia', 'Piotr Zielinski', 'Giovanni Di Lorenzo']
        }
      ]
    },
    {
      id: 'bundesliga',
      name: 'Bundesliga',
      country: 'Germania',
      code: 'ger.1',
      teams: [
        {
          id: 'bayern',
          name: 'Bayern Monaco',
          shortName: 'FCB',
          rating: 89,
          players: ['Harry Kane', 'Jamal Musiala', 'Leroy Sane', 'Joshua Kimmich']
        },
        {
          id: 'borussia-dortmund',
          name: 'Borussia Dortmund',
          shortName: 'BVB',
          rating: 84,
          players: ['Marco Reus', 'Julian Brandt', 'Karim Adeyemi', 'Sebastien Haller']
        },
        {
          id: 'rb-leipzig',
          name: 'RB Leipzig',
          shortName: 'RBL',
          rating: 84,
          players: ['Timo Werner', 'Dani Olmo', 'Lois Openda', 'Dominik Szoboszlai']
        },
        {
          id: 'bayer-leverkusen',
          name: 'Bayer Leverkusen',
          shortName: 'B04',
          rating: 83,
          players: ['Florian Wirtz', 'Amine Adli', 'Alex Grimaldo', 'Jeremie Frimpong']
        }
      ]
    },
    {
      id: 'ligue-1',
      name: 'Ligue 1',
      country: 'Francia',
      code: 'fra.1',
      teams: [
        {
          id: 'psg',
          name: 'Paris Saint-Germain',
          shortName: 'PSG',
          rating: 90,
          players: ['Kylian Mbappé', 'Ousmane Dembélé', 'Marco Asensio', 'Marquinhos']
        },
        {
          id: 'marseille',
          name: 'Olympique Marseille',
          shortName: 'OM',
          rating: 82,
          players: ['Pierre-Emerick Aubameyang', 'Jonathan Clauss', 'Ismaila Sarr', 'Geoffrey Kondogbia']
        },
        {
          id: 'lyon',
          name: 'Olympique Lyonnais',
          shortName: 'OL',
          rating: 81,
          players: ['Alexandre Lacazette', 'Rayan Cherki', 'Corentin Tolisso', 'Nicolas Tagliafico']
        },
        {
          id: 'monaco',
          name: 'AS Monaco',
          shortName: 'ASM',
          rating: 83,
          players: ['Wissam Ben Yedder', 'Kevin Volland', 'Breel Embolo', 'Youssouf Fofana']
        }
      ]
    }
  ]
};

const CHAMPIONSHIP_MAP = {
  '1': 'premier-league',
  '2': 'la-liga',
  '3': 'serie-a',
  '4': 'bundesliga',
  '5': 'ligue-1'
};

const DEFAULT_GOAL_THRESHOLD = 3.5;
const DEFAULT_CARD_THRESHOLD = 3.5;
const DEFAULT_SHOT_THRESHOLD = 8.5;
const DEFAULT_CORNER_THRESHOLD = 6.5;
const HOUSE_FEE = 0.05;
const MATCH_DURATION_MS = 2 * 60 * 1000;
const MIN_MATCH_DELAY_MS = 15000;
const MAX_MATCH_DELAY_MS = 30000;

const randomBetween = (min, max) => Math.random() * (max - min) + min;

const getTeamStrength = (team) => {
  if (!team) {
    return 70 + Math.random() * 15;
  }
  const base = typeof team.rating === 'number' ? team.rating : 75;
  return base + Math.random() * 5;
};

const fallbackPlayer = (team) => {
  if (!team?.players?.length) {
    return 'Unknown Player';
  }
  return team.players[Math.floor(Math.random() * team.players.length)];
};

const CHAOS_TEMPLATES = [
  {
    type: 'brawl',
    message:
      '⚠️ Rissa in campo! L\'arbitro distribuisce ammonizioni a raffica e congela il gioco per qualche secondo.',
    extraRange: [10000, 20000]
  },
  {
    type: 'pitch_invasion',
    message: '🚨 Invasione di campo! Gli steward raggiungono il fan e si riparte con qualche attimo di ritardo.',
    extraRange: [7000, 15000]
  },
  {
    type: 'tech_issue',
    message: '🔧 Si rompe una rete! I giocatori attendono mentre i tecnici riparano la porta.',
    extraRange: [8000, 16000]
  }
];

const EXTRA_HYPE_EVENTS = [
  (team, player) => `🔥 ${player} (${team.name}) tenta la bomba da fuori, ma il portiere vola e salva tutto!`,
  (team, player) =>
    `🎯 ${team.name} orchestra un tiki-taka spettacolare: ${player} ci prova ma la difesa respinge sulla linea.`,
  (team, player) => `💥 Botta di ${player}! Il pallone scheggia il palo, brividi per gli avversari.`
];

const CARD_MESSAGES = [
  (player) => `🟡 Ammonizione per ${player} dopo un fallo tattico a centrocampo.`,
  (player) => `🟥 Rissa sfiorata! ${player} entra duro e l'arbitro non perdona.`
];

const loadJsonFile = async (filePath, fallback, logger) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      logger?.warn({ err: error, filePath }, 'Impossibile leggere il file JSON richiesto');
    }
    return fallback;
  }
};

const writeJsonFile = async (filePath, payload, logger) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    logger?.error({ err: error, filePath }, 'Impossibile salvare il file JSON');
  }
};

const generateMatchStats = (homeTeam, awayTeam, homeStrength, awayStrength) => {
  const baseHome = randomBetween(0, 4) + (homeStrength - 75) / 30;
  const baseAway = randomBetween(0, 4) + (awayStrength - 75) / 30;
  const homeGoals = Math.max(0, Math.round(baseHome));
  const awayGoals = Math.max(0, Math.round(baseAway));
  const totalGoals = homeGoals + awayGoals;
  const cards = Math.max(1, Math.round(randomBetween(2, 6)));
  const shots = Math.max(totalGoals * 2 + 4, Math.round(randomBetween(8, 18)));
  const corners = Math.max(3, Math.round(randomBetween(4, 12)));
  const homeScorers = Array.from({ length: homeGoals }, () => fallbackPlayer(homeTeam));
  const awayScorers = Array.from({ length: awayGoals }, () => fallbackPlayer(awayTeam));
  const outcome = homeGoals > awayGoals ? 'HOME' : homeGoals < awayGoals ? 'AWAY' : 'DRAW';
  const bothTeamsScore = homeGoals > 0 && awayGoals > 0;

  return {
    homeGoals,
    awayGoals,
    totalGoals,
    cards,
    shots,
    corners,
    outcome,
    bothTeamsScore,
    homeScorers,
    awayScorers
  };
};

const buildSortedOffsets = (count, minOffset, maxOffset) => {
  const offsets = [];
  for (let i = 0; i < count; i += 1) {
    offsets.push(Math.round(randomBetween(minOffset, maxOffset)));
  }
  return offsets.sort((a, b) => a - b);
};

const buildSimulation = ({ homeTeam, awayTeam, homeStrength, awayStrength, startAt }) => {
  const stats = generateMatchStats(homeTeam, awayTeam, homeStrength, awayStrength);
  const baseDuration = MATCH_DURATION_MS;
  let extraTimeMs = 0;
  const timeline = [];
  const liveScore = { home: 0, away: 0 };

  const toAbsolute = (offsetMs) => startAt + offsetMs;
  const pushEvent = (offsetMs, type, message) => {
    timeline.push({
      timestamp: toAbsolute(offsetMs),
      type,
      message
    });
  };

  pushEvent(0, 'kickoff', `🕒 Fischio d'inizio! ${homeTeam.name} vs ${awayTeam.name} è partita.`);

  const totalGoals = stats.homeGoals + stats.awayGoals;
  const goalOffsets = buildSortedOffsets(totalGoals, 8000, baseDuration - 15000);
  let homeGoalIdx = 0;
  let awayGoalIdx = 0;

  for (const offset of goalOffsets) {
    const isHomeGoal =
      homeGoalIdx < stats.homeScorers.length &&
      (awayGoalIdx >= stats.awayScorers.length || Math.random() < 0.5);
    if (isHomeGoal) {
      const scorer = stats.homeScorers[homeGoalIdx] || fallbackPlayer(homeTeam);
      liveScore.home += 1;
      homeGoalIdx += 1;
      pushEvent(
        offset,
        'goal',
        `⚽️ GOAL ${homeTeam.name}! ${scorer} porta il parziale sul ${liveScore.home}-${liveScore.away}.`
      );
    } else if (awayGoalIdx < stats.awayScorers.length) {
      const scorer = stats.awayScorers[awayGoalIdx] || fallbackPlayer(awayTeam);
      liveScore.away += 1;
      awayGoalIdx += 1;
      pushEvent(
        offset,
        'goal',
        `⚽️ GOAL ${awayTeam.name}! ${scorer} firma il ${liveScore.home}-${liveScore.away}.`
      );
    }
  }

  const highlightCount = Math.max(2, Math.round(stats.shots / 3));
  const highlightOffsets = buildSortedOffsets(highlightCount, 5000, baseDuration - 8000);
  for (const offset of highlightOffsets) {
    const team =
      Math.random() < homeStrength / (homeStrength + awayStrength) ? homeTeam : awayTeam;
    const player = fallbackPlayer(team);
    const template =
      EXTRA_HYPE_EVENTS[Math.floor(Math.random() * EXTRA_HYPE_EVENTS.length)] ||
      (() => 'Occasione da goal!');
    pushEvent(offset, 'chance', template(team, player));
  }

  const cardOffsets = buildSortedOffsets(stats.cards, 10000, baseDuration - 6000);
  for (const offset of cardOffsets) {
    const team = Math.random() < 0.5 ? homeTeam : awayTeam;
    const player = fallbackPlayer(team);
    const template =
      CARD_MESSAGES[Math.floor(Math.random() * CARD_MESSAGES.length)] ||
      ((name) => `🟡 Cartellino per ${name}.`);
    pushEvent(offset, 'card', template(player));
  }

  if (Math.random() < 0.35) {
    const chaos = CHAOS_TEMPLATES[Math.floor(Math.random() * CHAOS_TEMPLATES.length)];
    const chaosOffset = Math.round(randomBetween(baseDuration * 0.3, baseDuration * 0.9));
    pushEvent(chaosOffset, chaos.type, chaos.message);
    const [minExtra, maxExtra] = chaos.extraRange;
    extraTimeMs += Math.round(randomBetween(minExtra, maxExtra));
  }

  if (extraTimeMs > 0) {
    pushEvent(baseDuration, 'stoppage', `⌛ Recupero di ${Math.round(extraTimeMs / 1000)} secondi!`);
  }

  pushEvent(
    baseDuration + extraTimeMs - 4000,
    'last_action',
    '⏱️ Ultimi istanti infuocati, entrambe le squadre spingono!'
  );
  pushEvent(
    baseDuration + extraTimeMs,
    'final_whistle',
    '🔔 Triplice fischio imminente! Il VAR confermerà il risultato definitivo.'
  );

  timeline.sort((a, b) => a.timestamp - b.timestamp);

  return {
    result: stats,
    durationMs: baseDuration,
    extraTimeMs,
    endAt: toAbsolute(baseDuration + extraTimeMs),
    timeline,
    nextEventIndex: 0
  };
};

async function createFutService({ logger, bankService }) {
  const leagueData = await loadJsonFile(FUT_DATA_PATH, DEFAULT_LEAGUES, logger);
  const leagues = Array.isArray(leagueData?.leagues) ? leagueData.leagues : DEFAULT_LEAGUES.leagues;
  let state = await loadJsonFile(FUT_STATE_PATH, { groups: {} }, logger);
  if (!state || typeof state !== 'object' || !state.groups) {
    state = { groups: {} };
  }

  const persistState = () => writeJsonFile(FUT_STATE_PATH, state, logger);

  const ensureGroupState = (groupId) => {
    if (!state.groups[groupId]) {
      state.groups[groupId] = {
        leagueId: CHAMPIONSHIP_MAP['1'],
        history: [],
        leaderboard: {},
        activeMatch: null
      };
    }
    return state.groups[groupId];
  };

  const getLeagueById = (leagueId) => leagues.find((league) => league.id === leagueId);

  const selectRandomTeams = (league) => {
    if (!league?.teams?.length) {
      return { home: null, away: null };
    }
    if (league.teams.length === 1) {
      return { home: league.teams[0], away: league.teams[0] };
    }
    const shuffled = [...league.teams].sort(() => Math.random() - 0.5);
    return { home: shuffled[0], away: shuffled[1] };
  };

  const generateOdds = (homeStrength, awayStrength) => {
    const strengthDiff = homeStrength - awayStrength;
    const baseHome = Math.max(1.3, 2 - strengthDiff / 25);
    const baseAway = Math.max(1.3, 2 + strengthDiff / 25);
    const drawOdds = Math.max(1.8, 3 + Math.random());
    const randomize = (value) => Number((value + randomBetween(-0.1, 0.3)).toFixed(2));
    const totalsOdds = () => Number((1.8 + Math.random() * 0.4).toFixed(2));
    return {
      HOME: randomize(baseHome),
      AWAY: randomize(baseAway),
      DRAW: randomize(drawOdds),
      OVER: totalsOdds(),
      UNDER: totalsOdds(),
      GG: Number((1.6 + Math.random() * 0.5).toFixed(2)),
      NG: Number((1.7 + Math.random() * 0.5).toFixed(2)),
      OVER_CARDS: totalsOdds(),
      UNDER_CARDS: totalsOdds(),
      OVER_SHOTS: totalsOdds(),
      UNDER_SHOTS: totalsOdds(),
      OVER_CORNERS: totalsOdds(),
      UNDER_CORNERS: totalsOdds(),
      SCORER: 3.5,
      EXACT: 50
    };
  };

  const buildOptionList = (match) => {
    const { odds } = match;
    const goalThreshold = match.goalThreshold || DEFAULT_GOAL_THRESHOLD;
    const cardThreshold = match.cardThreshold || DEFAULT_CARD_THRESHOLD;
    const shotThreshold = match.shotThreshold || DEFAULT_SHOT_THRESHOLD;
    const cornerThreshold = match.cornerThreshold || DEFAULT_CORNER_THRESHOLD;
    return [
      { code: 'HOME', label: `1. 🅰️​ Vittoria ${match.homeTeam.name}`, odds: odds.HOME },
      { code: 'DRAW', label: '2. 🆎​ Pareggio', odds: odds.DRAW },
      { code: 'AWAY', label: `3. 🅱️​ Vittoria ${match.awayTeam.name}`, odds: odds.AWAY },
      { code: 'OVER', label: `4. ⬆️​🥅 Over ${goalThreshold}`, odds: odds.OVER, threshold: goalThreshold },
      { code: 'UNDER', label: `5. ⬇️​🥅 Under ${goalThreshold}`, odds: odds.UNDER, threshold: goalThreshold },
      { code: 'GG', label: '6. 🇬🇬 Goal / Goal', odds: odds.GG },
      { code: 'NG', label: '7. 🆖​ No Goal', odds: odds.NG },
      { code: 'OVER_CARDS', label: `8. ​⬆️​​🟨​Over cards ${cardThreshold}`, odds: odds.OVER_CARDS, threshold: cardThreshold },
      { code: 'UNDER_CARDS', label: `9. ​​⬇️​🟨​Under cards ${cardThreshold}`, odds: odds.UNDER_CARDS, threshold: cardThreshold },
      { code: 'OVER_SHOTS', label: `10. ⬆️💥Over tiri ${shotThreshold}`, odds: odds.OVER_SHOTS, threshold: shotThreshold },
      { code: 'UNDER_SHOTS', label: `11. ⬇️💥Under tiri ${shotThreshold}`, odds: odds.UNDER_SHOTS, threshold: shotThreshold },
      { code: 'OVER_CORNERS', label: `12. ⬆️↩️​Over corner ${cornerThreshold}`, odds: odds.OVER_CORNERS, threshold: cornerThreshold },
      { code: 'UNDER_CORNERS', label: `13. ⬇️↩️​Under corner ${cornerThreshold}`, odds: odds.UNDER_CORNERS, threshold: cornerThreshold },
      { code: 'SCORER', label: '14. ⚔️​ Marcatore (quota 3.50) <giocatore>', odds: odds.SCORER },
      { code: 'EXACT', label: '15. 🏆 Risultato esatto (quota 50) <es. 2-1>', odds: odds.EXACT }
    ];
  };

  const describeMatch = (match) => {
    if (!match) {
      return '❌ Nessun match attivo.';
    }
    const countdown =
      match.status === 'settled'
        ? 'ℹ️ Match già concluso.'
        : 'ℹ️ Calcio d\'inizio tra 2 minuti (timer fisso).';
    const odds = match.odds || {};
    const abxLines = [
      `1) 🅰️ Vittoria ${match.homeTeam.name} — quota ${Number(odds.HOME || 0).toFixed(2)}`,
      `2) 🆎 Pareggio — quota ${Number(odds.DRAW || 0).toFixed(2)}`,
      `3) 🅱️ Vittoria ${match.awayTeam.name} — quota ${Number(odds.AWAY || 0).toFixed(2)}`
    ];
    const extraLines = (match.options || [])
      .filter((opt) => !['HOME', 'DRAW', 'AWAY'].includes(opt.code))
      .map((opt) => `${opt.label} — quota ${opt.odds.toFixed(2)}`);
    return [
      `💥 Match virtuale: 🅰️​${match.homeTeam.name} vs ​🅱️​${match.awayTeam.name}`,
      countdown,
      '📡 Segui la Live.',
      `\n🏆 Campionato: ${match.leagueName}`,
      '',
      '\n📊 Mercati disponibili:',
      ...abxLines,
      ...extraLines,
      '',
      'ℹ️ Scommetti con `.bet <opzione> <importo>` (es. `.bet over3.5 500`).'
    ].join('\n');
  };

  const recordHistory = (group, entry) => {
    group.history = group.history || [];
    group.history.unshift(entry);
    if (group.history.length > 20) {
      group.history.length = 20;
    }
  };

  const updateLeaderboard = (group, jid, delta, won) => {
    if (!group.leaderboard) {
      group.leaderboard = {};
    }
    if (!group.leaderboard[jid]) {
      group.leaderboard[jid] = { bets: 0, wins: 0, losses: 0, profit: 0 };
    }
    const entry = group.leaderboard[jid];
    entry.bets += 1;
    if (won) {
      entry.wins += 1;
    } else {
      entry.losses += 1;
    }
    entry.profit = Number((entry.profit + delta).toFixed(2));
  };

  const settleMatch = async (groupId, match) => {
    if (!match || match.status === 'settled') {
      return match;
    }
    const simulated = match.simulation?.result;
    let homeGoals;
    let awayGoals;
    let cards;
    let shots;
    let corners;
    let outcome;
    let bothTeamsScore;
    let homeScorers;
    let awayScorers;

    if (simulated) {
      ({
        homeGoals,
        awayGoals,
        cards,
        shots,
        corners,
        outcome,
        bothTeamsScore,
        homeScorers,
        awayScorers
      } = simulated);
    } else {
      homeGoals = Math.max(0, Math.round(randomBetween(0, 4) + (match.homeStrength - 75) / 30));
      awayGoals = Math.max(0, Math.round(randomBetween(0, 4) + (match.awayStrength - 75) / 30));
      cards = Math.round(randomBetween(2, 8));
      shots = Math.round(randomBetween(6, 20));
      corners = Math.round(randomBetween(3, 12));
      outcome = homeGoals > awayGoals ? 'HOME' : homeGoals < awayGoals ? 'AWAY' : 'DRAW';
      bothTeamsScore = homeGoals > 0 && awayGoals > 0;
      homeScorers = Array.from({ length: homeGoals }, () => fallbackPlayer(match.homeTeam));
      awayScorers = Array.from({ length: awayGoals }, () => fallbackPlayer(match.awayTeam));
    }
    const totalGoals = homeGoals + awayGoals;

    match.status = 'settled';
    match.result = {
      homeGoals,
      awayGoals,
      totalGoals,
      cards,
      shots,
      corners,
      outcome,
      bothTeamsScore,
      scorers: {
        home: homeScorers,
        away: awayScorers
      }
    };

    const group = ensureGroupState(groupId);
    const bets = match.bets || [];

    const normalizeThreshold = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const evaluateSelection = (code, codeThreshold, payload) => {
      switch (code) {
        case 'HOME':
          return outcome === 'HOME';
        case 'AWAY':
          return outcome === 'AWAY';
        case 'DRAW':
          return outcome === 'DRAW';
        case 'OVER':
          return totalGoals > normalizeThreshold(codeThreshold, DEFAULT_GOAL_THRESHOLD);
        case 'UNDER':
          return totalGoals < normalizeThreshold(codeThreshold, DEFAULT_GOAL_THRESHOLD);
        case 'OVER_CARDS':
          return cards > normalizeThreshold(codeThreshold, DEFAULT_CARD_THRESHOLD);
        case 'UNDER_CARDS':
          return cards < normalizeThreshold(codeThreshold, DEFAULT_CARD_THRESHOLD);
        case 'OVER_SHOTS':
          return shots > normalizeThreshold(codeThreshold, DEFAULT_SHOT_THRESHOLD);
        case 'UNDER_SHOTS':
          return shots < normalizeThreshold(codeThreshold, DEFAULT_SHOT_THRESHOLD);
        case 'OVER_CORNERS':
          return corners > normalizeThreshold(codeThreshold, DEFAULT_CORNER_THRESHOLD);
        case 'UNDER_CORNERS':
          return corners < normalizeThreshold(codeThreshold, DEFAULT_CORNER_THRESHOLD);
        case 'GG':
          return bothTeamsScore;
        case 'NG':
          return !bothTeamsScore;
        case 'SCORER': {
          const normalized = payload?.player?.toLowerCase();
          return (
            Boolean(normalized) &&
            (homeScorers.some((p) => p.toLowerCase() === normalized) ||
              awayScorers.some((p) => p.toLowerCase() === normalized))
          );
        }
        case 'EXACT': {
          const predicted = payload?.score;
          return Boolean(predicted) && predicted === `${homeGoals}-${awayGoals}`;
        }
        default:
          return false;
      }
    };

    for (const bet of bets) {
      let won = false;
      if (Array.isArray(bet.legs) && bet.legs.length) {
        won = bet.legs.every((leg) => evaluateSelection(leg.code, leg.threshold, leg.payload));
      } else {
        won = evaluateSelection(bet.optionCode, bet.threshold, bet.payload);
      }

      if (won) {
        const gross = bet.amount * bet.odds;
        const fee = Math.max(0, Number((gross * HOUSE_FEE).toFixed(2)));
        const payout = Math.max(0, gross - fee);
        try {
          await bankService.adjustBalance(bet.bettor, payout);
        } catch (error) {
          logger?.warn({ err: error, bettor: bet.bettor }, 'Impossibile accreditare la vincita BagleyBank');
        }
        updateLeaderboard(group, bet.bettor, payout - bet.amount, true);
        bet.result = { won: true, payout };
      } else {
        updateLeaderboard(group, bet.bettor, -bet.amount, false);
        bet.result = { won: false };
      }
    }

    recordHistory(group, {
      matchId: match.id,
      league: match.leagueName,
      summary: `${match.homeTeam.name} ${homeGoals} - ${awayGoals} ${match.awayTeam.name}`,
      timestamp: Date.now()
    });

    group.activeMatch = null;
    await persistState();
    return match;
  };

  return {
    FUT_DATA_PATH,
    FUT_STATE_PATH,
    getLeagues() {
      return leagues;
    },
    getGroupState(groupId) {
      return ensureGroupState(groupId);
    },
    getLeagueSummaryMap() {
      return CHAMPIONSHIP_MAP;
    },
    async selectLeague(groupId, leagueId) {
      const league = getLeagueById(leagueId);
      if (!league) {
        return { error: 'Campionato non disponibile. Aggiorna i dati fut o controlla il codice.' };
      }
      const group = ensureGroupState(groupId);
      group.leagueId = leagueId;
      group.activeMatch = null;
      await persistState();
      return { league };
    },
    async createMatch(groupId) {
      const group = ensureGroupState(groupId);
      const league = getLeagueById(group.leagueId);
      if (!league) {
        return { error: 'Seleziona prima un campionato valido.' };
      }
      const { home, away } = selectRandomTeams(league);
      if (!home || !away || home.id === away.id) {
        return { error: 'Non riesco a selezionare due squadre valide. Aggiorna i dati fut.' };
      }
      const homeStrength = getTeamStrength(home);
      const awayStrength = getTeamStrength(away);
      const odds = generateOdds(homeStrength, awayStrength);
      const startAt =
        Date.now() + Math.round(randomBetween(MIN_MATCH_DELAY_MS, MAX_MATCH_DELAY_MS));
      const simulation = buildSimulation({ homeTeam: home, awayTeam: away, homeStrength, awayStrength, startAt });
      const match = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        leagueId: league.id,
        leagueName: league.name,
        homeTeam: home,
        awayTeam: away,
        homeStrength,
        awayStrength,
        odds,
        goalThreshold: DEFAULT_GOAL_THRESHOLD,
        cardThreshold: DEFAULT_CARD_THRESHOLD,
        shotThreshold: DEFAULT_SHOT_THRESHOLD,
        cornerThreshold: DEFAULT_CORNER_THRESHOLD,
        options: [],
        bets: [],
        status: 'pending',
        startAt,
        endAt: simulation.endAt,
        simulation,
        createdAt: Date.now()
      };
      match.options = buildOptionList(match);
      group.activeMatch = match;
      await persistState();
      return match;
    },
    describeMatch,
    listGroupIds() {
      return Object.keys(state.groups);
    },
    getChampionshipChoices() {
      return Object.entries(CHAMPIONSHIP_MAP).map(([key, leagueId]) => {
        const league = getLeagueById(leagueId);
        return {
          number: key,
          leagueId,
          name: league?.name || leagueId,
          country: league?.country
        };
      });
    },
    getThresholdDefaults() {
      return {
        goals: DEFAULT_GOAL_THRESHOLD,
        cards: DEFAULT_CARD_THRESHOLD,
        shots: DEFAULT_SHOT_THRESHOLD,
        corners: DEFAULT_CORNER_THRESHOLD
      };
    },
    async placeBet(groupId, bettorJid, option) {
      const normalized = normalizeJid(bettorJid);
      if (!normalized) {
        return { error: 'Impossibile identificare chi sta scommettendo.' };
      }
      const group = ensureGroupState(groupId);
      const match = group.activeMatch;
      if (!match) {
        return { error: 'Non c'è nessun match disponibile. Usa .match per generarne uno.' };
      }
      if (match.status !== 'pending' || Date.now() >= match.startAt) {
        return { error: 'Le scommesse sono chiuse. Attendi il prossimo match.' };
      }
      const account = await bankService.getAccount(normalized, { settle: true });
      if (!account) {
        return { error: 'Apri prima un conto BagleyBank con !account crea.' };
      }
      if (account.balance < option.amount) {
        return { error: 'Saldo insufficiente per questa puntata.' };
      }
      const debit = await bankService.adjustBalance(normalized, -option.amount);
      if (debit?.error) {
        return { error: debit.error };
      }
      const isMulti = Array.isArray(option.legs) && option.legs.length > 1;
      const legs = Array.isArray(option.legs)
        ? option.legs.map((leg) => ({
            code: leg.code,
            label: leg.label,
            odds: leg.odds,
            threshold: leg.threshold,
            payload: leg.payload || null
          }))
        : null;
      const combinedOdds = isMulti
        ? legs.reduce((sum, leg) => sum + Number(leg.odds || 0), 0)
        : option.odds;
      const bet = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        bettor: normalized,
        amount: option.amount,
        optionCode: isMulti ? 'MULTI' : option.code,
        label: option.label || (legs ? legs.map((leg) => leg.label).join(' + ') : option.code),
        odds: combinedOdds,
        threshold: isMulti ? null : option.threshold,
        payload: isMulti ? null : option.payload || null,
        legs,
        placedAt: Date.now()
      };
      match.bets = match.bets || [];
      match.bets.push(bet);
      await persistState();
      return { bet, match };
    },
    async processGroupMatches(groupId) {
      const group = state.groups[groupId];
      if (!group || !group.activeMatch) {
        return null;
      }
      const match = group.activeMatch;
      if (match.status === 'pending' && Date.now() >= match.startAt) {
        match.status = 'running';
        await persistState();
        return null;
      }
      if (match.status === 'running') {
        const endAt = match.endAt || match.startAt + MATCH_DURATION_MS;
        if (Date.now() >= endAt) {
          const settled = await settleMatch(groupId, match);
          return { groupId, match: settled };
        }
      }
      return null;
    },
    async consumeTimelineEvents(groupId, now = Date.now()) {
      const group = state.groups[groupId];
      if (!group?.activeMatch) {
        return [];
      }
      const match = group.activeMatch;
      if (match.status !== 'running') {
        return [];
      }
      const simulation = match.simulation;
      if (!simulation?.timeline?.length) {
        return [];
      }
      let index = simulation.nextEventIndex || 0;
      const ready = [];
      while (index < simulation.timeline.length && simulation.timeline[index].timestamp <= now) {
        ready.push(simulation.timeline[index]);
        index += 1;
      }
      if (ready.length) {
        simulation.nextEventIndex = index;
        await persistState();
      }
      return ready;
    },
    getHistory(groupId) {
      const group = ensureGroupState(groupId);
      return group.history || [];
    },
    getLeaderboard(groupId) {
      const group = ensureGroupState(groupId);
      return group.leaderboard || {};
    },
    getGlobalLeaderboard() {
      const aggregate = {};
      for (const group of Object.values(state.groups || {})) {
        if (!group?.leaderboard) {
          continue;
        }
        for (const [jid, stats] of Object.entries(group.leaderboard)) {
          if (!aggregate[jid]) {
            aggregate[jid] = { bets: 0, wins: 0, losses: 0, profit: 0 };
          }
          aggregate[jid].bets += stats.bets || 0;
          aggregate[jid].wins += stats.wins || 0;
          aggregate[jid].losses += stats.losses || 0;
          aggregate[jid].profit = Number(
            (aggregate[jid].profit + (stats.profit || 0)).toFixed(2)
          );
        }
      }
      return aggregate;
    }
  };
}

module.exports = {
  createFutService,
  FUT_DATA_PATH,
  FUT_STATE_PATH,
  DEFAULT_LEAGUES,
  DEFAULT_GOAL_THRESHOLD,
  DEFAULT_CARD_THRESHOLD,
  DEFAULT_SHOT_THRESHOLD,
  DEFAULT_CORNER_THRESHOLD
};
