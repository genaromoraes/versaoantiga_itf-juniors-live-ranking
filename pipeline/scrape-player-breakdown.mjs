import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseItfPointsBreakdown } from "./parse-itf-points.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "itf-player-preview.json");
const players = JSON.parse(await fs.readFile(sourcesFile, "utf8"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const scrapedPlayers = [];

for (const player of players) {
  await page.goto(player.pointsBreakdownUrl, { waitUntil: "load", timeout: 60000 });
  const text = await page.locator("body").innerText({ timeout: 30000 });
  const parsed = parseItfPointsBreakdown(text);

  scrapedPlayers.push({
    id: player.id,
    name: player.name,
    country: player.country,
    gender: player.gender,
    currentRank: player.currentRank,
    sourceUrl: player.pointsBreakdownUrl,
    totalCombinedPoints: parsed.totalCombinedPoints,
    singles: parsed.singles,
    doubles: parsed.doubles,
    scrapedAt: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    }).format(new Date())
  });
}

await browser.close();

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(
  outputFile,
  `${JSON.stringify({ players: scrapedPlayers }, null, 2)}\n`,
  "utf8"
);

console.log(`Scraped ${scrapedPlayers.length} player(s) into ${path.relative(rootDir, outputFile)}.`);
