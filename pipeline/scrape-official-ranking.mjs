import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const previewFile = path.join(rootDir, "data", "itf-ranking-preview.json");
const rankingUrl = "https://www.itftennis.com/en/rankings/world-tennis-tour-junior-rankings/?matchType=S%2F1000";
const rankingLimit = Number(process.env.RANKING_LIMIT || 1000);
const categories = [
  { gender: "Boys", playerType: "B" },
  { gender: "Girls", playerType: "G" }
];

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function rankingDatePtBr(value = "") {
  const cleaned = value.replace(/^Last Updated:\s*/i, "").trim();
  const date = new Date(`${cleaned} UTC`);
  if (Number.isNaN(date.getTime())) return cleaned;
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function pointsBreakdownUrl(url) {
  return url.replace(/\/$/, "") + "/itf-points-breakdown/";
}

function slugifyName(name = "") {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function playerLookupKeys(player = {}) {
  const keys = [];
  if (player.id) keys.push(`id:${player.id}`);
  const name = slugifyName(player.name || "");
  const country = String(player.country || "").toUpperCase();
  const gender = String(player.gender || "");
  if (name && country && gender) keys.push(`profile:${gender}|${country}|${name}`);
  return keys;
}

function buildExistingPlayerIndex(players = []) {
  const index = new Map();

  for (const player of players) {
    for (const key of playerLookupKeys(player)) {
      if (!index.has(key)) index.set(key, player);
    }
  }

  return index;
}

function parseRankingNumber(value = "") {
  const cleaned = String(value).replace(/\s+/g, "").trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? cleaned.replaceAll(".", "").replace(",", ".") : cleaned.replaceAll(",", "");
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 3 ? cleaned.replaceAll(",", "") : cleaned.replace(",", ".");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

async function scrapeVisibleRows(page, limit) {
  return page.evaluate((rankingLimit) => {
    function parseNumber(value = "") {
      const cleaned = String(value).replace(/\s+/g, "").trim();
      if (!cleaned) return 0;

      const lastComma = cleaned.lastIndexOf(",");
      const lastDot = cleaned.lastIndexOf(".");
      let normalized = cleaned;

      if (lastComma > -1 && lastDot > -1) {
        normalized = lastComma > lastDot ? cleaned.replaceAll(".", "").replace(",", ".") : cleaned.replaceAll(",", "");
      } else if (lastComma > -1) {
        const decimals = cleaned.length - lastComma - 1;
        normalized = decimals === 3 ? cleaned.replaceAll(",", "") : cleaned.replace(",", ".");
      }

      const number = Number(normalized);
      return Number.isFinite(number) ? number : 0;
    }

    return [...document.querySelectorAll("table tbody tr")]
      .map((row) => {
        const link = row.querySelector('a[href*="/en/players/"]');
        if (!link) return null;

        const cells = [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim().replace(/\s+/g, " "));
        const href = new URL(link.getAttribute("href"), location.origin).href;
        const rank = Number((cells[0] || "").match(/\d+/)?.[0]);
        const country = (href.match(/\/players\/[^/]+\/[^/]+\/([^/]+)\//)?.[1] || "").toUpperCase();
        const id = href.match(/\/players\/([^/]+)\//)?.[1] || "";
        const rowText = row.innerText.trim().replace(/\s+/g, " ");
        const pointsCandidates = [...cells, ...rowText.split(" ")]
          .map((value) => parseNumber(value))
          .filter((value) => Number.isFinite(value) && value > 20);

        return {
          id,
          rank,
          name: link.innerText.trim().replace(/\s+/g, " "),
          country,
          officialPoints: pointsCandidates.at(-1) || 0,
          href
        };
      })
      .filter(Boolean)
      .filter((player) => player.rank >= 1 && player.rank <= rankingLimit);
  }, limit);
}

async function tableSignature(page) {
  return page.evaluate(() => [...document.querySelectorAll("table tbody tr")].map((row) => row.innerText.trim()).join("\n"));
}

async function clickNextRankingPage(page) {
  return page.evaluate(() => {
    const candidates = [...document.querySelectorAll("button, a")];
    const next = candidates.find((element) => {
      const label = [
        element.innerText,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("rel")
      ]
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLowerCase();
      const disabled =
        element.disabled ||
        element.getAttribute("aria-disabled") === "true" ||
        element.className?.toString().toLowerCase().includes("disabled");

      return !disabled && (label === "next" || label === ">" || label === "›" || label === "»" || label.includes("next"));
    });

    if (!next) return false;
    next.click();
    return true;
  });
}

async function collectRankingRows(page, limit) {
  const rowsById = new Map();

  for (let pageIndex = 0; pageIndex < Math.ceil(limit / 10) + 4; pageIndex += 1) {
    for (const row of await scrapeVisibleRows(page, limit)) {
      rowsById.set(row.id, row);
    }

    if (rowsById.size >= limit) break;

    const before = await tableSignature(page);
    const clicked = await clickNextRankingPage(page);
    if (!clicked) break;

    await page.waitForFunction(
      (previous) => [...document.querySelectorAll("table tbody tr")].map((row) => row.innerText.trim()).join("\n") !== previous,
      before,
      { timeout: 15000 }
    ).catch(() => {});
  }

  return [...rowsById.values()].sort((a, b) => a.rank - b.rank).slice(0, limit);
}

async function scrapeCategory(page, category) {
  await page.goto(`${rankingUrl}&playerType=${category.playerType}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("Last Updated") && document.querySelectorAll('a[href*="/en/players/"]').length >= 10,
    null,
    { timeout: 30000 }
  );

  const rows = await collectRankingRows(page, rankingLimit);
  const lastUpdated = await page.evaluate(() => {
    const match = document.body.innerText.match(/Last Updated:\s*\d{1,2}\s[A-Za-z]{3,9}\s\d{4}/);
    return match?.[0] || "";
  });

  if (!rows.length) {
    throw new Error(`No ${category.gender} ranking rows found.`);
  }

  return {
    lastUpdated,
    players: rows.map((player) => ({
      id: player.id || slugifyName(player.name),
      name: player.name,
      country: player.country,
      gender: category.gender,
      currentRank: player.rank,
      officialPoints: parseRankingNumber(player.officialPoints),
      pointsBreakdownUrl: pointsBreakdownUrl(player.href),
      needsProfileResolution: false
    }))
  };
}

function mergeScrapedPlayersIntoExisting(existingPlayers = [], scrapedPlayers = []) {
  const existingIndex = buildExistingPlayerIndex(existingPlayers);
  const merged = new Map(existingPlayers.map((player) => [player.id, { ...player }]));

  for (const scraped of scrapedPlayers) {
    const existing =
      existingIndex.get(`id:${scraped.id}`) ||
      existingIndex.get(`profile:${scraped.gender}|${scraped.country}|${slugifyName(scraped.name)}`);

    const mergedPlayer = {
      ...(existing || {}),
      ...scraped,
      id: existing?.id || scraped.id,
      name: existing?.name || scraped.name,
      country: existing?.country || scraped.country,
      gender: scraped.gender,
      birthYear: existing?.birthYear || "",
      pointsBreakdownUrl: scraped.pointsBreakdownUrl || existing?.pointsBreakdownUrl || "",
      needsProfileResolution: !(scraped.pointsBreakdownUrl || existing?.pointsBreakdownUrl)
    };

    merged.set(mergedPlayer.id, mergedPlayer);
  }

  return [...merged.values()];
}

function playerSortValue(player = {}) {
  const rank = Number(player.currentRank || 0);
  return rank > 0 ? rank : Number.POSITIVE_INFINITY;
}

function sortPlayers(players = []) {
  return [...players].sort((a, b) => {
    if (a.gender !== b.gender) return String(a.gender).localeCompare(String(b.gender));
    const rankDiff = playerSortValue(a) - playerSortValue(b);
    if (rankDiff !== 0) return rankDiff;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const existingPlayers = await readJson(sourcesFile, []);
const warnings = [];
let rankingDate = "";
let scrapedPlayers = [];

try {
  for (const category of categories) {
    try {
      const result = await scrapeCategory(page, category);
      scrapedPlayers.push(...result.players);
      rankingDate = rankingDatePtBr(result.lastUpdated) || rankingDate;
    } catch (error) {
      warnings.push(`Could not scrape ${category.gender} official ranking: ${error.message}`);
    }
  }
} finally {
  await browser.close();
}

if (!scrapedPlayers.length) {
  throw new Error("Official ranking scrape returned no players.");
}

const finalPlayers = sortPlayers(mergeScrapedPlayersIntoExisting(existingPlayers, scrapedPlayers));

await fs.writeFile(sourcesFile, `${JSON.stringify(finalPlayers, null, 2)}\n`, "utf8");
await fs.mkdir(path.dirname(previewFile), { recursive: true });
await fs.writeFile(
  previewFile,
  `${JSON.stringify(
    {
      rankingDate,
      scrapedPlayers,
      totalPlayersInBase: finalPlayers.length,
      rankingLimit,
      warnings,
      scrapedAt: new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
      }).format(new Date())
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`Scraped official ranking for ${scrapedPlayers.length} top-ranked players; base now has ${finalPlayers.length} total players.`);
for (const warning of warnings) console.warn(warning);
