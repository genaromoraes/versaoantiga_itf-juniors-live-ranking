import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "weekly-results.csv");
const previewFile = path.join(rootDir, "data", "weekly-tournaments-preview.json");
const outsidersOutputFile = path.join(rootDir, "data", "weekly-outsiders.csv");
const outsidersPreviewFile = path.join(rootDir, "data", "weekly-outsiders-preview.json");
const itfEntriesBaseUrl = "https://itf-entries.netlify.app";
const itfBaseUrl = "https://www.itftennis.com";
const itfCalendarPage = "https://www.itftennis.com/en/tournament-calendar/world-tennis-tour-juniors-calendar/";
const itfEventFiltersApiBase = "https://www.itftennis.com/tennis/api/TournamentApi/GetEventFilters";
const itfDrawsheetApi = "https://www.itftennis.com/tennis/api/TournamentApi/GetDrawsheet";
const coreTennisBaseUrl = "https://www.coretennis.net";
const liveTennisBaseUrl = "https://www.live-tennis.cn";
const coreTennisCalendars = {
  Boys: `${coreTennisBaseUrl}/majic/pageServer/1r0100000u/en/Junior-Boys.html`,
  Girls: `${coreTennisBaseUrl}/majic/pageServer/1z0100000y/en/Junior-Girls.html`
};
const pendingRound = "Pendente";

const players = JSON.parse(await fs.readFile(playersFile, "utf8"));
const playersByNormalizedName = new Map(players.map((player) => [normalizeName(player.name), player]));
const playersByItfId = new Map(players.map((player) => [itfPlayerId(player), player]).filter(([id]) => id));

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

const outsiderHeaders = [
  "player_itf_id",
  "player_name",
  "gender",
  "country",
  "junior_rank",
  "entry_groups",
  "tournaments",
  "source_urls",
  "draw_urls",
  "notes"
];

function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeName(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function acceptanceEntryName(entry = {}) {
  return `${entry.name || ""} ${entry.surname || ""}`.replace(/\s+/g, " ").trim();
}

function acceptanceEntryGender(entry = {}) {
  return String(entry.sex || "").toUpperCase() === "F" ? "Girls" : "Boys";
}

function itfPlayerId(player) {
  return player.pointsBreakdownUrl?.match(/\/players\/[^/]+\/([^/]+)\//)?.[1] || "";
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

function calendarStartDate() {
  const { start } = currentWeekBounds();
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDateRange(text = "") {
  const match = text.match(/(\d{1,2})\s([A-Za-z]{3})\s(?:-|to)\s(\d{1,2})\s([A-Za-z]{3})\s(\d{4})/i);
  if (!match) return { startDate: "", endDate: "" };
  const [, startDay, startMonth, endDay, endMonth, year] = match;
  return {
    startDate: new Date(`${startDay} ${startMonth} ${year} UTC`).toISOString().slice(0, 10),
    endDate: new Date(`${endDay} ${endMonth} ${year} UTC`).toISOString().slice(0, 10)
  };
}

function overlapsCurrentWeek(startDate, endDate) {
  if (!startDate || !endDate) return false;
  const { start, end } = currentWeekBounds();
  const tournamentStart = new Date(`${startDate}T00:00:00Z`);
  const tournamentEnd = new Date(`${endDate}T23:59:59Z`);
  return tournamentStart <= end && start <= tournamentEnd;
}

function gradeFromTournamentName(value = "") {
  return value.match(/\b(JGS|JM|J500|J300|J200|J100|J60|J30)\b/i)?.[1]?.toUpperCase() || "";
}

function cleanLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function isRound(value = "") {
  return /^(R1|R2|R3|R4|R16|R32|R64|Q1|Q2|Q3|Q4|QF|SF|F|W)$/i.test(value);
}

function normalizeDrawRound(value = "", matchType = "SINGLES") {
  const round = value.toUpperCase();
  if (/^Q[1-4]$/.test(round)) return round;
  if (matchType === "DOUBLES") {
    if (round === "R1") return "R32";
    if (round === "R2") return "R16";
    if (round === "R3") return "QF";
    if (round === "R4") return "SF";
    if (round === "F") return "F";
    return round;
  }
  if (round === "R1") return "R64";
  if (round === "R2") return "R32";
  if (round === "R3" || round === "R16") return "R16";
  return round;
}

function nextRound(round = "", matchType = "SINGLES") {
  if (round === "Q1") return "Q2";
  if (round === "Q2") return "Q3";
  if (round === "Q3") return "Q4";
  if (round === "Q4") return matchType === "DOUBLES" ? "R16" : "R64";
  return {
    R64: "R32",
    R32: "R16",
    R16: "QF",
    QF: "SF",
    SF: "F",
    F: "W"
  }[normalizeDrawRound(round, matchType)] || normalizeDrawRound(round, matchType);
}

function roundForOutcome(round = "", outcome = "", matchType = "SINGLES") {
  if (outcome === "L") return normalizeDrawRound(round, matchType);
  if (outcome === "W") return nextRound(round, matchType);
  return normalizeDrawRound(round, matchType);
}

function confidenceNote(value = "") {
  return {
    "live-bye": "Live Tennis: bye encontrado; atleta avancou de rodada sem pontuar",
    "live-win": "Live Tennis: vitoria encontrada",
    "live-loss": "Live Tennis: derrota encontrada",
    "live-pending-match": "Live Tennis: partida pendente",
    "nearby-result": "resultado encontrado perto do nome",
    "nearby-win": "vitoria encontrada perto do nome",
    "nearby-round": "rodada encontrada perto do nome",
    bye: "bye encontrado; atleta avancou de rodada sem pontuar",
    "core-bye": "CoreTennis: bye encontrado; atleta avancou de rodada sem pontuar",
    "core-win": "CoreTennis: vitoria encontrada",
    "core-loss": "CoreTennis: derrota encontrada",
    "core-pending-match": "CoreTennis: partida pendente",
    "itf-api-bye": "ITF API: bye encontrado; atleta avancou de rodada sem pontuar",
    "itf-api-win": "ITF API: vitoria encontrada",
    "itf-api-loss": "ITF API: derrota encontrada",
    "itf-api-pending-match": "ITF API: partida pendente",
    "acceptance-qualifying": "acceptance list: atleta no qualifying, assumido como Q1 ate leitura mais precisa do draw",
    pending: "fase pendente"
  }[value] || value || "fase pendente";
}

function fallbackDrawResult(player) {
  if (player.entryGroup === "Q") {
    return {
      status: "Ativo",
      currentRound: "Q1",
      confidence: "acceptance-qualifying"
    };
  }

  return {
    status: "Ativo",
    currentRound: pendingRound,
    confidence: "pending"
  };
}

function expectedGenderLabel(player) {
  return player.gender === "Girls" || player.sex === "F" ? "GIRLS" : "BOYS";
}

function splitDrawSections(lines) {
  const sections = [];
  let current = {
    gender: "",
    matchType: "",
    drawType: "",
    lines: []
  };

  for (const line of lines) {
    if (/^(BOYS|GIRLS)$/i.test(line)) current = { ...current, gender: line.toUpperCase(), lines: [] };
    if (/^(SINGLES|DOUBLES)$/i.test(line)) current = { ...current, matchType: line.toUpperCase(), lines: [] };
    if (/^(MAIN DRAW|QUALIFYING DRAW)$/i.test(line)) current = { ...current, drawType: line.toUpperCase(), lines: [] };

    current.lines.push(line);
    if (current.gender && current.matchType) {
      sections.push({ ...current, lines: [...current.lines] });
    }
  }

  return sections;
}

function candidateDrawSections(lines, player, matchType = "SINGLES") {
  const expectedGender = expectedGenderLabel(player);
  const sections = splitDrawSections(lines)
    .filter((section) => !section.gender || section.gender === expectedGender)
    .filter((section) => !section.matchType || section.matchType === matchType)
    .filter((section) => !section.drawType || section.drawType === "MAIN DRAW" || section.drawType === "QUALIFYING DRAW");

  if (sections.length) return sections.map((section) => section.lines);
  return [lines];
}

async function fetchJson(url, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "accept": "application/json",
          "user-agent": "Info Tenis Brasil live ranking bot"
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(`Could not fetch ${url}: ${lastError?.message || "unknown error"}`);
}

async function fetchText(url, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "accept": "text/html,application/xhtml+xml",
          "user-agent": "Info Tenis Brasil live ranking bot"
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(`Could not fetch ${url}: ${lastError?.message || "unknown error"}`);
}

async function pageApiGet(page, url, retries = 4) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await page.evaluate(
        async (targetUrl) => {
          const result = await fetch(targetUrl, {
            method: "GET",
            headers: { accept: "application/json, text/plain, */*" }
          });
          return {
            status: result.status,
            text: await result.text()
          };
        },
        url
      );

      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!response.text?.trim()) throw new Error("empty response");
      return JSON.parse(response.text);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }

  throw new Error(`Could not fetch ITF API ${url}: ${lastError?.message || "unknown error"}`);
}

async function pageApiPost(page, url, payload, retries = 4) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await page.evaluate(
        async ({ targetUrl, body }) => {
          const result = await fetch(targetUrl, {
            method: "POST",
            headers: {
              accept: "application/json, text/plain, */*",
              "content-type": "application/json"
            },
            body: JSON.stringify(body)
          });
          return {
            status: result.status,
            text: await result.text()
          };
        },
        { targetUrl: url, body: payload }
      );

      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!response.text?.trim()) throw new Error("empty response");
      return JSON.parse(response.text);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }

  throw new Error(`Could not post ITF API ${url}: ${lastError?.message || "unknown error"}`);
}

async function eventFiltersForTournament(page, tournament) {
  const url = `${itfEventFiltersApiBase}?tournamentKey=${encodeURIComponent(tournament.key)}`;
  const payload = await pageApiGet(page, url);
  const filters = payload.filters || [];
  const events = [];

  for (const playerFilter of filters) {
    for (const matchFilter of playerFilter.subFilter || []) {
      for (const eventFilter of matchFilter.subFilter || []) {
        for (const structureFilter of eventFilter.subFilter || []) {
          events.push({
            tournamentId: payload.tournamentId,
            tourType: payload.tourType,
            circuitCode: payload.circuitCode,
            playerTypeCode: playerFilter.valueCode,
            playerTypeDesc: playerFilter.valueDesc,
            matchTypeCode: matchFilter.valueCode,
            matchTypeDesc: matchFilter.valueDesc,
            eventClassificationCode: eventFilter.valueCode,
            eventClassificationDesc: eventFilter.valueDesc,
            drawsheetStructureCode: structureFilter.valueCode,
            drawsheetStructureDesc: structureFilter.valueDesc
          });
        }
      }
    }
  }

  return events;
}

function drawsheetPayload(event) {
  return {
    tournamentId: event.tournamentId,
    tourType: event.tourType,
    weekNumber: 0,
    playerTypeCode: event.playerTypeCode,
    matchTypeCode: event.matchTypeCode,
    eventClassificationCode: event.eventClassificationCode,
    drawsheetStructureCode: event.drawsheetStructureCode
  };
}

function teamPlayers(team = {}) {
  return (team.players || []).filter(Boolean);
}

function playerIdsForTeam(team = {}) {
  return teamPlayers(team).map((player) => String(player.playerId || "")).filter(Boolean);
}

function teamIsBye(team = {}) {
  return !teamPlayers(team).length;
}

function eventMatchType(event) {
  return event.matchTypeCode === "D" || /doubles/i.test(event.matchTypeDesc || "") ? "Doubles" : "Singles";
}

function eventIsQualifying(event) {
  return event.eventClassificationCode === "Q" || /qual/i.test(event.eventClassificationDesc || "");
}

function roundFromDesc(roundDesc = "", roundNumber = 1, event, matchType = "Singles") {
  const text = String(roundDesc).toLowerCase();
  if (eventIsQualifying(event)) return `Q${roundNumber || 1}`;
  if (/winner|champion/.test(text)) return "W";
  if (/final/.test(text) && !/semi|quarter/.test(text)) return "F";
  if (/semi/.test(text)) return "SF";
  if (/quarter/.test(text)) return "QF";
  if (/\b16\b/.test(text)) return "R16";
  if (/\b32\b/.test(text)) return "R32";
  if (/\b64\b/.test(text)) return "R64";

  const normalizedMatchType = matchType.toUpperCase();
  if (roundNumber === 1) return normalizedMatchType === "DOUBLES" ? "R32" : "R64";
  if (roundNumber === 2) return normalizedMatchType === "DOUBLES" ? "R16" : "R32";
  if (roundNumber === 3) return normalizedMatchType === "DOUBLES" ? "QF" : "R16";
  if (roundNumber === 4) return normalizedMatchType === "DOUBLES" ? "SF" : "QF";
  if (roundNumber === 5) return normalizedMatchType === "DOUBLES" ? "F" : "SF";
  if (roundNumber === 6) return "F";
  return normalizedMatchType === "DOUBLES" ? "R32" : "R64";
}

function teamScoreDisplay(team1 = {}, team2 = {}) {
  const scores1 = team1.scores || [];
  const scores2 = team2.scores || [];
  const parts = [];
  const maxSets = Math.max(scores1.length, scores2.length);

  for (let index = 0; index < maxSets; index += 1) {
    const score1 = scores1[index];
    const score2 = scores2[index];
    if (!score1 || !score2 || score1.score === undefined || score2.score === undefined) continue;
    const tiebreak = score1.losingScore ?? score2.losingScore;
    parts.push(tiebreak === undefined || tiebreak === null ? `${score1.score}-${score2.score}` : `${score1.score}-${score2.score}(${tiebreak})`);
  }

  return parts.join(" ");
}

function resultForTeam({ team, opponent, match, round, matchType }) {
  const teamWon = team?.isWinner === true;
  const opponentWon = opponent?.isWinner === true;
  const hasWinner = teamWon || opponentWon;
  const bye = teamIsBye(opponent);

  if (teamWon) {
    return {
      status: "Ativo",
      currentRound: round === "F" ? "W" : nextRound(round, matchType.toUpperCase()),
      pointsOverride: bye ? 0 : undefined,
      confidence: bye ? "itf-api-bye" : "itf-api-win",
      score: teamScoreDisplay(team, opponent)
    };
  }

  if (opponentWon) {
    return {
      status: "Eliminado",
      currentRound: round,
      confidence: "itf-api-loss",
      score: teamScoreDisplay(team, opponent)
    };
  }

  return {
    status: "Ativo",
    currentRound: round,
    pointsOverride: bye ? 0 : undefined,
    confidence: hasWinner ? "itf-api-win" : "itf-api-pending-match",
    score: teamScoreDisplay(team, opponent)
  };
}

function resultDepth(result, matchType = "Singles") {
  const depth = liveTennisRoundDepth(result.currentRound, matchType);
  const statusWeight = result.status === "Eliminado" ? 3 : 2;
  return depth * 10 + statusWeight;
}

function betterDrawResult(current, candidate, matchType) {
  if (!current) return candidate;
  return resultDepth(candidate, matchType) >= resultDepth(current, matchType) ? candidate : current;
}

function ensureTournamentPlayer(tournament, player) {
  let existing = tournament.acceptedPlayers.find((item) => item.id === player.id);
  if (existing) return existing;

  existing = {
    ...player,
    entryGroup: "",
    position: "",
    sex: player.gender === "Girls" ? "girl" : "boy",
    juniorRank: player.currentRank,
    priority: ""
  };
  tournament.acceptedPlayers.push(existing);
  return existing;
}

function applyDrawsheetToTournament(tournament, event, drawsheet) {
  const matchType = eventMatchType(event);
  const groups = drawsheet.koGroups || [];

  for (const group of groups) {
    for (const roundData of group.rounds || []) {
      const round = roundFromDesc(roundData.roundDesc, roundData.roundNumber, event, matchType);

      for (const match of roundData.matches || []) {
        const teams = match.teams || [];
        const team1 = teams[0] || {};
        const team2 = teams[1] || {};
        const candidates = [
          { team: team1, opponent: team2 },
          { team: team2, opponent: team1 }
        ];

        for (const candidate of candidates) {
          for (const playerId of playerIdsForTeam(candidate.team)) {
            const sourcePlayer = playersByItfId.get(playerId);
            if (!sourcePlayer) continue;

            const player = ensureTournamentPlayer(tournament, sourcePlayer);
            const result = {
              ...resultForTeam({
                team: candidate.team,
                opponent: candidate.opponent,
                match,
                round,
                matchType
              }),
              sourceUrl: tournament.drawsUrl,
              matchId: match.matchId
            };

            if (matchType === "Doubles") {
              player.drawResultDoubles = betterDrawResult(player.drawResultDoubles, result, matchType);
            } else {
              player.drawResult = betterDrawResult(player.drawResult, result, matchType);
            }
          }
        }
      }
    }
  }
}

async function enrichTournamentWithItfApiDraws(tournaments) {
  const tournamentsWithPlayers = tournaments.filter((tournament) => tournament.acceptedPlayers.length);
  if (!tournamentsWithPlayers.length) return tournaments;

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    for (const tournament of tournaments) tournament.itfApiWarning = `Playwright unavailable; ${error.message}`;
    return tournaments;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${itfCalendarPage}?categories=All&startdate=${calendarStartDate()}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(5000);

    for (const tournament of tournamentsWithPlayers) {
      try {
        if (tournament.drawsUrl) {
          await page.goto(tournament.drawsUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
          await page.waitForTimeout(3000);
        }

        const events = await eventFiltersForTournament(page, tournament);
        tournament.itfApiEvents = events.map((event) => ({
          playerTypeCode: event.playerTypeCode,
          matchTypeCode: event.matchTypeCode,
          eventClassificationCode: event.eventClassificationCode,
          drawsheetStructureCode: event.drawsheetStructureCode
        }));

        for (const event of events) {
          const drawsheet = await pageApiPost(page, itfDrawsheetApi, drawsheetPayload(event));
          applyDrawsheetToTournament(tournament, event, drawsheet);
        }
      } catch (error) {
        tournament.itfApiWarning = error.message;
      }
    }
  } finally {
    await browser.close();
  }

  return tournaments;
}

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&raquo;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function normalizeTournamentUrl(url) {
  return url.replace(/\/(acceptance-list|draws-and-results)\/?$/, "").replace(/\/$/, "");
}

function rowsFromTablePayload(payload, tableName) {
  const table = payload?.[tableName];
  if (!table) return [];
  const { fields, tournaments, entries } = table;
  const sourceRows = tournaments || entries || [];
  return sourceRows.map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

function coreTournamentRoundsUrl(infoUrl) {
  return infoUrl
    .replace("/0t0100000d/", "/0r0100000c/")
    .replace("/Tournament-Info.html", "/Tournament-Rounds.html");
}

function coreGender(player) {
  return player.gender === "Girls" || player.sex === "F" ? "Girls" : "Boys";
}

function liveTennisPartId(player, matchType = "Singles") {
  const genderPrefix = coreGender(player) === "Girls" ? "G" : "B";
  const typeSuffix = matchType === "Doubles" ? "D" : "S";
  return `${genderPrefix}${typeSuffix}`;
}

function coreRoundForTab(index) {
  return ["R64", "R32", "R16", "QF", "SF", "F"][index - 1] || "";
}

function playerNameMatchesCoreName(player, coreName = "") {
  const playerTokens = new Set(normalizeName(player.name).split(" ").filter(Boolean));
  const coreTokens = normalizeName(coreName.replace(",", " ")).split(" ").filter(Boolean);
  return coreTokens.length > 0 && coreTokens.every((token) => playerTokens.has(token));
}

function playerNameFromCoreCell(cellHtml = "") {
  const linkMatch = cellHtml.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
  if (!linkMatch) return stripTags(cellHtml);
  return stripTags(linkMatch[1]);
}

function coreCellIsEmptyPlayer(cellHtml = "") {
  const text = stripTags(cellHtml);
  return !text || text === "-";
}

function liveTennisRoundForSize(size, matchType = "Singles") {
  if (matchType === "Doubles") {
    if (size >= 16) return "R16";
    if (size >= 8) return "QF";
    if (size >= 4) return "SF";
    if (size >= 2) return "F";
    return "QF";
  }

  if (size >= 64) return "R64";
  if (size >= 32) return "R32";
  if (size >= 16) return "R16";
  if (size >= 8) return "QF";
  if (size >= 4) return "SF";
  if (size >= 2) return "F";
  return "R32";
}

function advanceRound(round = "", shift = 0, matchType = "Singles") {
  let current = normalizeDrawRound(round, matchType.toUpperCase());
  for (let index = 0; index < shift; index += 1) current = nextRound(current, matchType.toUpperCase());
  return current;
}

function liveTennisRoundDepth(round = "", matchType = "Singles") {
  const singlesOrder = ["R64", "R32", "R16", "QF", "SF", "F", "W"];
  const doublesOrder = ["R16", "QF", "SF", "F", "W"];
  const order = matchType === "Doubles" ? doublesOrder : singlesOrder;
  return order.indexOf(normalizeDrawRound(round, matchType.toUpperCase()));
}

function parseLiveTennisRows(blockHtml = "") {
  return [...blockHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => {
    const rowHtml = match[1];
    const cells = [...rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    const seq = Number(stripTags(cells[0]?.[2] || "")) || 0;
    const gridColumns = [];
    const scoreColumns = [];

    for (const [, attrs, html] of cells.slice(1)) {
      const className = attrs.match(/class=["']([^"']*)["']/i)?.[1] || "";
      if (/\bcDrawGridScore\b/i.test(className)) {
        scoreColumns.push(stripTags(html));
        continue;
      }
      if (!/\bcDrawGrid\b/i.test(className)) continue;

      const names = [...html.matchAll(/<pname\b[^>]*alt="([^"]+)"[^>]*>/gi)].map((nameMatch) => decodeHtml(nameMatch[1]));
      if (!names.length && /Bye/i.test(stripTags(html))) names.push("Bye");
      gridColumns.push(names);
    }

    return { seq, gridColumns, scoreColumns };
  }).filter((row) => row.seq > 0);
}

function chooseLiveTennisBlock(fragmentHtml = "", partId) {
  const blocks = [...fragmentHtml.matchAll(new RegExp(`<div class="cDrawPart[^"]*" data-id="${partId}"[^>]*>([\\s\\S]*?)(?=<div class="cDrawPart|$)`, "gi"))]
    .map((match) => match[1]);
  if (!blocks.length) return "";
  return blocks.find((block) => /cDrawPartTitle>\s*Sections\s*</i.test(block)) || blocks[blocks.length - 1];
}

function parseLiveTennisDraw(fragmentHtml, player, matchType = "Singles") {
  const partId = liveTennisPartId(player, matchType);
  const blockHtml = chooseLiveTennisBlock(fragmentHtml, partId);
  if (!blockHtml) return null;

  const rows = parseLiveTennisRows(blockHtml);
  if (!rows.length) return null;

  const baseRound = liveTennisRoundForSize(Math.max(...rows.map((row) => row.seq)), matchType);
  let bestResult = null;
  let bestMeta = null;

  for (let index = 0; index < rows.length; index += 2) {
    const pair = rows.slice(index, index + 2);
    const playerIndexes = [];
    let hasBye = false;

    pair.forEach((row) => {
      row.gridColumns.forEach((names, columnIndex) => {
        if (names.some((name) => /bye/i.test(name))) hasBye = true;
        if (names.some((name) => playerNameMatchesCoreName(player, name))) playerIndexes.push(columnIndex);
      });
    });

    if (!playerIndexes.length) continue;

    const earliestIndex = Math.min(...playerIndexes);
    const latestIndex = Math.max(...playerIndexes);
    const hasScore = pair.some((row) => row.scoreColumns.some((score) => cleanLine(score)));
    const currentRound = advanceRound(baseRound, latestIndex, matchType);
    const result = latestIndex > earliestIndex
      ? {
          status: "Ativo",
          currentRound,
          pointsOverride: hasBye && !hasScore ? 0 : undefined,
          confidence: hasBye && !hasScore ? "live-bye" : "live-win"
        }
      : hasScore
        ? {
            status: "Eliminado",
            currentRound: advanceRound(baseRound, earliestIndex, matchType),
            confidence: "live-loss"
          }
        : {
            status: "Ativo",
            currentRound,
            pointsOverride: hasBye ? 0 : undefined,
            confidence: "live-pending-match"
          };
    const meta = {
      depth: liveTennisRoundDepth(result.currentRound, matchType),
      statusWeight: result.status === "Ativo" ? 2 : 1,
      progression: latestIndex - earliestIndex,
      hitCount: playerIndexes.length,
      pairIndex: index
    };

    if (
      !bestResult ||
      meta.depth > bestMeta.depth ||
      (meta.depth === bestMeta.depth && meta.statusWeight > bestMeta.statusWeight) ||
      (meta.depth === bestMeta.depth && meta.statusWeight === bestMeta.statusWeight && meta.progression > bestMeta.progression) ||
      (meta.depth === bestMeta.depth && meta.statusWeight === bestMeta.statusWeight && meta.progression === bestMeta.progression && meta.hitCount > bestMeta.hitCount) ||
      (meta.depth === bestMeta.depth && meta.statusWeight === bestMeta.statusWeight && meta.progression === bestMeta.progression && meta.hitCount === bestMeta.hitCount && meta.pairIndex > bestMeta.pairIndex)
    ) {
      bestResult = result;
      bestMeta = meta;
    }
  }

  return bestResult;
}

function parseCoreRoundGroups(roundHtml = "") {
  const rows = [...roundHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const groups = [];
  let group = [];

  for (const row of rows) {
    if (/height=["']?30/i.test(row)) {
      if (group.length) groups.push(group);
      group = [];
      continue;
    }
    group.push(row);
  }
  if (group.length) groups.push(group);

  return groups.map((groupRows) => {
    const playerCells = [];
    let winnerCell = "";
    let score = "";

    for (const row of groupRows) {
      const cells = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
      for (const [, attrs, html] of cells) {
        const className = attrs.match(/class=["']([^"']*)["']/i)?.[1] || "";
        if (/\bplayer\b/.test(className)) playerCells.push(html);
        if (/\bwinner\b/.test(className)) winnerCell = html;
        if (/\bres\b/.test(className)) score = stripTags(html);
      }
    }

    return {
      players: playerCells.map((html) => ({
        name: playerNameFromCoreCell(html),
        empty: coreCellIsEmptyPlayer(html)
      })),
      winner: playerNameFromCoreCell(winnerCell),
      winnerEmpty: coreCellIsEmptyPlayer(winnerCell),
      score
    };
  });
}

function parseCoreRounds(html, player) {
  const roundSections = [...html.matchAll(/<div id=["']tcontent(\d+)["'][^>]*>([\s\S]*?)(?=<div id=["']tcontent\d+["']|<\/div>\s*<script)/gi)];

  for (const [, tabIndex, roundHtml] of roundSections) {
    const round = coreRoundForTab(Number(tabIndex));
    if (!round) continue;

    for (const group of parseCoreRoundGroups(roundHtml)) {
      const playerInMatch = group.players.some((entry) => !entry.empty && playerNameMatchesCoreName(player, entry.name));
      if (!playerInMatch) continue;

      const playerWon = !group.winnerEmpty && playerNameMatchesCoreName(player, group.winner);
      const hasBye = group.players.some((entry) => entry.empty);

      if (playerWon && hasBye && !group.score) {
        return { status: "Ativo", currentRound: nextRound(round), pointsOverride: 0, confidence: "core-bye" };
      }
      if (playerWon) {
        return { status: "Ativo", currentRound: nextRound(round), confidence: "core-win" };
      }
      if (group.score) {
        return { status: "Eliminado", currentRound: round, confidence: "core-loss" };
      }

      return { status: "Ativo", currentRound: round, pointsOverride: 0, confidence: "core-pending-match" };
    }
  }

  return null;
}

async function findCoreTennisRoundsUrl(tournament, gender, cache) {
  if (!cache.calendars.has(gender)) {
    cache.calendars.set(gender, await fetchText(coreTennisCalendars[gender]));
  }

  const html = cache.calendars.get(gender);
  const cards = [...html.matchAll(/<div class=["']tournTitle["']>([\s\S]*?)<a href=["']([^"']*Tournament-Info\.html)["'][^>]*class=["']fullResults["']/gi)];
  const normalizedTournament = normalizeName(tournament.tournamentName);
  const normalizedGrade = normalizeName(tournament.grade);

  for (const [, cardHtml, href] of cards) {
    const normalizedCard = normalizeName(stripTags(cardHtml));
    if (!normalizedCard.includes(normalizedTournament)) continue;
    if (normalizedGrade && !normalizedCard.includes(normalizedGrade)) continue;
    if (!normalizedCard.includes(gender.toLowerCase())) continue;
    return coreTournamentRoundsUrl(new URL(href, coreTennisBaseUrl).href);
  }

  return "";
}

async function enrichTournamentWithCoreTennisRounds(tournaments) {
  const cache = { calendars: new Map(), rounds: new Map() };

  for (const tournament of tournaments.filter((item) => item.acceptedPlayers.length)) {
    for (const player of tournament.acceptedPlayers) {
      if (player.drawResult && player.drawResult.currentRound && player.drawResult.currentRound !== pendingRound) continue;
      try {
        const gender = coreGender(player);
        const roundsUrl = await findCoreTennisRoundsUrl(tournament, gender, cache);
        if (!roundsUrl) continue;

        if (!cache.rounds.has(roundsUrl)) cache.rounds.set(roundsUrl, await fetchText(roundsUrl));
        const result = parseCoreRounds(cache.rounds.get(roundsUrl), player);
        if (!result) continue;

        player.drawResult = {
          ...result,
          sourceUrl: roundsUrl
        };
        tournament.coreTennisUrls = [...new Set([...(tournament.coreTennisUrls || []), roundsUrl])];
      } catch (error) {
        tournament.coreTennisWarning = error.message;
      }
    }
  }

  return tournaments;
}

function liveTennisDrawUrl(tournament) {
  const year = tournament.startDate?.slice(0, 4) || "2026";
  return `${liveTennisBaseUrl}/en/draw/${tournament.key}/${year}`;
}

function liveTennisDrawFragmentUrl(tournament) {
  const year = tournament.startDate?.slice(0, 4) || "2026";
  return `${liveTennisBaseUrl}/en/draw/ajax/${tournament.key}/${year}/device/0/horizontal/false`;
}

async function fetchLiveTennisFragment(tournament, retries = 3) {
  const url = liveTennisDrawFragmentUrl(tournament);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html, */*; q=0.01",
          referer: liveTennisDrawUrl(tournament),
          "user-agent": "Mozilla/5.0",
          "x-requested-with": "XMLHttpRequest"
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (!/iDrawPartSelector|cDrawPart/i.test(text)) throw new Error("fragmento do draw nao encontrado");
      return text;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw new Error(`Could not fetch ${url}: ${lastError?.message || "unknown error"}`);
}

async function enrichTournamentWithLiveTennisDraws(tournaments) {
  for (const tournament of tournaments.filter((item) => item.acceptedPlayers.length)) {
    try {
      const fragmentHtml = await fetchLiveTennisFragment(tournament);
      tournament.liveTennisUrl = liveTennisDrawUrl(tournament);

      tournament.acceptedPlayers = tournament.acceptedPlayers.map((player) => {
        const singlesResult = parseLiveTennisDraw(fragmentHtml, player, "Singles");
        const doublesResult = parseLiveTennisDraw(fragmentHtml, player, "Doubles");

        return {
          ...player,
          drawResult: singlesResult && (!player.drawResult || player.drawResult.currentRound === pendingRound)
            ? { ...singlesResult, sourceUrl: tournament.liveTennisUrl }
            : player.drawResult,
          drawResultDoubles: doublesResult && !player.drawResultDoubles
            ? { ...doublesResult, sourceUrl: tournament.liveTennisUrl }
            : player.drawResultDoubles || null
        };
      });
    } catch (error) {
      tournament.liveTennisWarning = error.message;
    }
  }

  return tournaments;
}

async function currentWeekTournamentsFromItfEntries() {
  const payload = await fetchJson(`${itfEntriesBaseUrl}/api/junior-tournaments`);
  const tournaments = payload.tournaments?.map((row) => Object.fromEntries(payload.fields.map((field, index) => [field, row[index]]))) || [];

  return tournaments
    .map((tournament) => {
      const { startDate, endDate } = parseDateRange(tournament.dates || "");
      return {
        tournamentName: tournament.name,
        grade: tournament.cat || gradeFromTournamentName(tournament.name),
        startDate: tournament.start ? tournament.start.slice(0, 10) : startDate,
        endDate,
        status: tournament.status || "",
        country: tournament.country || "",
        surface: tournament.surf || "",
        key: tournament.key,
        acceptanceListUrl: `${itfBaseUrl}${tournament.link}acceptance-list`,
        drawsUrl: `${itfBaseUrl}${tournament.link}draws-and-results`,
        itfEntriesUrl: `${itfEntriesBaseUrl}/tournament/${tournament.key}`
      };
    })
    .filter((tournament) => tournament.status !== "CN" && tournament.status !== "PP")
    .filter((tournament) => overlapsCurrentWeek(tournament.startDate, tournament.endDate));
}

async function storedWeeklyPreviewTournaments() {
  try {
    const raw = await fs.readFile(previewFile, "utf8");
    const payload = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!payload || payload.calendarStartDate !== calendarStartDate()) return [];
    return Array.isArray(payload.tournaments) ? payload.tournaments : [];
  } catch {
    return [];
  }
}

function prepareStoredTournamentFallback(tournament = {}) {
  return {
    ...tournament,
    acceptedPlayers: Array.isArray(tournament.acceptedPlayers)
      ? tournament.acceptedPlayers.map((player) => ({
          ...player,
          drawResult: null,
          drawResultDoubles: null
        }))
      : [],
    outsiderCandidates: Array.isArray(tournament.outsiderCandidates) ? tournament.outsiderCandidates : [],
    warning: "",
    drawWarning: "",
    coreTennisWarning: "",
    liveTennisWarning: ""
  };
}

async function scrapeTournament(tournament) {
  const payload = await fetchJson(`${itfEntriesBaseUrl}/api/tournament/${tournament.key}`);
  const acceptanceRows = rowsFromTablePayload(payload, "acceptanceList");
  const acceptedPlayers = [];
  const outsiderCandidates = [];

  for (const entry of acceptanceRows) {
    if (entry.isAvailable || entry.isExemption || entry.entryGroup === "WD") continue;
    const playerName = acceptanceEntryName(entry);
    const player = playersByItfId.get(String(entry.id)) || playersByNormalizedName.get(normalizeName(playerName));
    if (!player) {
      outsiderCandidates.push({
        playerItfId: String(entry.id || "").trim(),
        playerName,
        gender: acceptanceEntryGender(entry),
        country: entry.nat || entry.nationality || entry.country || "",
        juniorRank: entry.jrRank || "",
        entryGroup: entry.entryGroup || "",
        tournamentName: tournament.tournamentName,
        sourceUrl: tournament.itfEntriesUrl,
        drawsUrl: tournament.drawsUrl,
        notes: `Encontrado na acceptance list do itf-entries (${entry.entryGroup || "sem grupo"}).`
      });
      continue;
    }

    acceptedPlayers.push({
      ...player,
      entryGroup: entry.entryGroup,
      position: entry.position,
      sex: entry.sex,
      juniorRank: entry.jrRank,
      priority: entry.prio
    });
  }

  return {
    ...tournament,
    acceptedPlayers,
    outsiderCandidates
  };
}

function outsiderKey(candidate = {}) {
  return `${candidate.gender || ""}|${candidate.playerItfId || normalizeName(candidate.playerName || "")}`;
}

function outsiderRankValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Infinity;
}

function aggregateOutsiders(tournaments = []) {
  const outsiders = new Map();

  for (const tournament of tournaments) {
    for (const candidate of tournament.outsiderCandidates || []) {
      const key = outsiderKey(candidate);
      if (!key.trim()) continue;

      if (!outsiders.has(key)) {
        outsiders.set(key, {
          player_itf_id: candidate.playerItfId || "",
          player_name: candidate.playerName || "",
          gender: candidate.gender || "",
          country: candidate.country || "",
          junior_rank: candidate.juniorRank || "",
          entry_groups: new Set(),
          tournaments: new Set(),
          source_urls: new Set(),
          draw_urls: new Set(),
          notes: new Set()
        });
      }

      const outsider = outsiders.get(key);
      if (!outsider.player_name && candidate.playerName) outsider.player_name = candidate.playerName;
      if (!outsider.country && candidate.country) outsider.country = candidate.country;
      if (!outsider.junior_rank && candidate.juniorRank) outsider.junior_rank = candidate.juniorRank;
      outsider.entry_groups.add(candidate.entryGroup || "sem grupo");
      outsider.tournaments.add(candidate.tournamentName || "");
      outsider.source_urls.add(candidate.sourceUrl || "");
      outsider.draw_urls.add(candidate.drawsUrl || "");
      outsider.notes.add(candidate.notes || "");
    }
  }

  return [...outsiders.values()]
    .map((item) => ({
      player_itf_id: item.player_itf_id,
      player_name: item.player_name,
      gender: item.gender,
      country: item.country,
      junior_rank: item.junior_rank,
      entry_groups: [...item.entry_groups].filter(Boolean).sort().join(" | "),
      tournaments: [...item.tournaments].filter(Boolean).sort().join(" | "),
      source_urls: [...item.source_urls].filter(Boolean).sort().join(" | "),
      draw_urls: [...item.draw_urls].filter(Boolean).sort().join(" | "),
      notes: [...item.notes].filter(Boolean).sort().join(" | ")
    }))
    .sort((a, b) =>
      a.gender.localeCompare(b.gender) ||
      outsiderRankValue(a.junior_rank) - outsiderRankValue(b.junior_rank) ||
      a.player_name.localeCompare(b.player_name)
    );
}

function lineOutcomeScore(lines, index) {
  const after = lines.slice(index + 1, index + 16);
  const before = lines.slice(Math.max(0, index - 16), index).reverse();
  const round = [...before, ...after].find(isRound);
  const outcome = [...after, ...before].find((line) => line === "W" || line === "L") || "";
  const bye = [...after, ...before].some((line) => line === "BYE");

  if (!round && !bye) return null;
  return {
    round: round || "R64",
    outcome,
    bye,
    score: (outcome ? 3 : 1) + (bye ? 2 : 0) + (before.find(isRound) ? 1 : 0)
  };
}

function drawStatusForPlayer(text, player, matchType = "SINGLES", options = {}) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const playerName = normalizeName(player.name);
  const candidates = [];

  for (const sectionLines of candidateDrawSections(lines, player, matchType)) {
    const candidateIndexes = sectionLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        const normalizedLine = normalizeName(line);
        return normalizedLine === playerName || normalizedLine.includes(playerName);
      })
      .map(({ index }) => index);

    for (const index of candidateIndexes) {
      const outcomeScore = lineOutcomeScore(sectionLines, index);
      if (!outcomeScore) continue;
      candidates.push(outcomeScore);
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best) return options.missingAsNull ? null : { status: "Ativo", currentRound: pendingRound, confidence: "pending" };

  if (best.bye && !best.outcome) {
    return { status: "Ativo", currentRound: nextRound(best.round, matchType), pointsOverride: 0, confidence: "bye" };
  }

  if (best.outcome === "L") {
    return { status: "Eliminado", currentRound: roundForOutcome(best.round, best.outcome, matchType), confidence: "nearby-result" };
  }

  return {
    status: "Ativo",
    currentRound: roundForOutcome(best.round, best.outcome, matchType),
    confidence: best.outcome === "W" ? "nearby-win" : "nearby-round"
  };
}

function drawDiagnostic(text, players) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const interestingLines = lines.filter((line) => {
    if (/^(BOYS|GIRLS|SINGLES|DOUBLES|MAIN DRAW|QUALIFYING DRAW|R1|R2|R3|R4|R16|R32|R64|Q1|Q2|Q3|Q4|QF|SF|F|W|L|BYE)$/i.test(line)) return true;
    return players.some((player) => normalizeName(line).includes(normalizeName(player.name)));
  });

  return {
    textLength: text.length,
    lineCount: lines.length,
    firstLines: lines.slice(0, 80),
    interestingLines: [...new Set(interestingLines)].slice(0, 160),
    playerHits: players.map((player) => {
      const normalizedPlayerName = normalizeName(player.name);
      const hitIndexes = lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => normalizeName(line).includes(normalizedPlayerName))
        .map(({ index }) => index);

      return {
        id: player.id,
        name: player.name,
        hits: hitIndexes.length,
        snippets: hitIndexes.slice(0, 3).map((index) => lines.slice(Math.max(0, index - 5), index + 6))
      };
    })
  };
}

async function clickIfPresent(page, label) {
  const locator = page.getByText(label, { exact: true }).first();
  if ((await locator.count()) === 0) return false;
  try {
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(1500);
    return true;
  } catch {
    return false;
  }
}

async function readDrawPageText(page, tournament, networkUrls = []) {
  const collectUrl = (response) => {
    const url = response.url();
    if (/draw|result|match|tournament|api|umbraco|itf/i.test(url)) networkUrls.push(url);
  };

  page.on("response", collectUrl);
  await page.goto(tournament.drawsUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(6000);

  const texts = [await page.locator("body").innerText({ timeout: 45000 })];
  for (const gender of ["BOYS", "GIRLS"]) {
    await clickIfPresent(page, gender);
    for (const matchType of ["SINGLES", "DOUBLES"]) {
      await clickIfPresent(page, matchType);
      for (const drawType of ["MAIN DRAW", "QUALIFYING DRAW"]) {
        if (await clickIfPresent(page, drawType)) {
          texts.push(await page.locator("body").innerText({ timeout: 45000 }));
        }
      }
    }
  }

  page.off("response", collectUrl);
  return [...new Set(texts)].join("\n");
}

async function enrichTournamentWithDrawRounds(tournaments) {
  const tournamentsWithPlayers = tournaments.filter((tournament) =>
    tournament.acceptedPlayers.some(
      (player) =>
        !player.drawResult ||
        player.drawResult.currentRound === pendingRound ||
        !player.drawResultDoubles
    )
  );
  if (!tournamentsWithPlayers.length) return tournaments;

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    for (const tournament of tournamentsWithPlayers) {
      tournament.drawWarning = `Playwright unavailable; ${error.message}`;
    }
    return tournaments;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    for (const tournament of tournamentsWithPlayers) {
      try {
        const networkUrls = [];
        const text = await readDrawPageText(page, tournament, networkUrls);
        tournament.drawDiagnostic = {
          ...drawDiagnostic(text, tournament.acceptedPlayers),
          networkUrls: [...new Set(networkUrls)].slice(0, 120)
        };

        tournament.acceptedPlayers = tournament.acceptedPlayers.map((player) => ({
          ...player,
          drawResultDoubles:
            player.drawResultDoubles ||
            drawStatusForPlayer(text, player, "DOUBLES", { missingAsNull: true }),
          drawResult: player.drawResult && player.drawResult.currentRound !== pendingRound
            ? player.drawResult
            : drawStatusForPlayer(text, player)
        }));
      } catch (error) {
        tournament.drawWarning = `Could not read draw page; ${error.message}`;
      }
    }
  } finally {
    await browser.close();
  }

  return tournaments;
}

const tournaments = [];
const storedWeeklyTournaments = await storedWeeklyPreviewTournaments();
const storedTournamentsByKey = new Map(
  storedWeeklyTournaments
    .filter((tournament) => tournament?.key)
    .map((tournament) => [tournament.key, prepareStoredTournamentFallback(tournament)])
);

try {
  const currentWeekTournaments = await currentWeekTournamentsFromItfEntries();
  const tournamentsToProcess = currentWeekTournaments.length
    ? currentWeekTournaments
    : storedWeeklyTournaments.map(prepareStoredTournamentFallback);

  if (!currentWeekTournaments.length && tournamentsToProcess.length) {
    console.warn("itf-entries returned no tournaments for the current week; using stored weekly preview fallback.");
  }

  for (const tournament of tournamentsToProcess) {
    try {
      tournaments.push(await scrapeTournament(tournament));
    } catch (error) {
      const storedFallback = storedTournamentsByKey.get(tournament.key);
      if (storedFallback?.acceptedPlayers?.length) {
        tournaments.push({
          ...storedFallback,
          ...tournament,
          acceptedPlayers: storedFallback.acceptedPlayers,
          outsiderCandidates: storedFallback.outsiderCandidates,
          warning: `${error.message} | fallback: stored weekly preview`
        });
        continue;
      }

      tournaments.push({
        ...tournament,
        acceptedPlayers: [],
        warning: error.message
      });
    }
  }
} catch (error) {
  console.warn(`Could not scrape itf-entries weekly tournaments: ${error.message}`);
  if (storedWeeklyTournaments.length) {
    console.warn("Using stored weekly preview fallback for current-week tournaments.");
    tournaments.push(...storedWeeklyTournaments.map(prepareStoredTournamentFallback));
  }
}

await enrichTournamentWithItfApiDraws(tournaments);
await enrichTournamentWithLiveTennisDraws(tournaments);
await enrichTournamentWithCoreTennisRounds(tournaments);
await enrichTournamentWithDrawRounds(tournaments);

const outsiders = aggregateOutsiders(tournaments);

const rows = [headers];
for (const tournament of tournaments) {
  for (const player of tournament.acceptedPlayers) {
    const drawResult = !player.drawResult || player.drawResult.currentRound === pendingRound
      ? fallbackDrawResult(player)
      : player.drawResult;
    rows.push([
      player.id,
      player.name,
      "Singles",
      tournament.tournamentName,
      tournament.grade,
      tournament.startDate,
      tournament.endDate,
      drawResult.status,
      drawResult.currentRound,
      drawResult.pointsOverride ?? "",
      drawResult.sourceUrl || tournament.drawsUrl,
      `Encontrado na acceptance list do itf-entries (${player.entryGroup || "sem grupo"}); leitura do draw: ${confidenceNote(drawResult.confidence)}.`
    ]);

    if (player.drawResultDoubles) {
      rows.push([
        player.id,
        player.name,
        "Doubles",
        tournament.tournamentName,
        tournament.grade,
        tournament.startDate,
        tournament.endDate,
        player.drawResultDoubles.status,
        player.drawResultDoubles.currentRound,
        player.drawResultDoubles.pointsOverride ?? "",
        player.drawResultDoubles.sourceUrl || tournament.drawsUrl,
        `Encontrado no draw de duplas; leitura do draw: ${confidenceNote(player.drawResultDoubles.confidence)}.`
      ]);
    }
  }
}

await fs.writeFile(outputFile, `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`, "utf8");
await fs.writeFile(
  outsidersOutputFile,
  `${[outsiderHeaders, ...outsiders.map((item) => outsiderHeaders.map((header) => item[header] || ""))]
    .map((row) => row.map(csvValue).join(","))
    .join("\n")}\n`,
  "utf8"
);
await fs.writeFile(
  previewFile,
  `${JSON.stringify(
    {
      scrapedAt: new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
      }).format(new Date()),
      calendarStartDate: calendarStartDate(),
      tournaments
    },
    null,
    2
  )}\n`,
  "utf8"
);
await fs.writeFile(
  outsidersPreviewFile,
  `${JSON.stringify(
    {
      scrapedAt: new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
      }).format(new Date()),
      outsidersFound: outsiders.length,
      boysOutsiders: outsiders.filter((item) => item.gender === "Boys").length,
      girlsOutsiders: outsiders.filter((item) => item.gender === "Girls").length,
      outsiders
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Found ${tournaments.length} current-week tournament(s).`);
console.log(`Generated ${path.relative(rootDir, outputFile)} with ${rows.length - 1} weekly result row(s).`);
console.log(`Generated ${path.relative(rootDir, outsidersOutputFile)} with ${outsiders.length} outsider candidate(s).`);
