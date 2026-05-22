import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const latestFile = path.join(rootDir, "data", "latest.json");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");

const latest = JSON.parse(await fs.readFile(latestFile, "utf8"));
const sources = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
const players = Array.isArray(latest.players) ? latest.players : [];
const configuredPlayersPerGender = Number(process.env.RANKING_LIMIT || 0);
const skippedUpdate = Boolean(latest.skippedUpdateReason);
const partialUpdate = Boolean(latest.partialUpdateReason);
const invalidPlayers = players.filter((player) => {
  const hasBreakdown = (player.singles?.length || 0) + (player.doubles?.length || 0) > 0;
  const hasOfficialPoints = Number(player.officialPoints || player.sourceTotalCombinedPoints || 0) > 0;
  return !hasBreakdown && !hasOfficialPoints;
});

const sourceCountsByGender = new Map(
  ["Boys", "Girls"].map((gender) => [
    gender,
    sources.filter((player) => player.gender === gender).length
  ])
);

for (const gender of ["Boys", "Girls"]) {
  const sourceCount = sourceCountsByGender.get(gender) || 0;
  const playerCount = players.filter((player) => player.gender === gender).length;

  if (configuredPlayersPerGender > 0 && sourceCount !== configuredPlayersPerGender) {
    throw new Error(`Expected ${configuredPlayersPerGender} ${gender} source players, found ${sourceCount}.`);
  }

  if (!skippedUpdate && !partialUpdate && playerCount !== sourceCount) {
    throw new Error(`Expected ${sourceCount} ${gender} players in latest.json, found ${playerCount}.`);
  }
  if (partialUpdate && playerCount > sourceCount) {
    throw new Error(`Expected at most ${sourceCount} ${gender} players in latest.json during partial update, found ${playerCount}.`);
  }
}

if (!skippedUpdate && invalidPlayers.length) {
  throw new Error(`Refusing to publish empty ranking data for: ${invalidPlayers.map((player) => player.id).join(", ")}`);
}

if (skippedUpdate) {
  console.log(`Validated previous ranking data for ${players.length} players; skipped current update because ${latest.skippedUpdateReason}.`);
} else if (partialUpdate) {
  console.log(`Validated partial ranking data for ${players.length} players; awaiting complete points breakdowns for remaining players.`);
} else {
  console.log(`Validated latest ranking data for ${players.length} players.`);
}
