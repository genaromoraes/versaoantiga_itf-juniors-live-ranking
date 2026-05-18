import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const latestFile = path.join(rootDir, "data", "latest.json");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");

const latest = JSON.parse(await fs.readFile(latestFile, "utf8"));
const sources = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
const players = Array.isArray(latest.players) ? latest.players : [];
const invalidPlayers = players.filter((player) => {
  return (player.singles?.length || 0) + (player.doubles?.length || 0) === 0;
});

for (const gender of ["Boys", "Girls"]) {
  const sourceCount = sources.filter((player) => player.gender === gender).length;
  const playerCount = players.filter((player) => player.gender === gender).length;
  if (sourceCount !== 10) throw new Error(`Expected 10 ${gender} source players, found ${sourceCount}.`);
  if (playerCount !== 10) throw new Error(`Expected 10 ${gender} players in latest.json, found ${playerCount}.`);
}

if (invalidPlayers.length) {
  throw new Error(`Refusing to publish empty ranking data for: ${invalidPlayers.map((player) => player.id).join(", ")}`);
}

console.log(`Validated latest ranking data for ${players.length} players.`);
