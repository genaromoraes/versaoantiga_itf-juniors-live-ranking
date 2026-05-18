import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseItfActivity } from "./parse-itf-activity.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "itf-activity-preview.json");
const players = JSON.parse(await fs.readFile(sourcesFile, "utf8"));

async function readExistingPreview() {
  try {
    return JSON.parse(await fs.readFile(outputFile, "utf8")).players || [];
  } catch {
    return [];
  }
}

function activityUrlFromBreakdown(url) {
  return url.replace("/itf-points-breakdown/", "/activity/");
}

function doublesActivityUrlFromBreakdown(url) {
  return activityUrlFromBreakdown(url).replace("/jt/s/activity/", "/jt/d/activity/");
}

async function scrapeActivityPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  const text = await page.locator("body").innerText({ timeout: 45000 });
  return parseItfActivity(text).tournaments;
}

const existingById = new Map((await readExistingPreview()).map((player) => [player.id, player]));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const activityPlayers = [];
const warnings = [];

for (const player of players) {
  const activityUrl = player.activityUrl || activityUrlFromBreakdown(player.pointsBreakdownUrl);
  const doublesActivityUrl = player.doublesActivityUrl || doublesActivityUrlFromBreakdown(player.pointsBreakdownUrl);
  try {
    const singlesTournaments = await scrapeActivityPage(page, activityUrl);
    const doublesTournaments = await scrapeActivityPage(page, doublesActivityUrl);

    activityPlayers.push({
      id: player.id,
      name: player.name,
      activityUrl,
      doublesActivityUrl,
      tournaments: [...singlesTournaments, ...doublesTournaments]
    });
  } catch (error) {
    const existing = existingById.get(player.id);
    if (existing) {
      warnings.push(`Keeping previous activity for ${player.id}; ${error.message}.`);
      activityPlayers.push(existing);
    } else {
      warnings.push(`No activity available for ${player.id}; ${error.message}.`);
      activityPlayers.push({
        id: player.id,
        name: player.name,
        activityUrl,
        doublesActivityUrl,
        tournaments: []
      });
    }
  }
}

await browser.close();

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify({ players: activityPlayers }, null, 2)}\n`, "utf8");

console.log(`Scraped activity for ${activityPlayers.length} player(s) into ${path.relative(rootDir, outputFile)}.`);
for (const warning of warnings) console.warn(warning);
