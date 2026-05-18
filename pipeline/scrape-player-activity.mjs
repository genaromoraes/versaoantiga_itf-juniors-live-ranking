import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseItfActivity } from "./parse-itf-activity.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "itf-activity-preview.json");
const players = JSON.parse(await fs.readFile(sourcesFile, "utf8"));

function activityUrlFromBreakdown(url) {
  return url.replace("/itf-points-breakdown/", "/activity/");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const activityPlayers = [];

for (const player of players) {
  const activityUrl = player.activityUrl || activityUrlFromBreakdown(player.pointsBreakdownUrl);
  await page.goto(activityUrl, { waitUntil: "load", timeout: 60000 });
  const text = await page.locator("body").innerText({ timeout: 30000 });
  activityPlayers.push({
    id: player.id,
    name: player.name,
    activityUrl,
    ...parseItfActivity(text)
  });
}

await browser.close();

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify({ players: activityPlayers }, null, 2)}\n`, "utf8");

console.log(`Scraped activity for ${activityPlayers.length} player(s) into ${path.relative(rootDir, outputFile)}.`);
