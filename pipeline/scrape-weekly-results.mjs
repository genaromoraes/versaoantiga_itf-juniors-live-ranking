import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateOutsiders,
  calendarStartDate,
  collectWeeklyItfSnapshot,
  csvValue,
  saoPauloTimestamp,
  weekStartDate,
  weeklyRowsFromTournaments
} from "./lib/itf-weekly-collector.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = path.join(rootDir, "pipeline", "sources", "players.json");
const outputFile = path.join(rootDir, "data", "weekly-results.csv");
const previewFile = path.join(rootDir, "data", "weekly-tournaments-preview.json");
const outsidersOutputFile = path.join(rootDir, "data", "weekly-outsiders.csv");
const outsidersPreviewFile = path.join(rootDir, "data", "weekly-outsiders-preview.json");

const headers = [
  "player_id",
  "player_name",
  "match_type",
  "event",
  "grade",
  "start_date",
  "end_date",
  "status",
  "current_round",
  "points_override",
  "source_url",
  "notes"
];

const outsiderHeaders = [
  "player_itf_id",
  "player_name",
  "gender",
  "country",
  "junior_rank",
  "entry_groups",
  "tournaments",
  "source_urls",
  "draw_urls",
  "notes"
];

function summarizeTournament(tournament = {}) {
  return {
    tournamentName: tournament.tournamentName || "",
    grade: tournament.grade || "",
    startDate: tournament.startDate || "",
    endDate: tournament.endDate || "",
    status: tournament.status || "",
    country: tournament.country || "",
    surface: tournament.surface || "",
    key: tournament.key || "",
    tournamentId: tournament.tournamentId || "",
    tournamentUrl: tournament.tournamentUrl || "",
    drawsUrl: tournament.drawsUrl || "",
    fallbackUsed: Boolean(tournament.fallbackUsed),
    itfApiWarning: tournament.itfApiWarning || "",
    drawWarning: tournament.drawWarning || "",
    events: tournament.events || [],
    drawsheetsSummary: tournament.drawsheetsSummary || [],
    acceptedPlayers: (tournament.acceptedPlayers || []).map((player) => ({
      id: player.id,
      name: player.name,
      country: player.country,
      gender: player.gender,
      currentRank: player.currentRank,
      birthYear: player.birthYear || "",
      officialPoints: player.officialPoints,
      entryGroup: player.entryGroup || "",
      juniorRank: player.juniorRank || "",
      itfPlayerId: player.itfPlayerId || "",
      drawResult: player.drawResult || null,
      drawResultDoubles: player.drawResultDoubles || null
    })),
    outsiderCandidates: tournament.outsiderCandidates || []
  };
}

async function readStoredTournaments() {
  try {
    const raw = await fs.readFile(previewFile, "utf8");
    const payload = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!payload) return [];

    const targetWeekOffset = Number.parseInt(process.env.WEEKLY_WEEK_OFFSET || "0", 10) || 0;
    const targetWeekStart = weekStartDate(targetWeekOffset);
    const storedWeekStart = String(payload.weekStartDate || "").trim();
    const storedCalendarStart = String(payload.calendarStartDate || "").trim();

    const sameWeek =
      storedWeekStart
        ? storedWeekStart === targetWeekStart
        : storedCalendarStart === calendarStartDate(targetWeekOffset);

    if (!sameWeek) return [];
    return Array.isArray(payload.tournaments) ? payload.tournaments : [];
  } catch {
    return [];
  }
}

const players = JSON.parse(await fs.readFile(playersFile, "utf8"));
const weekOffset = Number.parseInt(process.env.WEEKLY_WEEK_OFFSET || "0", 10) || 0;
const storedTournaments = await readStoredTournaments();
const refreshTournamentCatalog = process.env.WEEKLY_REFRESH_TOURNAMENTS !== "false";
const snapshot = await collectWeeklyItfSnapshot({
  players,
  storedTournaments,
  refreshTournamentCatalog,
  weekOffset
});
const weeklyRows = weeklyRowsFromTournaments(snapshot.tournaments);
const outsiders = snapshot.outsiders || aggregateOutsiders(snapshot.tournaments);

const weeklyCsvRows = [headers, ...weeklyRows.map((row) => headers.map((header) => row[header] ?? ""))];
const outsiderCsvRows = [
  outsiderHeaders,
  ...outsiders.map((row) => outsiderHeaders.map((header) => row[header] ?? ""))
];

await fs.writeFile(
  outputFile,
  `${weeklyCsvRows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`,
  "utf8"
);

await fs.writeFile(
  outsidersOutputFile,
  `${outsiderCsvRows.map((row) => row.map(csvValue).join(",")).join("\n")}\n`,
  "utf8"
);

await fs.writeFile(
  previewFile,
  `${JSON.stringify(
    {
      scrapedAt: snapshot.scrapedAt || saoPauloTimestamp(),
      calendarStartDate: snapshot.calendarStartDate || calendarStartDate(weekOffset),
      weekStartDate: snapshot.weekStartDate || weekStartDate(weekOffset),
      tournaments: snapshot.tournaments.map(summarizeTournament)
    },
    null,
    2
  )}\n`,
  "utf8"
);

await fs.writeFile(
  outsidersPreviewFile,
  `${JSON.stringify(
    {
      scrapedAt: snapshot.scrapedAt || saoPauloTimestamp(),
      outsidersFound: outsiders.length,
      boysOutsiders: outsiders.filter((item) => item.gender === "Boys").length,
      girlsOutsiders: outsiders.filter((item) => item.gender === "Girls").length,
      outsiders
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(
  `Found ${snapshot.tournaments.length} tournament(s) for week ${snapshot.weekStartDate || weekStartDate(weekOffset)} from ITF (${refreshTournamentCatalog ? "refreshed calendar" : "reused stored calendar"}).`
);
console.log(`Generated ${path.relative(rootDir, outputFile)} with ${weeklyRows.length} weekly result row(s).`);
console.log(`Generated ${path.relative(rootDir, outsidersOutputFile)} with ${outsiders.length} outsider candidate(s).`);
