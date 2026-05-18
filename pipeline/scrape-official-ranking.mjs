import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const previewFile = path.join(rootDir, "data", "itf-ranking-preview.json");
const rankingUrl = "https://www.itftennis.com/en/rankings/world-tennis-tour-junior-rankings/?juniorRankingType=ITF";
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

function titleCaseSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

async function scrapeCategory(page, category) {
  await page.goto(`${rankingUrl}&playerType=${category.playerType}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("Last Updated") && document.querySelectorAll('a[href*="/en/players/"]').length >= 10,
    null,
    { timeout: 30000 }
  );

  const rows = await page.evaluate(() => {
    function parseRankingNumber(value = "") {
      const cleaned = value.replace(/\s+/g, "").trim();
      if (!/^\d+(?:[.,]\d+)?$/.test(cleaned) && !/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?$/.test(cleaned)) return 0;

      const lastComma = cleaned.lastIndexOf(",");
      const lastDot = cleaned.lastIndexOf(".");
      let normalized = cleaned;

      if (lastComma > -1 && lastDot > -1) {
        normalized = lastComma > lastDot ? cleaned.replaceAll(".", "").replace(",", ".") : cleaned.replaceAll(",", "");
      } else if (lastComma > -1) {
        const decimals = cleaned.length - lastComma - 1;
        normalized = decimals === 3 ? cleaned.replaceAll(",", "") : cleaned.replace(",", ".");
      }

      return Number(normalized);
    }

    return [...document.querySelectorAll("table tbody tr")]
      .map((row) => {
        const link = row.querySelector('a[href*="/en/players/"]');
        if (!link) return null;

        const cells = [...row.querySelectorAll("td")].map((cell) => cell.innerText.trim().replace(/\s+/g, " "));
        const rank = Number((cells[0] || "").match(/\d+/)?.[0]);
        const href = new URL(link.getAttribute("href"), location.origin).href;
        const id = href.match(/\/players\/([^/]+)\//)?.[1] || "";
        const country = (href.match(/\/players\/[^/]+\/[^/]+\/([^/]+)\//)?.[1] || "").toUpperCase();
        const pointsCandidates = cells
          .slice(1)
          .map((cell) => parseRankingNumber(cell))
          .filter((value) => Number.isFinite(value) && value > 20);
        const rowText = row.innerText.trim().replace(/Head\s*2\s*Head/gi, "").replace(/\s+/g, " ");
        const textPointsCandidates = rowText
          .split(" ")
          .map((cell) => parseRankingNumber(cell))
          .filter((value) => Number.isFinite(value) && value > 20);
        const officialPoints = pointsCandidates.at(-1) || textPointsCandidates.at(-1) || 0;

        return {
          id,
          rank,
          country,
          name: link.innerText.trim().replace(/\s+/g, " "),
          officialPoints,
          href
        };
      })
      .filter(Boolean)
      .filter((player) => player.rank >= 1 && player.rank <= 10)
      .slice(0, 10);
  });

  const lastUpdated = await page.evaluate(() => {
    const match = document.body.innerText.match(/Last Updated:\s*\d{1,2}\s[A-Za-z]{3,9}\s\d{4}/);
    return match?.[0] || "";
  });

  if (rows.length !== 10) {
    throw new Error(`Expected 10 ${category.gender} ranking rows, found ${rows.length}.`);
  }

  return {
    lastUpdated,
    players: rows.map((player) => ({
      id: player.id,
      name: titleCaseSlug(player.id),
      country: player.country,
      gender: category.gender,
      currentRank: player.rank,
      officialPoints: player.officialPoints,
      pointsBreakdownUrl: pointsBreakdownUrl(player.href)
    }))
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const existingPlayers = await readJson(sourcesFile, []);
const existingPreview = await readJson(previewFile, { rankingDate: "", players: [] });
const rankingPlayers = [];
const warnings = [];
let rankingDate = existingPreview.rankingDate || "";

try {
  for (const category of categories) {
    try {
      const result = await scrapeCategory(page, category);
      rankingPlayers.push(...result.players);
      rankingDate = rankingDatePtBr(result.lastUpdated) || rankingDate;
    } catch (error) {
      const fallbackPlayers = existingPlayers.filter((player) => player.gender === category.gender);
      if (!fallbackPlayers.length) throw error;
      warnings.push(`Keeping previous ${category.gender} ranking because live scrape failed: ${error.message}`);
      rankingPlayers.push(...fallbackPlayers);
    }
  }
} finally {
  await browser.close();
}

if (rankingPlayers.length !== categories.length * 10) {
  throw new Error(`Expected ${categories.length * 10} total ranking rows, found ${rankingPlayers.length}.`);
}

await fs.writeFile(sourcesFile, `${JSON.stringify(rankingPlayers, null, 2)}\n`, "utf8");
await fs.mkdir(path.dirname(previewFile), { recursive: true });
await fs.writeFile(
  previewFile,
  `${JSON.stringify(
    {
      rankingDate,
      players: rankingPlayers,
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

console.log(`Scraped official ranking sources for ${rankingPlayers.length} players.`);
for (const warning of warnings) console.warn(warning);
