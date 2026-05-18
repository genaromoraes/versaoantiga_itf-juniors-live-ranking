import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { parseItfDraw } from "./parse-itf-draw.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "tournaments.json");
const outputFile = path.join(rootDir, "data", "itf-tournament-preview.json");
const tournaments = JSON.parse(await fs.readFile(sourcesFile, "utf8"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const scrapedTournaments = [];

for (const tournament of tournaments) {
  await page.goto(tournament.url, { waitUntil: "load", timeout: 60000 });
  const text = await page.locator("body").innerText({ timeout: 30000 });
  const parsed = parseItfDraw(text);

  scrapedTournaments.push({
    ...tournament,
    ...parsed,
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
  `${JSON.stringify({ tournaments: scrapedTournaments }, null, 2)}\n`,
  "utf8"
);

console.log(`Scraped ${scrapedTournaments.length} tournament(s) into ${path.relative(rootDir, outputFile)}.`);
