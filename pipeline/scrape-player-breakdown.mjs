import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseItfPointsBreakdown } from "./parse-itf-points.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "itf-player-preview.json");
const rankingApiBase = "https://www.itftennis.com/tennis/api/PlayerRankApi/GetRankingPoints";
const players = JSON.parse(await fs.readFile(sourcesFile, "utf8"));

async function readExistingPreview() {
  try {
    return JSON.parse(await fs.readFile(outputFile, "utf8")).players || [];
  } catch {
    return [];
  }
}

function hasResults(player) {
  return (player?.singles?.length || 0) + (player?.doubles?.length || 0) > 0;
}

function stamp() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date());
}

function playerNumericId(player) {
  const match = String(player.pointsBreakdownUrl || "").match(/\/players\/[^/]+\/(\d+)\/[a-z]{3}\/jt\/s\/itf-points-breakdown\/?/i);
  return match?.[1] || "";
}

function rankingPointsApiUrl(playerId, matchType) {
  return `${rankingApiBase}?circuitCode=JT&matchTypeCode=${matchType}&playerId=${playerId}`;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value = "") {
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(`${text} UTC`);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return text;
}

function looksLikePointsRow(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const keys = Object.keys(item).map((key) => key.toLowerCase());
  return keys.some((key) =>
    ["tournament", "event", "category", "grade", "round", "points", "date", "surface", "hostnation", "draw"].some((token) => key.includes(token))
  );
}

function collectPointLists(value, path = "root", acc = []) {
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      const matchingRows = value.filter(looksLikePointsRow);
      if (matchingRows.length) {
        acc.push({ path, items: value });
      }
    }

    value.forEach((item, index) => collectPointLists(item, `${path}[${index}]`, acc));
    return acc;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectPointLists(nested, `${path}.${key}`, acc);
    }
  }

  return acc;
}

function detectCountableStatus(path, item) {
  const pathText = String(path || "").toLowerCase();
  if (pathText.includes("non") && pathText.includes("count")) return false;
  if (pathText.includes("count")) return true;

  for (const [key, value] of Object.entries(item || {})) {
    const keyText = String(key).toLowerCase();
    const valueText = String(value).toLowerCase();
    if (!keyText.includes("count")) continue;
    if (["false", "0", "no", "non-countable"].includes(valueText)) return false;
    if (["true", "1", "yes", "countable"].includes(valueText)) return true;
  }

  return true;
}

function normalizePointRow(item, sourceCounting) {
  const event =
    item.tournamentName ||
    item.tournament_name ||
    item.tournament ||
    item.event ||
    item.eventName ||
    "";
  const grade = item.category || item.grade || "";
  const date = normalizeDate(item.startDate || item.start_date || item.date || "");
  const surface = item.surfaceDesc || item.surface || item.surfaceCode || "";
  const country = item.hostNation || item.hostNationCode || item.country || item.nation || "";
  const round = item.round || item.resultRound || "";
  const draw = item.drawType || item.draw || "";
  const points = parseNumber(item.points ?? item.rankingPoints ?? item.point);

  if (!event || !grade || !date) return null;

  return {
    event: String(event).trim(),
    date,
    grade: String(grade).trim(),
    country: String(country || "").trim(),
    surface: String(surface || "").trim(),
    round: String(round || "").trim(),
    draw: String(draw || "").trim(),
    points,
    sourceCounting
  };
}

async function fetchJsonViaBrowser(page, url, attempts = 5) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.evaluate(async (fetchUrl) => {
        const result = await fetch(fetchUrl, {
          method: "GET",
          headers: {
            accept: "application/json, text/plain, */*"
          }
        });

        return {
          status: result.status,
          text: await result.text()
        };
      }, url);

      if (response.status !== 200) {
        throw new Error(`Status HTTP inesperado: ${response.status}`);
      }

      if (!response.text?.trim()) {
        throw new Error("Resposta vazia da ITF");
      }

      return JSON.parse(response.text);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await page.waitForTimeout(1000 * attempt);
      }
    }
  }

  throw lastError;
}

function parseApiBreakdown(payload, matchType) {
  const groups = collectPointLists(payload);
  const results = groups.flatMap(({ path, items }) =>
    items
      .map((item) => normalizePointRow(item, detectCountableStatus(path, item)))
      .filter(Boolean)
  );

  const deduped = [];
  const seen = new Set();
  for (const row of results) {
    const key = [matchType, row.event, row.date, row.grade, row.round, row.points, row.draw, row.sourceCounting].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function diagnoseEmptyBreakdown(player, reason, text = "") {
  if (diagnostics.length >= 25) return;

  const cleanText = text.replace(/\s+/g, " ").trim();
  diagnostics.push({
    id: player.id,
    name: player.name,
    sourceUrl: player.pointsBreakdownUrl,
    reason,
    textLength: text.length,
    hasPointsBreakdownText: /ITF POINTS BREAKDOWN|Total Combined Ranking Points/i.test(text),
    hasIncapsulaText: /Incapsula|Request unsuccessful|incident_id/i.test(text),
    hasCaptchaText: /captcha|hcaptcha/i.test(text),
    sample: cleanText.slice(0, 500),
    pointsSample: cleanText.slice(Math.max(0, cleanText.search(/ITF POINTS BREAKDOWN|Total Combined Ranking Points/i) - 300), Math.max(0, cleanText.search(/ITF POINTS BREAKDOWN|Total Combined Ranking Points/i) - 300) + 2000)
  });
}

function fallbackPlayer(player, reason, text = "") {
  if (text) diagnoseEmptyBreakdown(player, reason, text);

  const existing = existingById.get(player.id);
  if (hasResults(existing)) {
    warnings.push(`Keeping previous points breakdown for ${player.id}; ${reason}.`);
    return existing;
  }

  warnings.push(`No points breakdown available for ${player.id}; ${reason}.`);
  return {
    id: player.id,
    name: player.name,
    country: player.country,
    gender: player.gender,
    currentRank: player.currentRank,
    sourceUrl: player.pointsBreakdownUrl,
    totalCombinedPoints: 0,
    singles: [],
    doubles: [],
    scrapedAt: stamp()
  };
}

const existingById = new Map((await readExistingPreview()).map((player) => [player.id, player]));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const scrapedPlayers = [];
const warnings = [];
const diagnostics = [];

for (const player of players) {
  if (!player.pointsBreakdownUrl) {
    scrapedPlayers.push(fallbackPlayer(player, "missing ITF points breakdown URL"));
    continue;
  }

  try {
    await page.goto(player.pointsBreakdownUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

    const numericId = playerNumericId(player);
    let singles = [];
    let doubles = [];
    let lastText = "";

    if (numericId) {
      try {
        const singlesPayload = await fetchJsonViaBrowser(page, rankingPointsApiUrl(numericId, "S"));
        singles = parseApiBreakdown(singlesPayload, "singles");
      } catch (error) {
        warnings.push(`Singles API failed for ${player.id}: ${error.message}`);
      }

      try {
        const doublesPayload = await fetchJsonViaBrowser(page, rankingPointsApiUrl(numericId, "D"));
        doubles = parseApiBreakdown(doublesPayload, "doubles");
      } catch (error) {
        warnings.push(`Doubles API failed for ${player.id}: ${error.message}`);
      }
    }

    if (!singles.length && !doubles.length) {
      lastText = await page.locator("body").innerText({ timeout: 45000 });
      const parsed = parseItfPointsBreakdown(lastText);
      singles = parsed.singles;
      doubles = parsed.doubles;
    }

    const scrapedPlayer = {
      id: player.id,
      name: player.name,
      country: player.country,
      gender: player.gender,
      currentRank: player.currentRank,
      sourceUrl: player.pointsBreakdownUrl,
      totalCombinedPoints: Number(player.officialPoints || 0),
      singles,
      doubles,
      scrapedAt: stamp()
    };

    if (!hasResults(scrapedPlayer)) {
      if (!lastText) {
        lastText = await page.locator("body").innerText({ timeout: 45000 }).catch(() => "");
      }
      scrapedPlayers.push(fallbackPlayer(player, "new scrape returned no results", lastText));
    } else {
      scrapedPlayers.push(scrapedPlayer);
    }
  } catch (error) {
    scrapedPlayers.push(fallbackPlayer(player, error.message));
  }
}

await browser.close();

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(
  outputFile,
  `${JSON.stringify({ players: scrapedPlayers, diagnostics }, null, 2)}\n`,
  "utf8"
);

console.log(`Scraped ${scrapedPlayers.length} player(s) into ${path.relative(rootDir, outputFile)}.`);
for (const warning of warnings) console.warn(warning);
