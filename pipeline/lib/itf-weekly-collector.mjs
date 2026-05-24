const itfBaseUrl = "https://www.itftennis.com";
const itfCalendarPage = "https://www.itftennis.com/en/tournament-calendar/world-tennis-tour-juniors-calendar/";
const itfCalendarApiBase = "https://www.itftennis.com/tennis/api/TournamentApi/GetCalendar";
const itfEventFiltersApiBase = "https://www.itftennis.com/tennis/api/TournamentApi/GetEventFilters";
const itfDrawsheetApi = "https://www.itftennis.com/tennis/api/TournamentApi/GetDrawsheet";
const itfPrintDrawBase = "https://www.itftennis.com/en/tournament/draws-and-results/print/";
const pendingRound = "Pendente";

export function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function normalizeName(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function flattenObject(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { [prefix || "value"]: value };
  }

  const flattened = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedKey = prefix ? `${prefix}_${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      Object.assign(flattened, flattenObject(nestedValue, nestedKey));
    } else if (Array.isArray(nestedValue)) {
      flattened[nestedKey] = JSON.stringify(nestedValue);
    } else {
      flattened[nestedKey] = nestedValue;
    }
  }

  return flattened;
}

function findFirstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested)) return nested;
  }

  for (const nested of Object.values(value)) {
    const found = findFirstArray(nested);
    if (found) return found;
  }

  return null;
}

function gradeFromTournamentName(value = "") {
  return value.match(/\b(JGS|JM|J500|J300|J200|J100|J60|J30)\b/i)?.[1]?.toUpperCase() || "";
}

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&raquo;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function saoPauloTimestamp() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date());
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

function calendarDate(value) {
  return value.toISOString().slice(0, 10);
}

export function currentWeekBounds() {
  const today = saoPauloToday();
  const day = today.getUTCDay() || 7;
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - day + 1);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function calendarStartDate() {
  const { start } = currentWeekBounds();
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentWeekDateRange() {
  const { start, end } = currentWeekBounds();
  return { startDate: calendarDate(start), endDate: calendarDate(end) };
}

function overlapsCurrentWeek(startDate, endDate) {
  if (!startDate || !endDate) return false;
  const { start, end } = currentWeekBounds();
  const tournamentStart = new Date(`${startDate}T00:00:00Z`);
  const tournamentEnd = new Date(`${endDate}T23:59:59Z`);
  return tournamentStart <= end && start <= tournamentEnd;
}

function playerItfId(player) {
  return player.pointsBreakdownUrl?.match(/\/players\/[^/]+\/([^/]+)\//)?.[1] || "";
}

function buildPlayerIndexes(players = []) {
  return {
    byItfId: new Map(players.map((player) => [playerItfId(player), player]).filter(([id]) => id)),
    byNormalizedName: new Map(players.map((player) => [normalizeName(player.name), player])),
    all: players
  };
}

function eventGender(event) {
  return String(event.playerTypeCode || "").toUpperCase() === "G" ? "Girls" : "Boys";
}

function eventMatchType(event) {
  return event.matchTypeCode === "D" || /doubles/i.test(event.matchTypeDesc || "") ? "Doubles" : "Singles";
}

function eventEntryGroup(event) {
  return event.eventClassificationCode === "Q" || /qual/i.test(event.eventClassificationDesc || "") ? "Q" : "MD";
}

function roundFromDesc(roundDesc = "", roundNumber = 1, event, matchType = "Singles") {
  const text = String(roundDesc).toLowerCase();

  if (eventEntryGroup(event) === "Q") return `Q${roundNumber || 1}`;
  if (/winner|champion/.test(text)) return "W";
  if (/final/.test(text) && !/semi|quarter/.test(text)) return "F";
  if (/semi/.test(text)) return "SF";
  if (/quarter/.test(text)) return "QF";
  if (/\b16\b/.test(text)) return "R16";
  if (/\b32\b/.test(text)) return "R32";
  if (/\b64\b/.test(text)) return "R64";

  if (matchType === "Doubles") {
    if (roundNumber === 1) return "R32";
    if (roundNumber === 2) return "R16";
    if (roundNumber === 3) return "QF";
    if (roundNumber === 4) return "SF";
    if (roundNumber === 5) return "F";
    return "R32";
  }

  if (roundNumber === 1) return "R64";
  if (roundNumber === 2) return "R32";
  if (roundNumber === 3) return "R16";
  if (roundNumber === 4) return "QF";
  if (roundNumber === 5) return "SF";
  if (roundNumber === 6) return "F";
  return "R64";
}

function normalizeDrawRound(value = "", matchType = "SINGLES") {
  const round = String(value || "").toUpperCase();
  if (/^Q[1-4]$/.test(round)) return round;

  if (matchType === "DOUBLES") {
    if (round === "R1") return "R32";
    if (round === "R2") return "R16";
    if (round === "R3") return "QF";
    if (round === "R4") return "SF";
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

function liveRoundDepth(round = "", matchType = "Singles") {
  const singlesOrder = ["Q1", "Q2", "Q3", "Q4", "R64", "R32", "R16", "QF", "SF", "F", "W"];
  const doublesOrder = ["Q1", "Q2", "Q3", "Q4", "R32", "R16", "QF", "SF", "F", "W"];
  const order = matchType === "Doubles" ? doublesOrder : singlesOrder;
  return order.indexOf(normalizeDrawRound(round, matchType.toUpperCase()));
}

function resultDepth(result, matchType = "Singles") {
  const depth = liveRoundDepth(result.currentRound, matchType);
  const statusWeight = result.status === "Eliminado" ? 3 : 2;
  return depth * 10 + statusWeight;
}

function betterDrawResult(current, candidate, matchType) {
  if (!current) return candidate;
  return resultDepth(candidate, matchType) >= resultDepth(current, matchType) ? candidate : current;
}

function tournamentFromCalendarRow(row = {}) {
  const flattened = flattenObject(row);
  const tournamentUrl = tournamentUrlFromCalendarLink(
    row.tournamentLink || row.link || flattened.tournamentLink || flattened.link
  );
  const drawsUrl = tournamentUrl ? `${tournamentUrl.replace(/\/$/, "")}/draws-and-results/` : "";

  return {
    tournamentName: flattened.tournamentName || flattened.name || "",
    grade: flattened.category || gradeFromTournamentName(flattened.tournamentName || flattened.name || ""),
    startDate: String(flattened.startDate || "").slice(0, 10),
    endDate: String(flattened.endDate || "").slice(0, 10),
    status: flattened.status || "",
    country: flattened.hostNation || flattened.country || "",
    surface: flattened.surfaceDesc || flattened.surface || "",
    key: flattened.tournamentKey || "",
    tournamentId: flattened.tournamentId || flattened.id || "",
    tourType: flattened.tourType || flattened.tournamentType || "N",
    tournamentUrl,
    drawsUrl,
    acceptedPlayers: [],
    outsiderCandidates: [],
    events: [],
    drawsheetsSummary: [],
    itfApiWarning: "",
    drawWarning: "",
    fallbackUsed: false
  };
}

function tournamentUrlFromCalendarLink(link = "") {
  if (!link) return "";
  return link.startsWith("http") ? link : `${itfBaseUrl}${link}`;
}

function storedTournamentFallback(tournament = {}) {
  return {
    tournamentName: tournament.tournamentName || "",
    grade: tournament.grade || "",
    startDate: tournament.startDate || "",
    endDate: tournament.endDate || "",
    status: tournament.status || "",
    country: tournament.country || "",
    surface: tournament.surface || "",
    key: tournament.key || "",
    tournamentId: tournament.tournamentId || "",
    tourType: tournament.tourType || "N",
    tournamentUrl: tournament.tournamentUrl || "",
    drawsUrl: tournament.drawsUrl || "",
    acceptedPlayers: [],
    outsiderCandidates: [],
    events: [],
    drawsheetsSummary: [],
    itfApiWarning: "",
    drawWarning: "",
    fallbackUsed: true
  };
}

async function pageApiGet(page, url, retries = 5) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await page.evaluate(
        async (targetUrl) => {
          const result = await fetch(targetUrl, {
            method: "GET",
            headers: {
              accept: "application/json, text/plain, */*"
            }
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

async function pageApiPost(page, url, payload, retries = 5) {
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

function itfCalendarApiUrl(skip = 0, take = 100) {
  const { startDate, endDate } = currentWeekDateRange();
  return `${itfCalendarApiBase}?circuitCode=JT&searchString=&skip=${skip}&take=${take}&nationCodes=&zoneCodes=&dateFrom=${startDate}&dateTo=${endDate}&indoorOutdoor=&categories=&isOrderAscending=true&orderField=startDate&surfaceCodes=&singlesDrawFormat=`;
}

async function collectCurrentWeekTournaments(page) {
  const tournaments = [];
  const seen = new Set();
  const take = 100;
  let skip = 0;

  while (true) {
    const payload = await pageApiGet(page, itfCalendarApiUrl(skip, take));
    const rows = findFirstArray(payload) || [];
    if (!rows.length) break;

    for (const row of rows) {
      const tournament = tournamentFromCalendarRow(row);
      if (!tournament.key || seen.has(tournament.key)) continue;
      if (tournament.status === "CN" || tournament.status === "PP") continue;
      if (!overlapsCurrentWeek(tournament.startDate, tournament.endDate)) continue;
      seen.add(tournament.key);
      tournaments.push(tournament);
    }

    if (rows.length < take) break;
    skip += take;
  }

  return tournaments;
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

function teamIsBye(team = {}) {
  return !teamPlayers(team).length;
}

function playerIdFromProfileLink(profileLink = "") {
  return String(profileLink || "").match(/\/players\/[^/]+\/([^/]+)\//)?.[1] || "";
}

function sourcePlayerFromDrawPlayer(drawPlayer = {}, indexes) {
  const playerId = String(drawPlayer.playerId || "").trim();
  const profileId = playerIdFromProfileLink(drawPlayer.profileLink || "");
  const fullName = `${drawPlayer.givenName || ""} ${drawPlayer.familyName || ""}`.replace(/\s+/g, " ").trim();
  const normalized = normalizeName(fullName);

  return (
    indexes.byItfId.get(playerId) ||
    indexes.byItfId.get(profileId) ||
    indexes.byNormalizedName.get(normalized) ||
    null
  );
}

function baseTournamentPlayer(sourcePlayer, drawPlayer = {}, event) {
  return {
    ...sourcePlayer,
    entryGroup: eventEntryGroup(event),
    juniorRank: sourcePlayer.currentRank || "",
    position: "",
    sex: sourcePlayer.gender === "Girls" ? "girl" : "boy",
    priority: "",
    itfPlayerId: playerItfId(sourcePlayer) || String(drawPlayer.playerId || "").trim(),
    drawResult: null,
    drawResultDoubles: null
  };
}

function mergeEntryGroup(current, next) {
  if (!next) return current || "";
  if (current === "MD" || next === current) return current;
  if (next === "MD") return "MD";
  return current || next;
}

function ensureTournamentPlayer(tournament, sourcePlayer, drawPlayer, event) {
  let existing = tournament.acceptedPlayers.find((item) => item.id === sourcePlayer.id);
  if (!existing) {
    existing = baseTournamentPlayer(sourcePlayer, drawPlayer, event);
    tournament.acceptedPlayers.push(existing);
  }

  existing.entryGroup = mergeEntryGroup(existing.entryGroup, eventEntryGroup(event));
  if (!existing.itfPlayerId) existing.itfPlayerId = playerItfId(sourcePlayer) || String(drawPlayer?.playerId || "").trim();
  return existing;
}

function ensureTournamentOutsider(tournament, event, drawPlayer = {}) {
  const playerId = String(drawPlayer.playerId || "").trim() || playerIdFromProfileLink(drawPlayer.profileLink || "");
  const playerName = `${drawPlayer.givenName || ""} ${drawPlayer.familyName || ""}`.replace(/\s+/g, " ").trim();
  const gender = eventGender(event);
  const key = `${gender}|${playerId || normalizeName(playerName)}`;

  const existing = tournament.outsiderCandidates.find(
    (candidate) =>
      `${candidate.gender || ""}|${candidate.playerItfId || normalizeName(candidate.playerName || "")}` === key
  );

  if (existing) {
    existing.entryGroup = mergeEntryGroup(existing.entryGroup, eventEntryGroup(event));
    return existing;
  }

  const outsider = {
    playerItfId: playerId,
    playerName,
    gender,
    country: drawPlayer.nationality || "",
    juniorRank: "",
    entryGroup: eventEntryGroup(event),
    tournamentName: tournament.tournamentName,
    sourceUrl: tournament.drawsUrl || tournament.tournamentUrl || "",
    drawsUrl: tournament.drawsUrl || tournament.tournamentUrl || "",
    notes: "Encontrado no drawsheet da ITF."
  };

  tournament.outsiderCandidates.push(outsider);
  return outsider;
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
    parts.push(
      tiebreak === undefined || tiebreak === null
        ? `${score1.score}-${score2.score}`
        : `${score1.score}-${score2.score}(${tiebreak})`
    );
  }

  return parts.join(" ");
}

function resultForTeam({ team, opponent, round, matchType }) {
  const teamWon = team?.isWinner === true;
  const opponentWon = opponent?.isWinner === true;
  const hasWinner = teamWon || opponentWon;
  const bye = teamIsBye(opponent);
  const score = teamScoreDisplay(team, opponent);

  if (teamWon) {
    return {
      status: "Ativo",
      currentRound: round === "F" ? "W" : nextRound(round, matchType.toUpperCase()),
      pointsOverride: bye ? 0 : undefined,
      confidence: bye ? "itf-api-bye" : "itf-api-win",
      score
    };
  }

  if (opponentWon) {
    return {
      status: "Eliminado",
      currentRound: round,
      confidence: "itf-api-loss",
      score
    };
  }

  if (bye) {
    return {
      status: "Ativo",
      currentRound: nextRound(round, matchType.toUpperCase()),
      pointsOverride: 0,
      confidence: "itf-api-bye",
      score
    };
  }

  return {
    status: "Ativo",
    currentRound: round,
    confidence: hasWinner ? "itf-api-win" : "itf-api-pending-match",
    score
  };
}

function applyDrawsheetToTournament(tournament, event, drawsheet, indexes) {
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
          for (const drawPlayer of teamPlayers(candidate.team)) {
            const sourcePlayer = sourcePlayerFromDrawPlayer(drawPlayer, indexes);
            const player = sourcePlayer
              ? ensureTournamentPlayer(tournament, sourcePlayer, drawPlayer, event)
              : ensureTournamentOutsider(tournament, event, drawPlayer);

            const result = {
              ...resultForTeam({
                team: candidate.team,
                opponent: candidate.opponent,
                round,
                matchType
              }),
              sourceUrl: tournament.drawsUrl || tournament.tournamentUrl || "",
              matchId: match.matchId
            };

            if (!sourcePlayer) continue;

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

async function clickIfPresent(page, label) {
  const locator = page.getByText(label, { exact: true }).first();
  if ((await locator.count()) === 0) return false;

  try {
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    return true;
  } catch {
    return false;
  }
}

async function dismissItfCookieBanner(page) {
  const candidates = [
    { role: "button", name: "Accept" },
    { role: "button", name: "I Accept" },
    { role: "button", name: "Accept All" },
    { role: "button", name: "ACEITAR" }
  ];

  for (const candidate of candidates) {
    try {
      const locator = page.getByRole(candidate.role, { name: candidate.name }).first();
      if ((await locator.count()) === 0) continue;
      await locator.click({ timeout: 3000 });
      await page.waitForTimeout(1200);
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function captureBodyText(page) {
  await page.waitForTimeout(1200);
  return page.locator("body").innerText({ timeout: 45000 });
}

async function readDrawPageText(page, tournament) {
  await page.goto(tournament.drawsUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);
  await dismissItfCookieBanner(page);

  const texts = [await captureBodyText(page)];
  for (const gender of ["BOYS", "GIRLS"]) {
    await clickIfPresent(page, gender);
    await dismissItfCookieBanner(page);

    for (const matchType of ["SINGLES", "DOUBLES"]) {
      await clickIfPresent(page, matchType);
      await dismissItfCookieBanner(page);

      for (const drawType of ["MAIN DRAW", "QUALIFYING DRAW"]) {
        if (await clickIfPresent(page, drawType)) {
          await dismissItfCookieBanner(page);
          texts.push(await captureBodyText(page));
        }
      }
    }
  }

  return [...new Set(texts)].join("\n");
}

function printDrawUrl(event) {
  if (!event?.tournamentId) return "";
  const params = new URLSearchParams({
    tournamentId: String(event.tournamentId),
    circuitCode: "JT",
    playerTypeCode: String(event.playerTypeCode || ""),
    matchTypeCode: String(event.matchTypeCode || ""),
    eventClassificationCode: String(event.eventClassificationCode || ""),
    drawsheetStructureCode: String(event.drawsheetStructureCode || "")
  });
  return `${itfPrintDrawBase}?${params.toString()}`;
}

async function readPrintDrawText(page, event) {
  const url = printDrawUrl(event);
  if (!url) throw new Error("missing tournamentId for ITF print draw fallback");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  return captureBodyText(page);
}

async function capturePageHtml(page) {
  await page.waitForTimeout(1200);
  return page.content();
}

function eventFromPrintUrl(url = "", tournament = {}) {
  try {
    const parsedUrl = new URL(url, itfBaseUrl);
    if (!parsedUrl.pathname.includes("/en/tournament/draws-and-results/print/")) return null;

    const event = {
      tournamentId: parsedUrl.searchParams.get("tournamentId") || tournament.tournamentId || "",
      tourType: tournament.tourType || "N",
      circuitCode: parsedUrl.searchParams.get("circuitCode") || "JT",
      playerTypeCode: parsedUrl.searchParams.get("playerTypeCode") || "",
      playerTypeDesc: parsedUrl.searchParams.get("playerTypeCode") === "G" ? "Girls" : "Boys",
      matchTypeCode: parsedUrl.searchParams.get("matchTypeCode") || "",
      matchTypeDesc: parsedUrl.searchParams.get("matchTypeCode") === "D" ? "Doubles" : "Singles",
      eventClassificationCode: parsedUrl.searchParams.get("eventClassificationCode") || "",
      eventClassificationDesc:
        parsedUrl.searchParams.get("eventClassificationCode") === "Q" ? "Qualifying Draw" : "Main Draw",
      drawsheetStructureCode: parsedUrl.searchParams.get("drawsheetStructureCode") || "",
      drawsheetStructureDesc: parsedUrl.searchParams.get("drawsheetStructureCode") || ""
    };

    if (!event.tournamentId || !event.playerTypeCode || !event.matchTypeCode || !event.eventClassificationCode) {
      return null;
    }

    return event;
  } catch {
    return null;
  }
}

async function extractPrintEventsFromDrawPage(page, tournament) {
  const hrefs = await page
    .locator('a[href*="/en/tournament/draws-and-results/print/"]')
    .evaluateAll((links) => links.map((link) => link.href).filter(Boolean));

  const events = [];
  const seen = new Set();

  for (const href of hrefs) {
    const event = eventFromPrintUrl(href, tournament);
    if (!event) continue;
    const key = [
      event.tournamentId,
      event.playerTypeCode,
      event.matchTypeCode,
      event.eventClassificationCode,
      event.drawsheetStructureCode
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
  }

  return events;
}

function extractPrintEventsFromHtml(html = "", tournament = {}) {
  const decoded = String(html || "").replace(/&amp;/g, "&");
  const hrefMatches = decoded.match(/https?:\/\/www\.itftennis\.com\/en\/tournament\/draws-and-results\/print\/\?[^"'\\s<]+|\/en\/tournament\/draws-and-results\/print\/\?[^"'\\s<]+/gi) || [];
  const events = [];
  const seen = new Set();

  for (const href of hrefMatches) {
    const event = eventFromPrintUrl(href, tournament);
    if (!event) continue;
    const key = [
      event.tournamentId,
      event.playerTypeCode,
      event.matchTypeCode,
      event.eventClassificationCode,
      event.drawsheetStructureCode
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
  }

  return events;
}

function tournamentIdFromHtml(html = "") {
  const text = String(html || "");
  const patterns = [
    /"tournamentId"\s*:\s*(\d{6,})/i,
    /tournamentId\s*[:=]\s*["']?(\d{6,})["']?/i,
    /tournamentid=(\d{6,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function guessedPrintEvents(tournament = {}) {
  const tournamentId = String(tournament.tournamentId || "").trim();
  if (!tournamentId) return [];

  const candidates = [];
  const playerTypes = ["B", "G"];
  const mainEvents = [
    { matchTypeCode: "S", matchTypeDesc: "Singles", eventClassificationCode: "M", eventClassificationDesc: "Main Draw" },
    { matchTypeCode: "D", matchTypeDesc: "Doubles", eventClassificationCode: "M", eventClassificationDesc: "Main Draw" }
  ];
  const qualifyingEvents = [
    { matchTypeCode: "S", matchTypeDesc: "Singles", eventClassificationCode: "Q", eventClassificationDesc: "Qualifying Draw" }
  ];

  for (const playerTypeCode of playerTypes) {
    for (const baseEvent of [...mainEvents, ...qualifyingEvents]) {
      candidates.push({
        tournamentId,
        tourType: tournament.tourType || "N",
        circuitCode: "JT",
        playerTypeCode,
        playerTypeDesc: playerTypeCode === "G" ? "Girls" : "Boys",
        matchTypeCode: baseEvent.matchTypeCode,
        matchTypeDesc: baseEvent.matchTypeDesc,
        eventClassificationCode: baseEvent.eventClassificationCode,
        eventClassificationDesc: baseEvent.eventClassificationDesc,
        drawsheetStructureCode: "KO",
        drawsheetStructureDesc: "KO"
      });
    }
  }

  return candidates;
}

function fallbackEventCandidatesFromTournament(tournament = {}) {
  const tournamentId = String(tournament.tournamentId || "").trim();
  if (!tournamentId) return [];

  const base = {
    tournamentId,
    tourType: tournament.tourType || "N",
    circuitCode: "JT",
    drawsheetStructureCode: "KO",
    drawsheetStructureDesc: "KO"
  };

  const combos = [
    ["B", "Boys", "S", "Singles", "M", "Main Draw"],
    ["B", "Boys", "S", "Singles", "Q", "Qualifying Draw"],
    ["B", "Boys", "D", "Doubles", "M", "Main Draw"],
    ["G", "Girls", "S", "Singles", "M", "Main Draw"],
    ["G", "Girls", "S", "Singles", "Q", "Qualifying Draw"],
    ["G", "Girls", "D", "Doubles", "M", "Main Draw"]
  ];

  return combos.map(
    ([playerTypeCode, playerTypeDesc, matchTypeCode, matchTypeDesc, eventClassificationCode, eventClassificationDesc]) => ({
      ...base,
      playerTypeCode,
      playerTypeDesc,
      matchTypeCode,
      matchTypeDesc,
      eventClassificationCode,
      eventClassificationDesc
    })
  );
}

async function probeEventsViaDrawsheet(page, tournament) {
  const candidates = fallbackEventCandidatesFromTournament(tournament);
  const validEvents = [];

  for (const event of candidates) {
    try {
      const drawsheet = await pageApiPost(page, itfDrawsheetApi, drawsheetPayload(event), 2);
      const groups = drawsheet?.koGroups || [];
      const hasMatches = groups.some((group) =>
        (group.rounds || []).some((round) => (round.matches || []).length > 0)
      );

      if (drawsheet?.eventId || hasMatches) {
        validEvents.push({ event, drawsheet });
      }
    } catch {
      // Ignore unavailable candidate combinations.
    }
  }

  return validEvents;
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
    if (current.gender && current.matchType) sections.push({ ...current, lines: [...current.lines] });
  }

  return sections;
}

function candidateDrawSections(lines, player, matchType = "SINGLES") {
  const expectedGender = player.gender === "Girls" ? "GIRLS" : "BOYS";
  const sections = splitDrawSections(lines)
    .filter((section) => !section.gender || section.gender === expectedGender)
    .filter((section) => !section.matchType || section.matchType === matchType)
    .filter((section) => !section.drawType || section.drawType === "MAIN DRAW" || section.drawType === "QUALIFYING DRAW");

  if (sections.length) return sections.map((section) => section.lines);
  return [lines];
}

function isRound(value = "") {
  return /^(R1|R2|R3|R4|R16|R32|R64|Q1|Q2|Q3|Q4|QF|SF|F|W|L|BYE)$/i.test(value);
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
    return {
      status: "Ativo",
      currentRound: nextRound(best.round, matchType),
      pointsOverride: 0,
      confidence: "itf-page-bye"
    };
  }

  if (best.outcome === "L") {
    return {
      status: "Eliminado",
      currentRound: normalizeDrawRound(best.round, matchType),
      confidence: "itf-page-loss"
    };
  }

  return {
    status: "Ativo",
    currentRound: nextRound(best.round, matchType),
    confidence: best.outcome === "W" ? "itf-page-win" : "itf-page-round"
  };
}

function applyDrawPageFallback(tournament, text, indexes) {
  const normalizedText = normalizeName(text);

  for (const player of indexes.all) {
    const normalizedPlayerName = normalizeName(player.name);
    if (!normalizedPlayerName || !normalizedText.includes(normalizedPlayerName)) continue;

    const singlesResult = drawStatusForPlayer(text, player, "SINGLES", { missingAsNull: true });
    const doublesResult = drawStatusForPlayer(text, player, "DOUBLES", { missingAsNull: true });
    if (!singlesResult && !doublesResult) continue;

    const tournamentPlayer = ensureTournamentPlayer(
      tournament,
      player,
      { playerId: playerItfId(player), givenName: "", familyName: "", nationality: player.country },
      {
        playerTypeCode: player.gender === "Girls" ? "G" : "B",
        eventClassificationCode:
          singlesResult?.currentRound?.startsWith("Q") || doublesResult?.currentRound?.startsWith("Q") ? "Q" : "M"
      }
    );

    if (singlesResult) tournamentPlayer.drawResult = betterDrawResult(tournamentPlayer.drawResult, singlesResult, "Singles");
    if (doublesResult) tournamentPlayer.drawResultDoubles = betterDrawResult(tournamentPlayer.drawResultDoubles, doublesResult, "Doubles");
  }
}

function applyEventPrintFallback(tournament, text, indexes, event) {
  const matchType = eventMatchType(event) === "Doubles" ? "DOUBLES" : "SINGLES";
  const expectedGender = eventGender(event);

  for (const player of indexes.all.filter((item) => item.gender === expectedGender)) {
    const result = drawStatusForPlayer(text, player, matchType, { missingAsNull: true });
    if (!result) continue;

    const tournamentPlayer = ensureTournamentPlayer(
      tournament,
      player,
      { playerId: playerItfId(player), givenName: "", familyName: "", nationality: player.country },
      event
    );

    if (matchType === "DOUBLES") {
      tournamentPlayer.drawResultDoubles = betterDrawResult(tournamentPlayer.drawResultDoubles, result, "Doubles");
    } else {
      tournamentPlayer.drawResult = betterDrawResult(tournamentPlayer.drawResult, result, "Singles");
    }
  }
}

function sortTournamentPlayers(tournament) {
  tournament.acceptedPlayers.sort((a, b) => {
    const rankA = Number(a.currentRank || Number.POSITIVE_INFINITY);
    const rankB = Number(b.currentRank || Number.POSITIVE_INFINITY);
    if (rankA !== rankB) return rankA - rankB;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  tournament.outsiderCandidates.sort((a, b) => String(a.playerName || "").localeCompare(String(b.playerName || "")));
}

async function enrichTournamentWithItfData(page, tournament, indexes) {
  try {
    await page.goto(tournament.drawsUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);
    await dismissItfCookieBanner(page);

    const events = await eventFiltersForTournament(page, tournament);
    tournament.events = events.map((event) => ({
      playerTypeCode: event.playerTypeCode,
      playerTypeDesc: event.playerTypeDesc,
      matchTypeCode: event.matchTypeCode,
      matchTypeDesc: event.matchTypeDesc,
      eventClassificationCode: event.eventClassificationCode,
      eventClassificationDesc: event.eventClassificationDesc,
      drawsheetStructureCode: event.drawsheetStructureCode,
      drawsheetStructureDesc: event.drawsheetStructureDesc
    }));

    for (const event of events) {
      try {
        const drawsheet = await pageApiPost(page, itfDrawsheetApi, drawsheetPayload(event));
        tournament.drawsheetsSummary.push({
          playerTypeCode: event.playerTypeCode,
          matchTypeCode: event.matchTypeCode,
          eventClassificationCode: event.eventClassificationCode,
          drawsheetStructureCode: event.drawsheetStructureCode,
          eventId: drawsheet.eventId || "",
          matchesCount: (drawsheet.koGroups || []).reduce(
            (total, group) => total + (group.rounds || []).reduce((roundTotal, round) => roundTotal + (round.matches || []).length, 0),
            0
          )
        });
        applyDrawsheetToTournament(tournament, event, drawsheet, indexes);
        try {
          const printText = await readPrintDrawText(page, event);
          applyEventPrintFallback(tournament, printText, indexes, event);
        } catch {
          // Keep the drawsheet result if the print endpoint is unavailable.
        }
      } catch (eventError) {
        const currentWarning = tournament.itfApiWarning ? `${tournament.itfApiWarning} | ` : "";
        tournament.itfApiWarning = `${currentWarning}${event.playerTypeCode}-${event.matchTypeCode}-${event.eventClassificationCode}: ${eventError.message}`;
        try {
          const printText = await readPrintDrawText(page, event);
          applyEventPrintFallback(tournament, printText, indexes, event);
          tournament.fallbackUsed = true;
        } catch (printError) {
          const currentDrawWarning = tournament.drawWarning ? `${tournament.drawWarning} | ` : "";
          tournament.drawWarning = `${currentDrawWarning}${event.playerTypeCode}-${event.matchTypeCode}-${event.eventClassificationCode}: ${printError.message}`;
        }
      }
    }

    if (!tournament.acceptedPlayers.length) {
      const text = await readDrawPageText(page, tournament);
      applyDrawPageFallback(tournament, text, indexes);
      if (tournament.acceptedPlayers.length) tournament.fallbackUsed = true;
    }
  } catch (error) {
    tournament.itfApiWarning = error.message;
    try {
      const html = await capturePageHtml(page);
      if (!tournament.tournamentId) {
        tournament.tournamentId = tournamentIdFromHtml(html) || tournament.tournamentId;
      }

      const probedEvents = await probeEventsViaDrawsheet(page, tournament);
      if (probedEvents.length) {
        tournament.events = probedEvents.map(({ event }) => ({
          playerTypeCode: event.playerTypeCode,
          playerTypeDesc: event.playerTypeDesc,
          matchTypeCode: event.matchTypeCode,
          matchTypeDesc: event.matchTypeDesc,
          eventClassificationCode: event.eventClassificationCode,
          eventClassificationDesc: event.eventClassificationDesc,
          drawsheetStructureCode: event.drawsheetStructureCode,
          drawsheetStructureDesc: event.drawsheetStructureDesc
        }));

        for (const { event, drawsheet } of probedEvents) {
          tournament.drawsheetsSummary.push({
            playerTypeCode: event.playerTypeCode,
            matchTypeCode: event.matchTypeCode,
            eventClassificationCode: event.eventClassificationCode,
            drawsheetStructureCode: event.drawsheetStructureCode,
            eventId: drawsheet.eventId || "",
            matchesCount: (drawsheet.koGroups || []).reduce(
              (total, group) => total + (group.rounds || []).reduce((roundTotal, round) => roundTotal + (round.matches || []).length, 0),
              0
            )
          });
          applyDrawsheetToTournament(tournament, event, drawsheet, indexes);
        }

        if (tournament.acceptedPlayers.length) {
          tournament.fallbackUsed = true;
          sortTournamentPlayers(tournament);
          return tournament;
        }
      }

      const printEvents = [
        ...extractPrintEventsFromHtml(html, tournament),
        ...(await extractPrintEventsFromDrawPage(page, tournament)),
        ...guessedPrintEvents(tournament)
      ].filter((event, index, array) => {
        const key = [
          event.tournamentId,
          event.playerTypeCode,
          event.matchTypeCode,
          event.eventClassificationCode,
          event.drawsheetStructureCode
        ].join("|");
        return array.findIndex((item) => [
          item.tournamentId,
          item.playerTypeCode,
          item.matchTypeCode,
          item.eventClassificationCode,
          item.drawsheetStructureCode
        ].join("|") === key) === index;
      });

      if (printEvents.length) {
        tournament.events = printEvents.map((event) => ({
          playerTypeCode: event.playerTypeCode,
          playerTypeDesc: event.playerTypeDesc,
          matchTypeCode: event.matchTypeCode,
          matchTypeDesc: event.matchTypeDesc,
          eventClassificationCode: event.eventClassificationCode,
          eventClassificationDesc: event.eventClassificationDesc,
          drawsheetStructureCode: event.drawsheetStructureCode,
          drawsheetStructureDesc: event.drawsheetStructureDesc
        }));

        for (const event of printEvents) {
          try {
            const printText = await readPrintDrawText(page, event);
            applyEventPrintFallback(tournament, printText, indexes, event);
            tournament.fallbackUsed = true;
          } catch (printError) {
            const currentDrawWarning = tournament.drawWarning ? `${tournament.drawWarning} | ` : "";
            tournament.drawWarning = `${currentDrawWarning}${event.playerTypeCode}-${event.matchTypeCode}-${event.eventClassificationCode}: ${printError.message}`;
          }
        }
      }

      if (tournament.acceptedPlayers.length) {
        sortTournamentPlayers(tournament);
        return tournament;
      }

      const text = await readDrawPageText(page, tournament);
      applyDrawPageFallback(tournament, text, indexes);
      tournament.fallbackUsed = true;
    } catch (fallbackError) {
      tournament.drawWarning = fallbackError.message;
    }
  }

  sortTournamentPlayers(tournament);
  return tournament;
}

function confidenceNote(value = "") {
  return {
    "itf-api-bye": "ITF API: bye encontrado; atleta avancou sem pontuar",
    "itf-api-win": "ITF API: vitoria encontrada",
    "itf-api-loss": "ITF API: derrota encontrada",
    "itf-api-pending-match": "ITF API: partida pendente",
    "itf-page-bye": "Pagina da ITF: bye encontrado; atleta avancou sem pontuar",
    "itf-page-win": "Pagina da ITF: vitoria encontrada",
    "itf-page-loss": "Pagina da ITF: derrota encontrada",
    "itf-page-round": "Pagina da ITF: rodada encontrada",
    pending: "fase pendente"
  }[value] || value || "fase pendente";
}

function outsiderKey(candidate = {}) {
  return `${candidate.gender || ""}|${candidate.playerItfId || normalizeName(candidate.playerName || "")}`;
}

function outsiderRankValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

export function aggregateOutsiders(tournaments = []) {
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
    .sort(
      (a, b) =>
        a.gender.localeCompare(b.gender) ||
        outsiderRankValue(a.junior_rank) - outsiderRankValue(b.junior_rank) ||
        a.player_name.localeCompare(b.player_name)
    );
}

export function weeklyRowsFromTournaments(tournaments = []) {
  const rows = [];

  for (const tournament of tournaments) {
    for (const player of tournament.acceptedPlayers || []) {
      if (player.drawResult) {
        rows.push({
          player_id: player.id,
          player_name: player.name,
          match_type: "Singles",
          event: tournament.tournamentName,
          grade: tournament.grade,
          start_date: tournament.startDate,
          end_date: tournament.endDate,
          status: player.drawResult.status,
          current_round: player.drawResult.currentRound,
          points_override: player.drawResult.pointsOverride ?? "",
          source_url: player.drawResult.sourceUrl || tournament.drawsUrl,
          notes: `Encontrado na ITF (${player.entryGroup || "sem grupo"}); leitura do draw: ${confidenceNote(player.drawResult.confidence)}.`
        });
      }

      if (player.drawResultDoubles) {
        rows.push({
          player_id: player.id,
          player_name: player.name,
          match_type: "Doubles",
          event: tournament.tournamentName,
          grade: tournament.grade,
          start_date: tournament.startDate,
          end_date: tournament.endDate,
          status: player.drawResultDoubles.status,
          current_round: player.drawResultDoubles.currentRound,
          points_override: player.drawResultDoubles.pointsOverride ?? "",
          source_url: player.drawResultDoubles.sourceUrl || tournament.drawsUrl,
          notes: `Encontrado na ITF; leitura do draw de duplas: ${confidenceNote(player.drawResultDoubles.confidence)}.`
        });
      }
    }
  }

  return rows.sort((a, b) => {
    if (a.event !== b.event) return a.event.localeCompare(b.event);
    if (a.player_name !== b.player_name) return a.player_name.localeCompare(b.player_name);
    return a.match_type.localeCompare(b.match_type);
  });
}

export async function collectWeeklyItfSnapshot({
  players,
  storedTournaments = [],
  refreshTournamentCatalog = true
}) {
  const indexes = buildPlayerIndexes(players);
  let chromium;

  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    throw new Error(`Playwright unavailable for ITF weekly scrape: ${error.message}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.goto(`${itfCalendarPage}?categories=All&startdate=${calendarStartDate()}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });
    await page.waitForTimeout(4000);

    let tournaments = [];
    if (refreshTournamentCatalog) {
      try {
        tournaments = await collectCurrentWeekTournaments(page);
      } catch {
        tournaments = [];
      }
    }

    if (!tournaments.length) {
      tournaments = storedTournaments.map(storedTournamentFallback);
    } else if (storedTournaments.length) {
      const seenKeys = new Set(tournaments.map((tournament) => tournament.key).filter(Boolean));
      for (const storedTournament of storedTournaments) {
        if (!storedTournament?.key || seenKeys.has(storedTournament.key)) continue;
        tournaments.push(storedTournamentFallback(storedTournament));
      }
    }

    for (const tournament of tournaments) {
      await enrichTournamentWithItfData(page, tournament, indexes);
    }

    return {
      scrapedAt: saoPauloTimestamp(),
      calendarStartDate: calendarStartDate(),
      tournaments,
      outsiders: aggregateOutsiders(tournaments)
    };
  } finally {
    await browser.close();
  }
}
