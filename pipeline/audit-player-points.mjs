import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = path.join(rootDir, "pipeline", "sources", "players.json");
const pointsCsvFile = path.join(rootDir, "data", "player-points.csv");
const outputFile = path.join(rootDir, "data", "player-points-status.csv");

const headers = [
  "gender",
  "current_rank",
  "player_id",
  "player_name",
  "country",
  "official_points",
  "csv_counting_points",
  "difference",
  "point_rows",
  "singles_rows",
  "doubles_rows",
  "status",
  "notes",
  "points_breakdown_url"
];

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function csvValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function readPointsRows() {
  const csv = await fs.readFile(pointsCsvFile, "utf8");
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const sourceHeaders = parseCsvLine(headerLine);

  return lines.map((line) => {
    const columns = parseCsvLine(line);
    return Object.fromEntries(sourceHeaders.map((header, index) => [header, columns[index] || ""]));
  });
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function roundTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const sourcePlayers = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
const pointRows = await readPointsRows();
const rows = [headers];

for (const player of sourcePlayers) {
  const playerRows = pointRows.filter((row) => row.player_id === player.id);
  const singlesRows = playerRows.filter((row) => row.result_type === "singles");
  const doublesRows = playerRows.filter((row) => row.result_type === "doubles");
  const csvCountingPoints = playerRows
    .filter((row) => row.source_counting !== "false")
    .reduce((total, row) => total + numberValue(row.ranking_points), 0);
  const officialPoints = numberValue(player.officialPoints);
  const difference = roundTwo(csvCountingPoints - officialPoints);
  const hasBreakdown = playerRows.length > 0;
  const hasDifference = Math.abs(difference) > 0.01;
  const status = !hasBreakdown ? "Pendente - sem breakdown" : hasDifference ? "Revisar - soma difere do oficial" : "OK";
  const notes = !hasBreakdown
    ? "Adicionar o breakdown completo na planilha mestre."
    : hasDifference
      ? "Conferir pontos que cairam, novos resultados ou linhas marcadas como contando."
      : "";

  rows.push([
    player.gender,
    player.currentRank,
    player.id,
    player.name,
    player.country,
    officialPoints,
    roundTwo(csvCountingPoints),
    difference,
    playerRows.length,
    singlesRows.length,
    doublesRows.length,
    status,
    notes,
    player.pointsBreakdownUrl
  ]);
}

await fs.writeFile(outputFile, `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`, "utf8");

const needsReview = rows.slice(1).filter((row) => row[11] !== "OK");
console.log(`Audited ${rows.length - 1} players. ${needsReview.length} need review.`);
if (needsReview.length) {
  console.log(needsReview.map((row) => `- ${row[3]}: ${row[11]} (${row[12]})`).join("\n"));
}
