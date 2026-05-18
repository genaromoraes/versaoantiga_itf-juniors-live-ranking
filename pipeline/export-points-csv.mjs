import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewFile = path.join(rootDir, "data", "itf-player-preview.json");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "player-points.csv");

function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const preview = JSON.parse(await fs.readFile(previewFile, "utf8"));
const sources = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
const sourcesById = new Map(sources.map((player) => [player.id, player]));
const headers = [
  "player_id",
  "player_name",
  "country",
  "gender",
  "current_rank",
  "source_url",
  "result_type",
  "event",
  "grade",
  "date",
  "drop_date",
  "points",
  "weight",
  "ranking_points",
  "source_counting"
];

const rows = [headers];

for (const player of preview.players || []) {
  const sourcePlayer = sourcesById.get(player.id) || player;
  for (const resultType of ["singles", "doubles"]) {
    const weight = resultType === "doubles" ? 0.25 : 1;
    for (const result of player[resultType] || []) {
      rows.push([
        player.id,
        sourcePlayer.name,
        sourcePlayer.country,
        sourcePlayer.gender,
        sourcePlayer.currentRank,
        player.sourceUrl,
        resultType,
        result.event,
        result.grade,
        result.date,
        addDays(result.date, 364),
        result.points,
        weight,
        Number(result.points || 0) * weight,
        result.sourceCounting !== false
      ]);
    }
  }
}

await fs.writeFile(outputFile, `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`, "utf8");
console.log(`Exported ${rows.length - 1} point rows to ${path.relative(rootDir, outputFile)}.`);
