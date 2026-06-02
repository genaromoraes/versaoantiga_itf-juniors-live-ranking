import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = path.join(rootDir, "pipeline", "sources", "players.json");
const weeklyResultsFile = path.join(rootDir, "data", "weekly-results.csv");
const pointsCsvFile = process.env.POINTS_OUTPUT_FILE
  ? path.resolve(rootDir, process.env.POINTS_OUTPUT_FILE)
  : path.join(rootDir, "data", "player-points.csv");
const statusFile = process.env.POINTS_STATUS_FILE
  ? path.resolve(rootDir, process.env.POINTS_STATUS_FILE)
  : path.join(rootDir, "data", "player-points-status.csv");
const pointsApiBase = "https://www.itftennis.com/tennis/api/PlayerRankApi/GetRankingPoints";
const contextUrl =
  "https://www.itftennis.com/en/rankings/world-tennis-tour-junior-rankings/?matchType=S&playerType=B&juniorRankingType=ITF";

const limit = Number(process.env.POINTS_LIMIT || 0);
const playerIdFilter = String(process.env.POINTS_PLAYER_ID || "").trim();
const scope = String(process.env.POINTS_SCOPE || "ranked-and-weekly").trim().toLowerCase();
const rankLimit = Number(process.env.POINTS_RANK_LIMIT || 1000);
const maxConsecutiveErrors = Number(process.env.POINTS_MAX_CONSECUTIVE_ERRORS || 25);
const minSuccessRate = Number(process.env.POINTS_MIN_SUCCESS_RATE || 0.9);
const allowPartial = process.env.POINTS_ALLOW_PARTIAL === "true";
const headed = process.env.POINTS_HEADLESS === "false";
const pauseMs = Number(process.env.POINTS_PAUSE_MS || 250);
const browserRecycleEvery = Number(process.env.POINTS_BROWSER_RECYCLE_EVERY || 10);

const headers = [
  "player_id",
  "player_name",
  "country",
  "gender",
  "current_rank",
  "source_url",
  "result_type",
  "event",
  "grade",
  "date",
  "drop_date",
  "points",
  "weight",
  "ranking_points",
  "source_counting"
];

function csvValue(value = "") {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseCsvLine(line = "") {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (quoted && char === '"' && next === '"') {
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

async function readCsvRows(file) {
  try {
    const text = await fs.readFile(file, "utf8");
    const [headerLine, ...lines] = text.trim().split(/\r?\n/);
    const headers = parseCsvLine(headerLine);
    return lines
      .filter(Boolean)
      .map((line) => {
        const values = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      });
  } catch {
    return [];
  }
}

function numericValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  const number = numericValue(value);
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function playerNumericId(player = {}) {
  const url = String(player.pointsBreakdownUrl || "");
  return url.match(/\/players\/[^/]+\/(\d+)\//)?.[1] || "";
}

function parseItfDate(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;

  const match = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!match) return "";

  const months = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11
  };

  const month = months[match[2].toLowerCase()];
  if (!Number.isInteger(month)) return "";

  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString().slice(0, 10);
}

function addDropDate(dateValue = "") {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";

  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCDate(date.getUTCDate() + 364);
  return date.toISOString().slice(0, 10);
}

function pointsUrl(numericId) {
  return `${pointsApiBase}?circuitCode=JT&matchTypeCode=S&playerId=${numericId}`;
}

async function fetchPlayerPoints(page, numericId, retries = 4) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await page.evaluate(async (url) => {
        const result = await fetch(url, {
          method: "GET",
          headers: {
            accept: "application/json, text/plain, */*"
          }
        });
        return {
          status: result.status,
          contentType: result.headers.get("content-type") || "",
          text: await result.text()
        };
      }, pointsUrl(numericId));

      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!response.text?.trim()) throw new Error("Empty ITF response");
      if (!response.contentType.includes("json") || response.text.trim().startsWith("<")) {
        throw new Error("ITF returned HTML instead of ranking points JSON");
      }

      return JSON.parse(response.text);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await page.waitForTimeout(1500 * attempt);
    }
  }

  throw lastError;
}

function rowsFromBreakdown(player, breakdown, resultType, sourceCounting) {
  const weight = resultType === "doubles" ? 0.25 : 1;
  return (breakdown?.pointsBreakdown || []).map((item) => {
    const date = parseItfDate(item.startDate);
    const points = numericValue(item.points);
    return [
      player.id,
      player.name,
      player.country,
      player.gender,
      player.currentRank || "",
      player.pointsBreakdownUrl || "",
      resultType,
      item.tournamentName || "",
      item.category || "",
      date,
      addDropDate(date),
      formatNumber(points),
      formatNumber(weight),
      formatNumber(points * weight),
      sourceCounting ? "true" : "false"
    ];
  });
}

function rowsFromPayload(player, payload = {}) {
  const rows = [];

  for (const group of payload.countable || []) {
    const title = String(group.title || "").toLowerCase();
    const resultType = title.includes("double") ? "doubles" : "singles";
    rows.push(...rowsFromBreakdown(player, group.countablePoints, resultType, true));
    rows.push(...rowsFromBreakdown(player, group.nonCountablePoints, resultType, false));
  }

  return rows;
}

async function writeCsv(file, rows) {
  const text = rows.map((row) => row.map(csvValue).join(",")).join("\n") + "\n";
  await fs.writeFile(file, text, "utf8");
}

function csvObjectsToRows(rows = []) {
  return rows.map((row) => headers.map((header) => row[header] || ""));
}

async function weeklyPlayerIds() {
  const rows = await readCsvRows(weeklyResultsFile);
  return new Set(rows.map((row) => row.player_id).filter(Boolean));
}

async function selectTargetPlayers(allPlayers) {
  if (playerIdFilter) {
    return allPlayers.filter((player) => player.id === playerIdFilter || playerNumericId(player) === playerIdFilter);
  }

  const weeklyIds = await weeklyPlayerIds();
  if (scope === "weekly") {
    return allPlayers.filter((player) => weeklyIds.has(player.id));
  }

  if (scope === "all") return allPlayers;

  return allPlayers.filter((player) => {
    const rank = Number(player.currentRank || 0);
    return (rank > 0 && rank <= rankLimit) || weeklyIds.has(player.id);
  });
}

async function main() {
  const allPlayers = JSON.parse(await fs.readFile(playersFile, "utf8"));
  const selectedPlayers = await selectTargetPlayers(allPlayers);
  const players = (limit > 0 ? selectedPlayers.slice(0, limit) : selectedPlayers).filter(playerNumericId);
  const scrapedRows = [];
  const statusRows = [["player_id", "player_name", "gender", "current_rank", "status", "rows", "error"]];
  let successCount = 0;
  let consecutiveErrors = 0;
  let stopReason = "";
  const refreshedIds = new Set();

  console.log(
    `Player points target: ${players.length}/${allPlayers.length} players (scope=${scope}, rankLimit=${rankLimit}, limit=${limit || "none"})`
  );

  let browser;
  let page;

  async function openBrowserSession() {
    if (browser) await browser.close().catch(() => {});
    browser = await chromium.launch({ headless: !headed });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(contextUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(5000);
  }

  try {
    await openBrowserSession();

    for (let index = 0; index < players.length; index += 1) {
      if (browserRecycleEvery > 0 && index > 0 && index % browserRecycleEvery === 0) {
        await openBrowserSession();
      }

      const player = players[index];
      const numericId = playerNumericId(player);

      try {
        const payload = await fetchPlayerPoints(page, numericId);
        const rows = rowsFromPayload(player, payload);
        scrapedRows.push(...rows);
        statusRows.push([player.id, player.name, player.gender, player.currentRank || "", "OK", String(rows.length), ""]);
        successCount += 1;
        refreshedIds.add(player.id);
        consecutiveErrors = 0;
      } catch (error) {
        statusRows.push([player.id, player.name, player.gender, player.currentRank || "", "ERROR", "0", error.message]);
        consecutiveErrors += 1;
      }

      if ((index + 1) % 25 === 0 || index + 1 === players.length) {
        console.log(`Player points scraped: ${index + 1}/${players.length} (${successCount} OK)`);
      }

      if (maxConsecutiveErrors > 0 && consecutiveErrors >= maxConsecutiveErrors) {
        stopReason = `Stopping early after ${consecutiveErrors} consecutive player points errors. ITF is probably blocking breakdown API calls.`;
        console.log(stopReason);
        break;
      }

      if (pauseMs > 0) await page.waitForTimeout(pauseMs);
    }
  } finally {
    if (browser) await browser.close();
  }

  const successRate = players.length ? successCount / players.length : 0;
  await writeCsv(statusFile, statusRows);

  if ((stopReason || successRate < minSuccessRate) && !allowPartial) {
    throw new Error(
      stopReason ||
        `Only ${successCount}/${players.length} player point breakdowns succeeded (${(successRate * 100).toFixed(
          1
        )}%). Keeping previous ${path.relative(rootDir, pointsCsvFile)}.`
    );
  }

  if (stopReason || successRate < minSuccessRate) {
    console.log(
      `Continuing with partial player points scrape: ${successCount}/${players.length} succeeded (${(successRate * 100).toFixed(
        1
      )}%).`
    );
  }

  const shouldMergeExisting = scope !== "all" || limit > 0 || Boolean(playerIdFilter);
  const existingRows = shouldMergeExisting
    ? (await readCsvRows(pointsCsvFile)).filter((row) => !refreshedIds.has(row.player_id))
    : [];
  const csvRows = [headers, ...csvObjectsToRows(existingRows), ...scrapedRows];

  await writeCsv(pointsCsvFile, csvRows);
  console.log(
    `Wrote ${path.relative(rootDir, pointsCsvFile)} with ${csvRows.length - 1} rows (${scrapedRows.length} refreshed, ${existingRows.length} preserved).`
  );
}

await main();
