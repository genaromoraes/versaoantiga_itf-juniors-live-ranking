import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const previewFile = path.join(rootDir, "data", "itf-ranking-preview.json");
const rankingUrl = "https://www.itftennis.com/en/rankings/world-tennis-tour-junior-rankings/?matchType=S%2F1000";
const rankingLimit = Number(process.env.RANKING_LIMIT || 50);
const categories = [
  { gender: "Boys", playerType: "B", auxiliaryUrl: "https://tennisdbjp.com/junior-en/list/wboysrank.html" },
  { gender: "Girls", playerType: "G", auxiliaryUrl: "https://tennisdbjp.com/junior-en/list/wgirlsrank.html" }
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

function canonicalPointsBreakdownUrl(url = "") {
  const match = url.match(/https?:\/\/www\.itftennis\.com\/en\/players\/([^/"'<>\s]+)\/(\d+)\/([a-z]{3})\/(?:jt|mt|wt)\/[sd]/i);
  if (!match) return "";

  return `https://www.itftennis.com/en/players/${match[1]}/${match[2]}/${match[3].toLowerCase()}/jt/s/itf-points-breakdown/`;
}

function decodeBase64Url(value = "") {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugifyName(name = "") {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function playerKey(player) {
  return `${slugifyName(player.name)}|${player.country || ""}`;
}

function mergeRankingPlayers(primaryPlayers, auxiliaryPlayers, existingPlayers, gender) {
  const primaryByKey = new Map(primaryPlayers.map((player) => [playerKey(player), player]));
  const existingByKey = new Map(existingPlayers.filter((player) => player.gender === gender).map((player) => [playerKey(player), player]));

  return auxiliaryPlayers.map((candidate) => {
    const primary = primaryByKey.get(playerKey(candidate));
    const existing = existingByKey.get(playerKey(candidate));
    const profile = primary || existing;

    return {
      ...candidate,
      id: profile?.id || slugifyName(candidate.name),
      name: profile?.name || candidate.name,
      country: profile?.country || candidate.country,
      gender,
      currentRank: candidate.currentRank,
      officialPoints: profile?.officialPoints || candidate.officialPoints || 0,
      pointsBreakdownUrl: profile?.pointsBreakdownUrl || "",
      needsProfileResolution: !profile?.pointsBreakdownUrl
    };
  });
}

async function scrapeAuxiliaryCategory(page, category) {
  await page.goto(category.auxiliaryUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  const result = await page.evaluate((limit) => {
    const lines = document.body.innerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rankingDate = lines.find((line) => /^\d{4}\/\d{2}\/\d{2}/.test(line)) || "";
    const players = [];

    for (const line of lines) {
      const match = line.match(/^(\d+)(?:\s+\([^)]+\))?\s+(.+?)\s+(20\d{2})\s+([A-Z]{3})$/);
      if (!match) continue;

      players.push({
        currentRank: Number(match[1]),
        name: match[2].trim(),
        country: match[4].trim()
      });

      if (players.length >= limit) break;
    }

    return { rankingDate, players };
  }, rankingLimit);

  if (result.players.length < rankingLimit) {
    throw new Error(`Auxiliary ranking returned ${result.players.length} ${category.gender} rows; expected ${rankingLimit}.`);
  }

  return result;
}

function matchingItfProfileUrl(urls, player) {
  const expectedSlug = slugifyName(player.name);
  const expectedCountry = (player.country || "").toLowerCase();

  return (
    urls
      .map((url) => canonicalPointsBreakdownUrl(safeDecode(url)))
      .find((url) => {
        const parts = url.match(/\/players\/([^/]+)\/\d+\/([a-z]{3})\/jt\/s\/itf-points-breakdown\//i);
        return parts?.[1] === expectedSlug && parts?.[2].toLowerCase() === expectedCountry;
      }) || ""
  );
}

async function resolveItfProfileFromItfSearch(page, player) {
  await page.goto("https://www.itftennis.com/en/players/", { waitUntil: "domcontentloaded", timeout: 45000 });

  const visibleInputs = page.locator("input:visible");
  const inputCount = await visibleInputs.count().catch(() => 0);
  for (let index = 0; index < inputCount; index += 1) {
    const input = visibleInputs.nth(index);
    try {
      await input.fill(player.name, { timeout: 5000 });
      await input.press("Enter", { timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch {
      continue;
    }

    const urls = await page.evaluate(() => [...document.querySelectorAll('a[href*="/en/players/"]')].map((link) => link.href));
    const resolvedUrl = matchingItfProfileUrl(urls, player);
    if (resolvedUrl) return resolvedUrl;
  }

  return "";
}

async function resolveItfProfileUrl(page, player) {
  const fromItfSearch = await resolveItfProfileFromItfSearch(page, player).catch(() => "");
  if (fromItfSearch) return fromItfSearch;

  const query = ["site:itftennis.com/en/players/", `"${player.name}"`, player.country, "itf points breakdown"].join(" ");

  await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(750);

  const urls = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll("a[href]")].map((link) => link.href);
    const bodyUrls = document.body.innerHTML.match(/https?:\/\/www\.itftennis\.com\/en\/players\/[^"'<>\\\s]+/gi) || [];

    return [...hrefs, ...bodyUrls].flatMap((value) => {
      try {
        const url = new URL(value);
        const bingEncoded = url.searchParams.get("u") || "";
        const decodedBing = bingEncoded.startsWith("a1") ? atob(bingEncoded.slice(2).replace(/-/g, "+").replace(/_/g, "/")) : "";
        return [value, url.searchParams.get("url"), url.searchParams.get("u"), decodedBing].filter(Boolean);
      } catch {
        return [value];
      }
    });
  });

  const resolvedUrl = matchingItfProfileUrl(
    urls.flatMap((url) => {
      const decoded = safeDecode(url);
      const maybeBingEncoded = decoded.startsWith("a1") ? decodeBase64Url(decoded.slice(2)) : "";
      return [url, decoded, maybeBingEncoded].filter(Boolean);
    }),
    player
  );
  if (resolvedUrl) return resolvedUrl;

  const duckDuckGoUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${player.name} ${player.country} site:itftennis.com/en/players`)}`;
  await page.goto(duckDuckGoUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(750);

  const duckDuckGoUrls = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll("a[href]")].map((link) => link.href);
    const bodyUrls = document.body.innerHTML.match(/https?:\/\/www\.itftennis\.com\/en\/players\/[^"'<>\\\s]+/gi) || [];

    return [...hrefs, ...bodyUrls].flatMap((value) => {
      try {
        const url = new URL(value);
        return [value, url.searchParams.get("uddg")].filter(Boolean);
      } catch {
        return [value];
      }
    });
  });

  return matchingItfProfileUrl(duckDuckGoUrls, player);
}

async function resolveMissingItfProfiles(page, players, warnings) {
  for (const player of players) {
    if (player.pointsBreakdownUrl) continue;

    try {
      const resolvedUrl = await resolveItfProfileUrl(page, player);
      if (!resolvedUrl) {
        warnings.push(`Could not resolve ITF profile URL for ${player.id}.`);
        continue;
      }

      player.pointsBreakdownUrl = resolvedUrl;
      player.needsProfileResolution = false;
    } catch (error) {
      warnings.push(`Could not resolve ITF profile URL for ${player.id}: ${error.message}`);
    }
  }
}

async function scrapeVisibleRows(page, limit) {
  return page.evaluate((rankingLimit) => {
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
    let auxiliaryPlayers = [];
    try {
      const auxiliary = await scrapeAuxiliaryCategory(page, category);
      auxiliaryPlayers = auxiliary.players.map((player) => ({
        ...player,
        gender: category.gender,
        id: slugifyName(player.name),
        officialPoints: 0,
        pointsBreakdownUrl: ""
      }));
      rankingDate = auxiliary.rankingDate.replaceAll("/", "-") || rankingDate;
    } catch (error) {
      warnings.push(`Could not read auxiliary ${category.gender} ranking: ${error.message}`);
    }

    try {
      const result = await scrapeCategory(page, category);
      rankingPlayers.push(
        ...(auxiliaryPlayers.length
          ? mergeRankingPlayers(result.players, auxiliaryPlayers, existingPlayers, category.gender)
          : result.players)
      );
      rankingDate = rankingDatePtBr(result.lastUpdated) || rankingDate;
    } catch (error) {
      const fallbackPlayers = existingPlayers.filter((player) => player.gender === category.gender);
      if (!fallbackPlayers.length && !auxiliaryPlayers.length) throw error;
      warnings.push(`Keeping previous ${category.gender} ranking because live scrape failed: ${error.message}`);
      rankingPlayers.push(
        ...(auxiliaryPlayers.length
          ? mergeRankingPlayers([], auxiliaryPlayers, existingPlayers, category.gender)
          : fallbackPlayers)
      );
    }
  }

  await resolveMissingItfProfiles(page, rankingPlayers, warnings);
} finally {
  await browser.close();
}

if (rankingPlayers.length !== categories.length * rankingLimit) {
  warnings.push(`ITF ranking page returned ${rankingPlayers.length} total rows; requested ${categories.length * rankingLimit}. Continuing with available rows.`);
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
