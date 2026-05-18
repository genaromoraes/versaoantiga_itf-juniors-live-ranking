import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "weekly-results.csv");
const previewFile = path.join(rootDir, "data", "weekly-tournaments-preview.json");
const itfEntriesBaseUrl = "https://itf-entries.netlify.app";
const itfBaseUrl = "https://www.itftennis.com";

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

const rows = [headers];
for (const tournament of tournaments) {
  for (const player of tournament.acceptedPlayers) {
    rows.push([
      player.id,
      player.name,
      "Singles",
      tournament.tournamentName,
      tournament.grade,
      tournament.startDate,
      tournament.endDate,
      "Ativo",
      "",
      tournament.drawsUrl,
      `Encontrado na acceptance list do itf-entries (${player.entryGroup || "sem grupo"}); fase pendente de leitura do draw.`
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
