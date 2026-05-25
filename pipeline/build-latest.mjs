import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const rankingPreviewFile = path.join(rootDir, "data", "itf-ranking-preview.json");
const pointsCsvFile = path.join(rootDir, "data", "player-points.csv");
const weeklyResultsFile = path.join(rootDir, "data", "weekly-results.csv");
const weeklyResultsHistoryFile = path.join(rootDir, "data", "weekly-results-history.csv");
const manualWeeklyResultsFile = path.join(rootDir, "data", "manual-weekly-results.csv");
const outputDir = path.join(rootDir, "data");
const outputFile = path.join(outputDir, "latest.json");

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

function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function parseIsoDateUtc(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDateFromUtc(date) {
  return date.toISOString().slice(0, 10);
}

function normalizedDropDate(dateValue, dropDateValue) {
  if (dropDateValue) {
    const sourceDate = parseIsoDateUtc(dateValue);
    const storedDropDate = parseIsoDateUtc(dropDateValue);
    if (sourceDate && storedDropDate && sourceDate.getUTCDay() === 0) {
      const expectedLegacyDropDate = new Date(sourceDate);
      expectedLegacyDropDate.setUTCDate(expectedLegacyDropDate.getUTCDate() + 364);
      if (isoDateFromUtc(expectedLegacyDropDate) === dropDateValue) {
        expectedLegacyDropDate.setUTCDate(expectedLegacyDropDate.getUTCDate() + 1);
        return isoDateFromUtc(expectedLegacyDropDate);
      }
    }
    return dropDateValue;
  }

  const sourceDate = parseIsoDateUtc(dateValue);
  if (!sourceDate) return "";
  if (sourceDate.getUTCDay() === 0) {
    sourceDate.setUTCDate(sourceDate.getUTCDate() + 1);
  }
  sourceDate.setUTCDate(sourceDate.getUTCDate() + 364);
  return isoDateFromUtc(sourceDate);
}

async function readPointsCsvPreview() {
  try {
    const csv = await fs.readFile(pointsCsvFile, "utf8");
    const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine);
    const playersById = new Map();
    const { start: currentWeekStart } = currentWeekBounds();
    const currentWeekStartIso = currentWeekStart.toISOString().slice(0, 10);

    for (const line of lines) {
      const columns = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, columns[index] || ""]));
      if (!row.player_id || !row.result_type) continue;
      const dropDate = normalizedDropDate(row.date, row.drop_date);
      if (!dropDate || dropDate < currentWeekStartIso) continue;

      const currentRank =
        row.current_rank === undefined || row.current_rank === null || row.current_rank === ""
          ? null
          : Number(row.current_rank);

      const player = playersById.get(row.player_id) || {
        id: row.player_id,
        name: row.player_name,
        country: row.country,
        gender: row.gender,
        currentRank,
        sourceUrl: row.source_url,
        singles: [],
        doubles: []
      };

      player[row.result_type].push({
        event: row.event,
        grade: row.grade,
        date: row.date,
        dropDate,
        points: Number(row.points || 0),
        sourceCounting: row.source_counting !== "false"
      });
      playersById.set(row.player_id, player);
    }

    const players = [...playersById.values()].map((player) => ({
      ...player,
      totalCombinedPoints: [
        ...topSixCountableByPoints(player.singles).map((result) => Number(result.points || 0)),
        ...topSixCountableByPoints(player.doubles).map((result) => Number(result.points || 0) * 0.25)
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

async function readCsvRows(file) {
  try {
    const csv = await fs.readFile(file, "utf8");
    const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(headerLine);
    return lines
      .map((line) => {
        const columns = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, columns[index] || ""]));
      })
      .filter((row) => row.player_id && row.match_type);
  } catch {
    return [];
  }
}

async function writeCsvRows(file, headers, rows) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header] ?? "")).join(","))
  ];
  await fs.writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function readWeeklyResultsPreview() {
  try {
    const generatedRows = await readCsvRows(weeklyResultsFile);
    const manualRows = await readCsvRows(manualWeeklyResultsFile);
    const rowsByKey = new Map(generatedRows.map((row) => [weeklyRowKey(row), row]));

    for (const row of manualRows) {
      rowsByKey.set(weeklyRowKey(row), {
        ...rowsByKey.get(weeklyRowKey(row)),
        ...row,
        manualOverride: true
      });
    }

    const rows = [...rowsByKey.values()];
    return { rows };
  } catch {
    return { rows: [] };
  }
}

function weeklyRowKey(row) {
  return [row.player_id, row.match_type, row.event].join("|");
}

function weeklyHistoryRowKey(row) {
  return [
    row.player_id || "",
    row.match_type || "",
    row.event || "",
    row.start_date || "",
    row.current_round || "",
    row.status || ""
  ].join("|");
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
    birthYear: player.birthYear || "",
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

function hasWeeklyActivity(player) {
  const liveEvent = player?.liveEvent || {};
  const statuses = [liveEvent.singlesStatus, liveEvent.doublesStatus]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return Boolean(liveEvent.event) || statuses.some((status) => status !== "nao joga" && status !== "não joga");
}

function hasPublishableRankingData(player) {
  return (
    hasRankingResults(player) ||
    Number(player?.officialPoints || player?.sourceTotalCombinedPoints || 0) > 0 ||
    hasWeeklyActivity(player)
  );
}

function topSixByPoints(results = []) {
  return [...results].sort((a, b) => Number(b.points || 0) - Number(a.points || 0)).slice(0, 6);
}

function isSourceCounting(result) {
  return result?.sourceCounting !== false && result?.sourceCounting !== "false";
}

function topSixCountableByPoints(results = []) {
  return topSixByPoints(results.filter(isSourceCounting));
}

function saoPauloTodayIso() {
  const today = saoPauloToday();
  return today.toISOString().slice(0, 10);
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

function doublesValue(points) {
  return Number(points || 0) * 0.25;
}

function isMeaningfulPoints(value) {
  return Math.abs(Number(value || 0)) > 0.0001;
}

function rankedResults(results = [], multiplier = 1) {
  return [...results]
    .filter(isSourceCounting)
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .map((item, index) => ({
      ...item,
      isCounting: index < 6,
      countedPoints: Number(item.points || 0) * multiplier
    }));
}

function bestSixResults(results = [], multiplier = 1) {
  return rankedResults(results, multiplier).filter((item) => item.isCounting);
}

function sumBestSix(results = [], multiplier = 1) {
  return bestSixResults(results, multiplier).reduce((total, item) => total + item.countedPoints, 0);
}

function resultKey(result) {
  return [
    result.event || "",
    result.round || result.grade || "",
    result.date || "",
    result.dropDate || "",
    Number(result.points || 0)
  ].join("|");
}

function droppingResultSet(defending = [], type) {
  return new Set(
    defending
      .filter((result) => result.type === type)
      .map(resultKey)
  );
}

function countedReplacementResults(beforeResults = [], afterResults = [], multiplier = 1) {
  const beforeCounted = bestSixResults(beforeResults, multiplier);
  const afterCounted = bestSixResults(afterResults, multiplier);
  const beforeKeys = new Set(beforeCounted.map(resultKey));
  return afterCounted.filter((item) => !beforeKeys.has(resultKey(item)));
}

const nextRoundByDisplay = {
  R64: "R32",
  R32: "R16",
  R16: "QF",
  QF: "SF",
  SF: "Final",
  Final: "Campeao",
  Campeao: "Campeao"
};

function hasActiveDraw(liveEvent, type) {
  const status = liveEvent?.[`${type}Status`] || "";
  const round = liveEvent?.[`${type}Round`] || "";
  return status === "Ativo" && round && round !== "Nao joga";
}

function projectedRawPointsForType(liveEvent, type, target) {
  const matchType = type === "doubles" ? "doubles" : "singles";
  const currentRound = liveEvent[`${type}Round`] || "";
  const currentRawPoints = Number(liveEvent[`${type}Points`] || 0);
  const targetRound = target === "next" ? nextRoundByDisplay[currentRound] || currentRound : "Campeao";

  if (target === "max") {
    const maxPoints = Number(liveEvent[`${type}MaxPoints`] || pointsForRound(rules, liveEvent.grade, matchType, "W") || currentRawPoints);
    return Math.max(currentRawPoints, maxPoints);
  }

  return Math.max(currentRawPoints, pointsForRound(rules, liveEvent.grade, matchType, displayToRound[targetRound] || targetRound));
}

function countedPointsWithProjection(baseResults, currentRawPoints, projectedRawPoints, multiplier = 1) {
  const baselineResults = isMeaningfulPoints(currentRawPoints)
    ? [...baseResults, { event: "__current_projection__", round: "", points: currentRawPoints }]
    : [...baseResults];
  const projectedResults = isMeaningfulPoints(projectedRawPoints)
    ? [...baseResults, { event: "__projected_projection__", round: "", points: projectedRawPoints }]
    : [...baseResults];

  const baseline = sumBestSix(baselineResults, multiplier);
  const projected = sumBestSix(projectedResults, multiplier);
  return Math.max(0, projected - baseline);
}

function projectionGainForType(player, type, target) {
  const liveEvent = player.liveEvent || {};
  if (!hasActiveDraw(liveEvent, type)) return null;

  const isDoubles = type === "doubles";
  const currentRawPoints = Number(liveEvent[`${type}Points`] || 0);
  const projectedRawPoints = projectedRawPointsForType(liveEvent, type, target);
  const baseResults = type === "doubles"
    ? (Array.isArray(player.liveBaseDoubles) ? player.liveBaseDoubles : [])
    : (Array.isArray(player.liveBaseSingles) ? player.liveBaseSingles : []);
  const gain = countedPointsWithProjection(baseResults, currentRawPoints, projectedRawPoints, isDoubles ? 0.25 : 1);

  if (!isMeaningfulPoints(gain)) return null;

  return {
    type,
    label: isDoubles ? "(D)" : "(S)",
    gain
  };
}

function projectionScenarios(player, target) {
  const scenarios = [
    projectionGainForType(player, "singles", target),
    projectionGainForType(player, "doubles", target)
  ].filter(Boolean);

  if (scenarios.length > 1) {
    scenarios.push({
      type: "combined",
      label: "(S+D)",
      gain: scenarios.reduce((total, item) => total + item.gain, 0)
    });
  }

  return scenarios;
}

function normalizeComputedPlayer(player) {
  const singles = Array.isArray(player.singles) ? player.singles : [];
  const doubles = Array.isArray(player.doubles) ? player.doubles : [];
  const defending = Array.isArray(player.defending) ? player.defending : [];
  const liveEvent = player.liveEvent || {};
  const droppingSingles = droppingResultSet(defending, "singles");
  const droppingDoubles = droppingResultSet(defending, "doubles");
  const liveBaseSingles = singles.filter((result) => !droppingSingles.has(resultKey(result)));
  const liveBaseDoubles = doubles.filter((result) => !droppingDoubles.has(resultKey(result)));
  const replacementSingles = countedReplacementResults(singles, liveBaseSingles);
  const replacementDoubles = countedReplacementResults(doubles, liveBaseDoubles, 0.25).map((item) => ({
    ...item,
    type: "doubles"
  }));
  const basePoints = sumBestSix(singles) + sumBestSix(doubles, 0.25);
  const liveBasePoints = sumBestSix(liveBaseSingles) + sumBestSix(liveBaseDoubles, 0.25);
  const defendingPoints = Math.max(0, basePoints - liveBasePoints);
  const weeklySinglesResult = isMeaningfulPoints(liveEvent.singlesPoints)
    ? { event: liveEvent.event, round: liveEvent.grade, points: Number(liveEvent.singlesPoints || 0), type: "singles", isWeeklyResult: true }
    : null;
  const weeklyDoublesResult = isMeaningfulPoints(liveEvent.doublesPoints)
    ? { event: liveEvent.event, round: liveEvent.grade, points: Number(liveEvent.doublesPoints || 0), type: "doubles", isWeeklyResult: true }
    : null;
  const liveSingles = weeklySinglesResult ? [...liveBaseSingles, weeklySinglesResult] : liveBaseSingles;
  const liveDoubles = weeklyDoublesResult ? [...liveBaseDoubles, weeklyDoublesResult] : liveBaseDoubles;
  const fallbackPoints = Number(player.sourceTotalCombinedPoints ?? player.officialPoints ?? 0);
  const hasDetailedResults = singles.length + doubles.length > 0;
  const liveCountedSingles = bestSixResults(liveSingles);
  const liveCountedDoubles = bestSixResults(liveDoubles, 0.25);
  const weeklyEntries = [
    ...liveCountedSingles.filter((item) => item.isWeeklyResult),
    ...liveCountedDoubles.filter((item) => item.isWeeklyResult)
  ];
  const livePoints = hasDetailedResults
    ? Math.max(0, sumBestSix(liveSingles) + sumBestSix(liveDoubles, 0.25))
    : Math.max(0, fallbackPoints);
  const enteringPoints = Math.max(0, livePoints - liveBasePoints);
  const pointsDelta = enteringPoints - defendingPoints;
  const pointsFlow = {
    dropping: defending,
    entering: [
      ...replacementSingles.map((item) => ({ ...item, type: "singles" })),
      ...replacementDoubles,
      ...weeklyEntries
    ]
  };

  const normalizedPlayer = {
    ...player,
    computedLiveDataVersion: 1,
    singles,
    doubles,
    defending,
    liveBaseSingles,
    liveBaseDoubles,
    replacements: pointsFlow.entering,
    weeklyEntries,
    liveEvent,
    basePoints,
    liveBasePoints,
    defendingPoints,
    enteringPoints,
    gainedPoints: enteringPoints,
    pointsDelta,
    livePoints,
    pointsFlow
  };

  const nextScenarios = projectionScenarios(normalizedPlayer, "next").map((scenario) => ({
    ...scenario,
    totalPoints: Math.max(0, livePoints + scenario.gain)
  }));
  const maxScenarios = projectionScenarios(normalizedPlayer, "max").map((scenario) => ({
    ...scenario,
    totalPoints: Math.max(0, livePoints + scenario.gain)
  }));

  return {
    ...normalizedPlayer,
    nextScenarios,
    maxScenarios,
    nextWinPoints: nextScenarios.find((scenario) => scenario.type === "combined")?.totalPoints
      || nextScenarios.reduce((best, scenario) => Math.max(best, scenario.totalPoints), livePoints),
    maxPoints: maxScenarios.find((scenario) => scenario.type === "combined")?.totalPoints
      || maxScenarios.reduce((best, scenario) => Math.max(best, scenario.totalPoints), livePoints)
  };
}

function assignLiveRanks(players = []) {
  const byGender = new Map();

  for (const player of players) {
    if (!byGender.has(player.gender)) byGender.set(player.gender, []);
    byGender.get(player.gender).push(player);
  }

  const rankedById = new Map();

  for (const group of byGender.values()) {
    group
      .sort((a, b) => {
        const pointsDiff = Number(b.livePoints || 0) - Number(a.livePoints || 0);
        if (pointsDiff !== 0) return pointsDiff;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .forEach((player, index) => {
        const liveRank = index + 1;
        const officialRank = Number(player.currentRank);
        rankedById.set(player.id, {
          ...player,
          liveRank,
          rankDelta: Number.isFinite(officialRank) && officialRank > 0 ? officialRank - liveRank : 0
        });
      });
  }

  return players.map((player) => rankedById.get(player.id) || player);
}

function projectedOfficialPoints(player) {
  const fallbackPoints = Number(player.sourceTotalCombinedPoints ?? player.officialPoints ?? 0);
  const hasDetailedResults = (player.singles?.length || 0) + (player.doubles?.length || 0) > 0;
  if (!hasDetailedResults) return Math.max(0, fallbackPoints);
  return Math.max(0, Number(player.liveBasePoints ?? player.basePoints ?? fallbackPoints));
}

function assignProjectedOfficialRanks(players = []) {
  const byGender = new Map();

  for (const player of players) {
    if (!byGender.has(player.gender)) byGender.set(player.gender, []);
    byGender.get(player.gender).push(player);
  }

  const rankedById = new Map();

  for (const group of byGender.values()) {
    group
      .map((player) => ({
        ...player,
        projectedOfficialPoints: projectedOfficialPoints(player)
      }))
      .sort((a, b) => {
        const pointsDiff = Number(b.projectedOfficialPoints || 0) - Number(a.projectedOfficialPoints || 0);
        if (pointsDiff !== 0) return pointsDiff;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .forEach((player, index) => {
        rankedById.set(player.id, {
          ...player,
          projectedOfficialRank: index + 1
        });
      });
  }

  return players.map((player) => {
    const projected = rankedById.get(player.id);
    return projected
      ? {
          ...player,
          projectedOfficialPoints: projected.projectedOfficialPoints,
          projectedOfficialRank: projected.projectedOfficialRank
        }
      : player;
  });
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
      ...defendingFromResults(topSixCountableByPoints(realPlayer.singles), "singles"),
      ...defendingFromResults(topSixCountableByPoints(realPlayer.doubles), "doubles")
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
        dropDate: result.dropDate,
        sourceCounting: result.sourceCounting
      })),
      defending,
      doubles: realPlayer.doubles.map((result) => ({
        event: result.event,
        round: result.grade,
        points: result.points,
        date: result.date,
        dropDate: result.dropDate,
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

function currentWeekStartIso() {
  return currentWeekBounds().start.toISOString().slice(0, 10);
}

function parsePtBrRankingDate(value = "") {
  const match = String(value || "").trim().toLowerCase().match(/^(\d{1,2})\s+([a-zç]{3})\s+(\d{4})$/i);
  if (!match) return "";

  const [, dayText, monthText, yearText] = match;
  const monthMap = {
    jan: 1,
    fev: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12
  };

  const month = monthMap[monthText];
  if (!month) return "";
  return `${yearText}-${String(month).padStart(2, "0")}-${String(Number(dayText)).padStart(2, "0")}`;
}

function isPastWeeklyRow(row) {
  const startDate = String(row?.start_date || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate < currentWeekStartIso();
}

function splitWeeklyRowsByWeek(rows = []) {
  return {
    currentRows: rows.filter((row) => !isPastWeeklyRow(row)),
    pastRows: rows.filter(isPastWeeklyRow)
  };
}

async function readWeeklyHistoryRows() {
  return readCsvRows(weeklyResultsHistoryFile);
}

async function archivePastWeeklyRows(pastRows = []) {
  if (!pastRows.length) return { archivedRows: await readWeeklyHistoryRows(), addedCount: 0 };

  const existingRows = await readWeeklyHistoryRows();
  const headers = [
    "player_id",
    "player_name",
    "match_type",
    "event",
    "grade",
    "start_date",
    "end_date",
    "status",
    "current_round",
    "points_override",
    "source_url",
    "notes"
  ];
  const rowsByKey = new Map(existingRows.map((row) => [weeklyHistoryRowKey(row), row]));
  let addedCount = 0;

  for (const row of pastRows) {
    const key = weeklyHistoryRowKey(row);
    if (rowsByKey.has(key)) continue;
    rowsByKey.set(key, row);
    addedCount += 1;
  }

  const archivedRows = [...rowsByKey.values()].sort((left, right) =>
    (left.start_date || "").localeCompare(right.start_date || "")
    || (left.event || "").localeCompare(right.event || "")
    || (left.player_name || "").localeCompare(right.player_name || "")
    || (left.match_type || "").localeCompare(right.match_type || "")
  );

  await writeCsvRows(weeklyResultsHistoryFile, headers, archivedRows);
  return { archivedRows, addedCount };
}

function defendingFromResults(results, type) {
  const { start, end } = currentWeekBounds();

  return results
    .filter((result) => {
      const dropDate = result.dropDate
        ? new Date(`${result.dropDate}T00:00:00Z`)
        : new Date(`${result.date}T00:00:00Z`);
      if (!result.dropDate) dropDate.setUTCDate(dropDate.getUTCDate() + 364);
      return start <= dropDate && dropDate <= end;
    })
    .map((result) => ({
      type,
      event: result.event,
      round: result.round || result.grade || "",
      points: result.points,
      date: result.date,
      dropDate: result.dropDate || result.date
    }));
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
  const hasPointsOverride = tournament.pointsOverride !== undefined
    && tournament.pointsOverride !== null
    && String(tournament.pointsOverride).trim() !== "";
  const pointsOverride = hasPointsOverride ? Number(tournament.pointsOverride) : Number.NaN;

  return {
    status: tournament.status === "Eliminado" ? "Eliminado" : "Ativo",
    round: currentRound,
    points: Number.isFinite(pointsOverride) ? pointsOverride : pointsForRound(rules, tournament.grade, matchType, pointsRound),
    maxPoints: pointsForRound(rules, tournament.grade, matchType, "W")
  };
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
    pointsOverride: row.points_override,
    matches: status === "Eliminado"
      ? [{ round: row.current_round, outcome: "L", opponent: "", score: "" }]
      : []
  };
}

function addDaysIso(dateText, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || "").trim())) return "";
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function historicalWeeklyResult(row, rules) {
  const matchType = row.match_type === "Doubles" ? "doubles" : "singles";
  const normalizedStatus = normalizeWeeklyStatus(row.status);
  const currentRound = String(row.current_round || "").trim();
  const hasPointsOverride =
    row.points_override !== undefined
    && row.points_override !== null
    && String(row.points_override).trim() !== "";

  let points = 0;
  if (hasPointsOverride) {
    points = Number(row.points_override || 0);
  } else if (currentRound) {
    points = pointsForRound(rules, row.grade, matchType, currentRound);
  }

  if (!Number.isFinite(points) || points < 0) return null;
  if (!currentRound && !hasPointsOverride) return null;

  return {
    type: matchType,
    event: row.event,
    round: row.grade,
    points,
    date: row.start_date,
    dropDate: addDaysIso(row.start_date, 364),
    sourceCounting: true,
    source: "data/weekly-results-history.csv",
    sourceWeekStatus: normalizedStatus
  };
}

function mergeHistoricalWeeklyResults(players, historyRows, rules) {
  if (!historyRows.length) return players;

  const rowsByPlayer = new Map();
  for (const row of historyRows) {
    if (!row.player_id) continue;
    if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
    rowsByPlayer.get(row.player_id).push(row);
  }

  return players.map((player) => {
    const playerRows = rowsByPlayer.get(player.id) || [];
    if (!playerRows.length) return player;

    const singles = [...(Array.isArray(player.singles) ? player.singles : [])];
    const doubles = [...(Array.isArray(player.doubles) ? player.doubles : [])];
    const existingSinglesKeys = new Set(singles.map(resultKey));
    const existingDoublesKeys = new Set(doubles.map(resultKey));
    let merged = false;

    for (const row of playerRows) {
      const result = historicalWeeklyResult(row, rules);
      if (!result) continue;

      if (result.type === "singles") {
        const key = resultKey(result);
        if (existingSinglesKeys.has(key)) continue;
        singles.push(result);
        existingSinglesKeys.add(key);
        merged = true;
      } else {
        const key = resultKey(result);
        if (existingDoublesKeys.has(key)) continue;
        doubles.push(result);
        existingDoublesKeys.add(key);
        merged = true;
      }
    }

    if (!merged) return player;

    const totalCombinedPoints = sumBestSix(singles) + sumBestSix(doubles, 0.25);

    return {
      ...player,
      singles,
      doubles,
      sourceTotalCombinedPoints: totalCombinedPoints,
      officialPoints: totalCombinedPoints
    };
  });
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

const pointsCsvPreview = await readPointsCsvPreview();
const weeklyResultsPreview = await readWeeklyResultsPreview();
const { currentRows: currentWeeklyRows, pastRows: pastWeeklyRows } = splitWeeklyRowsByWeek(weeklyResultsPreview.rows || []);
const weeklyHistoryArchive = await archivePastWeeklyRows(pastWeeklyRows);
const rankingPreview = await readRankingPreview();
const sourcePlayers = await readSourcePlayers();
const rules = JSON.parse(await fs.readFile(path.join(rootDir, "pipeline", "rules", "itf-juniors-2026.json"), "utf8"));
const basePlayers = sourcePlayers.map(sourcePlayerShell);
const playersWithOfficialFallbacks = basePlayers;
const playersWithRealResults = applyRealPlayerPreview(playersWithOfficialFallbacks, pointsCsvPreview.players || []);
const playersWithHistoricalWeeklyResults = mergeHistoricalWeeklyResults(
  playersWithRealResults,
  weeklyHistoryArchive.archivedRows || [],
  rules
);
const playersWithWeeklyResults = applyWeeklyResultsPreview(playersWithHistoricalWeeklyResults, currentWeeklyRows, rules);
const playersWithLiveData = playersWithWeeklyResults.map(normalizeComputedPlayer);
const playersWithProjectedOfficial = assignProjectedOfficialRanks(playersWithLiveData);
const players = assignLiveRanks(playersWithProjectedOfficial);
const invalidPlayers = players.filter((player) => !hasPublishableRankingData(player));
const rankingDateIso = parsePtBrRankingDate(rankingPreview.rankingDate || "");
const officialRankingProjected = Boolean(rankingDateIso) && rankingDateIso < currentWeekStartIso();

let payload = {
  dataSource: {
    rankingDate: rankingPreview.rankingDate || "",
    rankingDateIso,
    officialRankingProjected,
    updatedAt: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    }).format(new Date()),
    note: "Pontos = 6 melhores resultados de simples + 25% dos 6 melhores resultados de duplas"
  },
  players,
  generatedBy: "pipeline/build-latest.mjs",
  realPlayersApplied: pointsCsvPreview.players?.map((player) => player.id) || [],
  pointsSource: "data/player-points.csv",
  weeklyResultsApplied: [...new Set(currentWeeklyRows.map((row) => row.player_id))],
  weeklyHistoryApplied: [...new Set((weeklyHistoryArchive.archivedRows || []).map((row) => row.player_id))]
};

if (invalidPlayers.length) {
  payload = {
    ...payload,
    partialUpdateReason: `Some players remain unpublished because they still have no publishable ranking data: ${invalidPlayers
      .map((player) => player.id)
      .join(", ")}`,
    partialUpdateAt: payload.dataSource.updatedAt
  };
}

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Generated ${path.relative(rootDir, outputFile)} with ${payload.players.length} players.`);
if (weeklyHistoryArchive.addedCount) {
  console.log(`Archived ${weeklyHistoryArchive.addedCount} past weekly row(s) into ${path.relative(rootDir, weeklyResultsHistoryFile)}.`);
}
