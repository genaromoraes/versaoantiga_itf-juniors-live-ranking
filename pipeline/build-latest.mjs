import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(rootDir, "data.js");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const rankingPreviewFile = path.join(rootDir, "data", "itf-ranking-preview.json");
const pointsCsvFile = path.join(rootDir, "data", "player-points.csv");
const previewFile = path.join(rootDir, "data", "itf-player-preview.json");
const activityPreviewFile = path.join(rootDir, "data", "itf-activity-preview.json");
const weeklyResultsFile = path.join(rootDir, "data", "weekly-results.csv");
const outputDir = path.join(rootDir, "data");
const outputFile = path.join(outputDir, "latest.json");

const dataCode = await fs.readFile(dataFile, "utf8");
const context = vm.createContext({});

vm.runInContext(
  `${dataCode}
this.payload = {
  dataSource,
  players: samplePlayers
};`,
  context,
  { filename: "data.js" }
);

async function readRealPlayerPreview() {
  try {
    return JSON.parse(await fs.readFile(previewFile, "utf8"));
  } catch {
    return { players: [] };
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

async function readPointsCsvPreview() {
  try {
    const csv = await fs.readFile(pointsCsvFile, "utf8");
    const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine);
    const playersById = new Map();

    for (const line of lines) {
      const columns = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, columns[index] || ""]));
      if (!row.player_id || !row.result_type) continue;

      const player = playersById.get(row.player_id) || {
        id: row.player_id,
        name: row.player_name,
        country: row.country,
        gender: row.gender,
        currentRank: Number(row.current_rank || 0),
        sourceUrl: row.source_url,
        singles: [],
        doubles: []
      };

      player[row.result_type].push({
        event: row.event,
        grade: row.grade,
        date: row.date,
        points: Number(row.points || 0),
        sourceCounting: row.source_counting !== "false"
      });
      playersById.set(row.player_id, player);
    }

    const players = [...playersById.values()].map((player) => ({
      ...player,
      totalCombinedPoints: [
        ...player.singles.filter((result) => result.sourceCounting !== false).slice(0, 6).map((result) => Number(result.points || 0)),
        ...player.doubles.filter((result) => result.sourceCounting !== false).slice(0, 6).map((result) => Number(result.points || 0) * 0.25)
      ].reduce((total, points) => total + points, 0)
    }));

    return { players };
  } catch {
    return { players: [] };
  }
}

async function readRankingPreview() {
  try {
    return JSON.parse(await fs.readFile(rankingPreviewFile, "utf8"));
  } catch {
    return { players: [] };
  }
}

async function readSourcePlayers() {
  try {
    return JSON.parse(await fs.readFile(sourcesFile, "utf8"));
  } catch {
    return [];
  }
}

async function readActivityPreview() {
  try {
    return JSON.parse(await fs.readFile(activityPreviewFile, "utf8"));
  } catch {
    return { players: [] };
  }
}

async function readWeeklyResultsPreview() {
  try {
    const csv = await fs.readFile(weeklyResultsFile, "utf8");
    const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine);
    const rows = lines
      .map((line) => {
        const columns = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, columns[index] || ""]));
      })
      .filter((row) => row.player_id && row.match_type);

    return { rows };
  } catch {
    return { rows: [] };
  }
}

async function readExistingLatest() {
  try {
    return JSON.parse(await fs.readFile(outputFile, "utf8"));
  } catch {
    return null;
  }
}

function sourcePlayerShell(player) {
  const officialPoints = Number(player.officialPoints || 0);
  return {
    id: player.id,
    name: player.name,
    country: player.country,
    gender: player.gender,
    currentRank: player.currentRank,
    officialPoints,
    sourceTotalCombinedPoints: officialPoints,
    singles: [],
    doubles: [],
    defending: [],
    liveEvent: {
      event: "",
      grade: "",
      singlesStatus: "Nao joga",
      singlesRound: "Nao joga",
      singlesPoints: 0,
      doublesStatus: "Nao joga",
      doublesRound: "Nao joga",
      doublesPoints: 0
    }
  };
}

function hasRankingResults(player) {
  return (player?.singles?.length || 0) + (player?.doubles?.length || 0) > 0;
}

function officialFallbackResults(player, rankingDate) {
  if (!Number(player.officialPoints || 0)) return player;

  return {
    ...player,
    sourceTotalCombinedPoints: Number(player.officialPoints),
    singles: [
      {
        event: `Ranking oficial ITF (${rankingDate || "data pendente"})`,
        round: "Oficial",
        points: Number(player.officialPoints),
        date: "",
        sourceCounting: true,
        officialFallback: true
      }
    ],
    doubles: []
  };
}

const roundToDisplay = {
  W: "Campeao",
  F: "Final",
  SF: "SF",
  QF: "QF",
  R16: "R16",
  R3: "R16",
  R2: "R32",
  R1: "R64"
};

const displayToRound = Object.fromEntries(Object.entries(roundToDisplay).map(([round, display]) => [display, round]));

function pointsForRound(rules, grade, matchType, round) {
  const table = rules.pointsTable?.[matchType]?.[grade] || {};
  return Number(table[round] || 0);
}

function saoPauloToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

function applyRealPlayerPreview(players, previewPlayers) {
  const realById = new Map(previewPlayers.map((player) => [player.id, player]));

  return players.map((player) => {
    const realPlayer = realById.get(player.id);
    if (!realPlayer) return player;
    if (!realPlayer.singles?.length && !realPlayer.doubles?.length) return player;

    const defending = [
      ...defendingFromResults(realPlayer.singles, "singles"),
      ...defendingFromResults(realPlayer.doubles, "doubles")
    ];

    return {
      ...player,
      sourceUrl: realPlayer.sourceUrl,
      sourceTotalCombinedPoints: realPlayer.totalCombinedPoints,
      singles: realPlayer.singles.map((result) => ({
        event: result.event,
        round: result.grade,
        points: result.points,
        date: result.date,
        sourceCounting: result.sourceCounting
      })),
      defending,
      doubles: realPlayer.doubles.map((result) => ({
        event: result.event,
        round: result.grade,
        points: result.points,
        date: result.date,
        sourceCounting: result.sourceCounting
      }))
    };
  });
}

function currentWeekBounds() {
  const today = saoPauloToday();
  const day = today.getUTCDay() || 7;
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function defendingFromResults(results, type) {
  const { start, end } = currentWeekBounds();

  return results
    .filter((result) => result.sourceCounting !== false)
    .filter((result) => {
      const dropDate = new Date(`${result.date}T00:00:00Z`);
      dropDate.setUTCDate(dropDate.getUTCDate() + 364);
      return start <= dropDate && dropDate <= end;
    })
    .map((result) => ({
      type,
      event: result.event,
      points: result.points,
      date: result.date
    }));
}

function currentTournamentForType(tournaments = [], matchType, today) {
  return tournaments.find((tournament) => {
    const start = new Date(`${tournament.startDate}T00:00:00Z`);
    const end = new Date(`${tournament.endDate}T23:59:59Z`);
    return tournament.matchType === matchType && start <= today && today <= end;
  });
}

function pointsAndStatusForTournament(tournament, rules, matchType) {
  if (!tournament) {
    return {
      status: "Nao joga",
      round: "Nao joga",
      points: 0,
      maxPoints: 0
    };
  }

  const lastResult = [...(tournament.matches || [])].reverse().find((match) => match.outcome === "W" || match.outcome === "L");
  const normalizedCurrentRound = displayToRound[tournament.currentRound] || tournament.currentRound || "";
  const pointsRound = tournament.status === "Eliminado" ? lastResult?.round || normalizedCurrentRound : normalizedCurrentRound || lastResult?.round || "";
  const currentRound = roundToDisplay[tournament.currentRound] || tournament.currentRound || "Nao joga";

  return {
    status: tournament.status === "Eliminado" ? "Eliminado" : "Ativo",
    round: currentRound,
    points: pointsForRound(rules, tournament.grade, matchType, pointsRound),
    maxPoints: pointsForRound(rules, tournament.grade, matchType, "W")
  };
}

function applyActivityPreview(players, activityPlayers, rules) {
  const activityById = new Map(activityPlayers.map((player) => [player.id, player]));
  const today = saoPauloToday();

  return players.map((player) => {
    const activityPlayer = activityById.get(player.id);
    const singlesTournament = currentTournamentForType(activityPlayer?.tournaments, "Singles", today);
    const doublesTournament = currentTournamentForType(activityPlayer?.tournaments, "Doubles", today);

    if (activityPlayer && !singlesTournament && !doublesTournament) {
      return {
        ...player,
        liveEvent: {
          event: "",
          grade: "",
          singlesStatus: "Nao joga",
          singlesRound: "Nao joga",
          singlesPoints: 0,
          doublesStatus: "Nao joga",
          doublesRound: "Nao joga",
          doublesPoints: 0
        }
      };
    }

    if (!singlesTournament && !doublesTournament) return player;

    const singles = pointsAndStatusForTournament(singlesTournament, rules, "singles");
    const doubles = pointsAndStatusForTournament(doublesTournament, rules, "doubles");
    const eventNames = [singlesTournament?.event, doublesTournament?.event].filter(Boolean);
    const event = [...new Set(eventNames)].join(" / ");
    const grade = singlesTournament?.grade || doublesTournament?.grade || "";

    return {
      ...player,
      liveEvent: {
        ...(player.liveEvent || {}),
        event,
        grade,
        singlesStatus: singles.status,
        singlesRound: singles.round,
        singlesPoints: singles.points,
        singlesMaxPoints: singles.maxPoints,
        doublesStatus: doubles.status,
        doublesRound: doubles.round,
        doublesPoints: doubles.points,
        doublesMaxPoints: doubles.maxPoints
      }
    };
  });
}

function normalizeWeeklyStatus(status = "") {
  const value = status.trim().toLowerCase();
  if (value.startsWith("elim")) return "Eliminado";
  if (value.startsWith("nao") || value.startsWith("não")) return "Nao joga";
  return "Ativo";
}

function weeklyTournamentFromRow(row) {
  const status = row.current_round ? normalizeWeeklyStatus(row.status) : "Nao joga";
  return {
    event: row.event,
    grade: row.grade,
    startDate: row.start_date,
    endDate: row.end_date,
    matchType: row.match_type,
    status,
    currentRound: row.current_round,
    matches: status === "Eliminado"
      ? [{ round: row.current_round, outcome: "L", opponent: "", score: "" }]
      : []
  };
}

function applyWeeklyResultsPreview(players, weeklyRows, rules) {
  if (!weeklyRows.length) return players;

  const rowsByPlayer = new Map();
  for (const row of weeklyRows) {
    if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
    rowsByPlayer.get(row.player_id).push(row);
  }

  return players.map((player) => {
    const rows = rowsByPlayer.get(player.id) || [];
    const singlesRow = rows.find((row) => row.match_type === "Singles");
    const doublesRow = rows.find((row) => row.match_type === "Doubles");
    if (!singlesRow && !doublesRow) return player;

    const singlesTournament = singlesRow ? weeklyTournamentFromRow(singlesRow) : null;
    const doublesTournament = doublesRow ? weeklyTournamentFromRow(doublesRow) : null;
    const singles = pointsAndStatusForTournament(singlesTournament, rules, "singles");
    const doubles = pointsAndStatusForTournament(doublesTournament, rules, "doubles");
    const eventNames = [singlesTournament?.currentRound ? singlesTournament.event : "", doublesTournament?.currentRound ? doublesTournament.event : ""].filter(Boolean);
    const event = [...new Set(eventNames)].join(" / ");
    const grade = singlesTournament?.grade || doublesTournament?.grade || "";

    return {
      ...player,
      liveEvent: {
        ...(player.liveEvent || {}),
        event,
        grade,
        singlesStatus: singles.status,
        singlesRound: singles.round,
        singlesPoints: singles.points,
        singlesMaxPoints: singles.maxPoints,
        doublesStatus: doubles.status,
        doublesRound: doubles.round,
        doublesPoints: doubles.points,
        doublesMaxPoints: doubles.maxPoints,
        source: "data/weekly-results.csv"
      }
    };
  });
}

const realPreview = await readRealPlayerPreview();
const pointsCsvPreview = await readPointsCsvPreview();
const activityPreview = await readActivityPreview();
const weeklyResultsPreview = await readWeeklyResultsPreview();
const rankingPreview = await readRankingPreview();
const sourcePlayers = await readSourcePlayers();
const rules = JSON.parse(await fs.readFile(path.join(rootDir, "pipeline", "rules", "itf-juniors-2026.json"), "utf8"));
const basePlayers = sourcePlayers.length ? sourcePlayers.map(sourcePlayerShell) : context.payload.players;
const pointsPreview = pointsCsvPreview.players?.length ? pointsCsvPreview : realPreview;
const playersWithOfficialFallbacks = basePlayers.map((player) => officialFallbackResults(player, rankingPreview.rankingDate));
const playersWithRealResults = applyRealPlayerPreview(playersWithOfficialFallbacks, pointsPreview.players || []);
const playersWithActivity = applyActivityPreview(playersWithRealResults, activityPreview.players || [], rules);
const players = applyWeeklyResultsPreview(playersWithActivity, weeklyResultsPreview.rows || [], rules);
const existingLatest = await readExistingLatest();
const invalidPlayers = players.filter((player) => !hasRankingResults(player));

let payload = {
  ...context.payload,
  players,
  dataSource: {
    ...context.payload.dataSource,
    rankingDate: rankingPreview.rankingDate || context.payload.dataSource.rankingDate,
    updatedAt: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    }).format(new Date())
  },
  generatedBy: "pipeline/build-latest.mjs",
  realPlayersApplied: pointsPreview.players?.map((player) => player.id) || [],
  pointsSource: pointsCsvPreview.players?.length ? "data/player-points.csv" : "data/itf-player-preview.json",
  activityPlayersApplied: activityPreview.players?.map((player) => player.id) || [],
  weeklyResultsApplied: [...new Set((weeklyResultsPreview.rows || []).map((row) => row.player_id))]
};

if (invalidPlayers.length && existingLatest?.players?.length) {
  console.warn(`Keeping previous latest.json because this run has empty data for: ${invalidPlayers.map((player) => player.id).join(", ")}`);
  payload = {
    ...existingLatest,
    dataSource: {
      ...existingLatest.dataSource,
      updatedAt: existingLatest.dataSource?.updatedAt || payload.dataSource.updatedAt
    },
    generatedBy: "pipeline/build-latest.mjs",
    skippedUpdateReason: `Empty data for: ${invalidPlayers.map((player) => player.id).join(", ")}`,
    skippedUpdateAt: payload.dataSource.updatedAt
  };
}

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Generated ${path.relative(rootDir, outputFile)} with ${payload.players.length} players.`);
