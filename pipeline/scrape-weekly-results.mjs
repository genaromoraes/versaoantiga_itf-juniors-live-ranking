import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "weekly-results.csv");
const previewFile = path.join(rootDir, "data", "weekly-tournaments-preview.json");
const itfEntriesBaseUrl = "https://itf-entries.netlify.app";
const itfBaseUrl = "https://www.itftennis.com";
const coreTennisBaseUrl = "https://www.coretennis.net";
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
  return /^(R1|R2|R3|R4|R16|R32|R64|QF|SF|F|W)$/i.test(value);
}

function normalizeDrawRound(value = "") {
  const round = value.toUpperCase();
  if (round === "R1") return "R64";
  if (round === "R2") return "R32";
  if (round === "R3" || round === "R16") return "R16";
  return round;
}

function nextRound(round = "") {
  return {
    R64: "R32",
    R32: "R16",
    R16: "QF",
    QF: "SF",
    SF: "F",
    F: "W"
  }[normalizeDrawRound(round)] || normalizeDrawRound(round);
}

function roundForOutcome(round = "", outcome = "") {
  if (outcome === "L") return normalizeDrawRound(round);
  if (outcome === "W") return nextRound(round);
  return normalizeDrawRound(round);
}

function confidenceNote(value = "") {
  return {
    "nearby-result": "resultado encontrado perto do nome",
    "nearby-win": "vitoria encontrada perto do nome",
    "nearby-round": "rodada encontrada perto do nome",
    bye: "bye encontrado; atleta avancou de rodada sem pontuar",
    "core-bye": "CoreTennis: bye encontrado; atleta avancou de rodada sem pontuar",
    "core-win": "CoreTennis: vitoria encontrada",
    "core-loss": "CoreTennis: derrota encontrada",
    "core-pending-match": "CoreTennis: partida pendente",
    pending: "fase pendente"
  }[value] || value || "fase pendente";
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
    .filter((section) => !section.drawType || section.drawType === "MAIN DRAW");

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

async function scrapeTournament(tournament) {
  const payload = await fetchJson(`${itfEntriesBaseUrl}/api/tournament/${tournament.key}`);
  const acceptanceRows = rowsFromTablePayload(payload, "acceptanceList");
  const acceptedPlayers = [];

  for (const entry of acceptanceRows) {
    if (entry.isAvailable || entry.isExemption || entry.entryGroup === "WD") continue;
    const player = playersByItfId.get(String(entry.id)) || playersByNormalizedName.get(normalizeName(`${entry.name} ${entry.surname}`));
    if (!player) continue;

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
    acceptedPlayers
  };
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

function drawStatusForPlayer(text, player) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const playerName = normalizeName(player.name);
  const candidates = [];

  for (const sectionLines of candidateDrawSections(lines, player, "SINGLES")) {
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
  if (!best) return { status: "Ativo", currentRound: pendingRound, confidence: "pending" };

  if (best.bye && !best.outcome) {
    return { status: "Ativo", currentRound: nextRound(best.round), pointsOverride: 0, confidence: "bye" };
  }

  if (best.outcome === "L") {
    return { status: "Eliminado", currentRound: roundForOutcome(best.round, best.outcome), confidence: "nearby-result" };
  }

  return {
    status: "Ativo",
    currentRound: roundForOutcome(best.round, best.outcome),
    confidence: best.outcome === "W" ? "nearby-win" : "nearby-round"
  };
}

function drawDiagnostic(text, players) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const interestingLines = lines.filter((line) => {
    if (/^(BOYS|GIRLS|SINGLES|DOUBLES|MAIN DRAW|QUALIFYING DRAW|R1|R2|R3|R4|R16|R32|R64|QF|SF|F|W|L|BYE)$/i.test(line)) return true;
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
    await clickIfPresent(page, "SINGLES");
    await clickIfPresent(page, "MAIN DRAW");
    texts.push(await page.locator("body").innerText({ timeout: 45000 }));
  }

  page.off("response", collectUrl);
  return [...new Set(texts)].join("\n");
}

async function enrichTournamentWithDrawRounds(tournaments) {
  const tournamentsWithPlayers = tournaments.filter((tournament) =>
    tournament.acceptedPlayers.some((player) => !player.drawResult || player.drawResult.currentRound === pendingRound)
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

try {
  const currentWeekTournaments = await currentWeekTournamentsFromItfEntries();

  for (const tournament of currentWeekTournaments) {
    try {
      tournaments.push(await scrapeTournament(tournament));
    } catch (error) {
      tournaments.push({
        ...tournament,
        acceptedPlayers: [],
        warning: error.message
      });
    }
  }
} catch (error) {
  console.warn(`Could not scrape itf-entries weekly tournaments: ${error.message}`);
}

await enrichTournamentWithCoreTennisRounds(tournaments);
await enrichTournamentWithDrawRounds(tournaments);

const rows = [headers];
for (const tournament of tournaments) {
  for (const player of tournament.acceptedPlayers) {
    const drawResult = player.drawResult || { status: "Ativo", currentRound: pendingRound, confidence: "pending" };
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
  }
}

await fs.writeFile(outputFile, `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`, "utf8");
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

console.log(`Found ${tournaments.length} current-week tournament(s).`);
console.log(`Generated ${path.relative(rootDir, outputFile)} with ${rows.length - 1} weekly result row(s).`);
