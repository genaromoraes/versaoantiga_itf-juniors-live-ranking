import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseItfPointsBreakdown } from "./parse-itf-points.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "itf-player-preview.json");
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

function fallbackPlayer(player, reason) {
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

for (const player of players) {
  try {
    await page.goto(player.pointsBreakdownUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    const text = await page.locator("body").innerText({ timeout: 45000 });
    const parsed = parseItfPointsBreakdown(text);
    const playerName = parsed.playerName || player.name;
    const country = parsed.country || player.country;

    const scrapedPlayer = {
      id: player.id,
      name: playerName,
      country,
      gender: player.gender,
      currentRank: player.currentRank,
      sourceUrl: player.pointsBreakdownUrl,
      totalCombinedPoints: parsed.totalCombinedPoints,
      singles: parsed.singles,
      doubles: parsed.doubles,
      scrapedAt: stamp()
    };

    if (!hasResults(scrapedPlayer)) {
      scrapedPlayers.push(fallbackPlayer(player, "new scrape returned no results"));
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
  `${JSON.stringify({ players: scrapedPlayers }, null, 2)}\n`,
  "utf8"
);

console.log(`Scraped ${scrapedPlayers.length} player(s) into ${path.relative(rootDir, outputFile)}.`);
for (const warning of warnings) console.warn(warning);
