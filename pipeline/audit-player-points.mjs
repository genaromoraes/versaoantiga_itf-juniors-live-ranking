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
  "sheet_base_points",
  "point_rows",
  "active_rows",
  "expired_rows",
  "singles_rows",
  "doubles_rows",
  "counting_singles",
  "counting_doubles",
  "missing_drop_date_rows",
  "bad_ranking_point_rows",
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

function saoPauloToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function expectedRankingPoints(row) {
  return numberValue(row.points) * numberValue(row.weight || (row.result_type === "doubles" ? 0.25 : 1));
}

function topSixTotal(rows) {
  return rows
    .sort((a, b) => numberValue(b.points) - numberValue(a.points))
    .slice(0, 6)
    .reduce((total, row) => total + expectedRankingPoints(row), 0);
}

function statusForPlayer({ playerRows, missingDropDateRows, badRankingPointRows, singlesRows, doublesRows }) {
  const notes = [];

  if (!playerRows.length) notes.push("Adicionar o breakdown completo na planilha mestre.");
  if (missingDropDateRows.length) notes.push("Preencher drop_date nas linhas sem data de queda.");
  if (badRankingPointRows.length) notes.push("Conferir ranking_points: deve ser points x weight.");
  if (singlesRows.length < 6) notes.push("Menos de 6 resultados de simples na planilha.");
  if (doublesRows.length < 6) notes.push("Menos de 6 resultados de duplas na planilha.");

  return {
    status: notes.length ? "Revisar planilha" : "OK",
    notes: notes.join(" ")
  };
}

const sourcePlayers = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
const pointRows = await readPointsRows();
const today = saoPauloToday();
const rows = [headers];

for (const player of sourcePlayers) {
  const playerRows = pointRows.filter((row) => row.player_id === player.id);
  const activeRows = playerRows.filter((row) => row.drop_date && row.drop_date >= today);
  const expiredRows = playerRows.filter((row) => row.drop_date && row.drop_date < today);
  const singlesRows = activeRows.filter((row) => row.result_type === "singles");
  const doublesRows = activeRows.filter((row) => row.result_type === "doubles");
  const missingDropDateRows = playerRows.filter((row) => !row.drop_date);
  const badRankingPointRows = playerRows.filter((row) => Math.abs(numberValue(row.ranking_points) - expectedRankingPoints(row)) > 0.01);
  const countingSingles = Math.min(6, singlesRows.length);
  const countingDoubles = Math.min(6, doublesRows.length);
  const sheetBasePoints = roundTwo(topSixTotal(singlesRows) + topSixTotal(doublesRows));
  const health = statusForPlayer({
    playerRows,
    missingDropDateRows,
    badRankingPointRows,
    singlesRows,
    doublesRows
  });
  const profileNote = !player.pointsBreakdownUrl ? "Resolver URL do perfil ITF antes de buscar o breakdown." : "";
  const status = profileNote ? "Revisar perfil ITF" : health.status;
  const notes = [profileNote, health.notes].filter(Boolean).join(" ");

  rows.push([
    player.gender,
    player.currentRank,
    player.id,
    player.name,
    player.country,
    sheetBasePoints,
    playerRows.length,
    activeRows.length,
    expiredRows.length,
    singlesRows.length,
    doublesRows.length,
    countingSingles,
    countingDoubles,
    missingDropDateRows.length,
    badRankingPointRows.length,
    status,
    notes,
    player.pointsBreakdownUrl
  ]);
}

await fs.writeFile(outputFile, `${rows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`, "utf8");

const needsReview = rows.slice(1).filter((row) => row[15] !== "OK");
console.log(`Checked ${rows.length - 1} players against the local points table. ${needsReview.length} need spreadsheet review.`);
if (needsReview.length) {
  console.log(needsReview.map((row) => `- ${row[3]}: ${row[15]} (${row[16]})`).join("\n"));
}
