import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "weekly-results.csv");
const previewFile = path.join(rootDir, "data", "weekly-tournaments-preview.json");
const calendarUrl = "https://www.itftennis.com/en/tournament-calendar/world-tennis-tour-juniors-calendar/";

const players = JSON.parse(await fs.readFile(playersFile, "utf8"));
const playersByNormalizedName = new Map(players.map((player) => [normalizeName(player.name), player]));

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
  const match = text.match(/Dates:\s*(\d{1,2})\s([A-Za-z]{3})\s-\s(\d{1,2})\s([A-Za-z]{3})\s(\d{4})/i);
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

function tournamentNameFromText(text = "") {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headingIndex = lines.findIndex((line) => /^J\d{2,3}\b|Junior Championships|Junior Finals/i.test(line));
  return headingIndex >= 0 ? lines[headingIndex] : "";
}

async function calendarTournamentLinks(page) {
  await page.goto(`${calendarUrl}?categories=All&startdate=${calendarStartDate()}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });
  await page.waitForTimeout(5000);

  return page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/en/tournament/"]')].map((link) => {
      const href = new URL(link.getAttribute("href"), location.origin).href;
      const text = link.innerText.trim().replace(/\s+/g, " ");
      return { href, text };
    });

    return Array.from(new Map(links.map((link) => [link.href.replace(/\/(acceptance-list|draws-and-results)\/?$/, ""), link])).values());
  });
}

function normalizeTournamentUrl(url) {
  return url.replace(/\/(acceptance-list|draws-and-results)\/?$/, "").replace(/\/$/, "");
}

async function scrapeTournament(page, rawUrl) {
  const baseUrl = normalizeTournamentUrl(rawUrl);
  const acceptanceListUrl = `${baseUrl}/acceptance-list/`;
  const drawsUrl = `${baseUrl}/draws-and-results/`;
  await page.goto(acceptanceListUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3000);

  const text = await page.locator("body").innerText({ timeout: 45000 });
  const tournamentName = tournamentNameFromText(text);
  const { startDate, endDate } = parseDateRange(text);
  const grade = gradeFromTournamentName(tournamentName || rawUrl);
  const normalizedText = normalizeName(text);
  const acceptedPlayers = [];

  for (const [normalizedName, player] of playersByNormalizedName) {
    if (normalizedText.includes(normalizedName)) acceptedPlayers.push(player);
  }

  return {
    tournamentName,
    grade,
    startDate,
    endDate,
    acceptanceListUrl,
    drawsUrl,
    acceptedPlayers
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const tournaments = [];

try {
  const links = await calendarTournamentLinks(page);
  const uniqueLinks = [...new Set(links.map((link) => normalizeTournamentUrl(link.href)))];

  for (const url of uniqueLinks) {
    try {
      const tournament = await scrapeTournament(page, url);
      if (!overlapsCurrentWeek(tournament.startDate, tournament.endDate)) continue;
      tournaments.push(tournament);
    } catch (error) {
      tournaments.push({
        tournamentName: "",
        grade: "",
        startDate: "",
        endDate: "",
        acceptanceListUrl: `${normalizeTournamentUrl(url)}/acceptance-list/`,
        drawsUrl: `${normalizeTournamentUrl(url)}/draws-and-results/`,
        acceptedPlayers: [],
        warning: error.message
      });
    }
  }
} finally {
  await browser.close();
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
      "Encontrado na acceptance list; fase pendente de leitura do draw."
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
