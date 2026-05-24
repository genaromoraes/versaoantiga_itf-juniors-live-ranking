import fs from "node:fs";

import { weekStartDate } from "./lib/itf-weekly-collector.mjs";

const TIMEZONE = "America/Sao_Paulo";
const THRESHOLD_MINUTES = 30;

function formatNowInSaoPauloParts() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${map.year}-${map.month}-${map.day}`;
}

function parseBrazilianDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})$/
  );
  if (!match) return null;

  const [, day, month, year, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute)
  };
}

function minutesSince(updatedAtParts, nowParts) {
  const updatedUtc = Date.UTC(
    updatedAtParts.year,
    updatedAtParts.month - 1,
    updatedAtParts.day,
    updatedAtParts.hour + 3,
    updatedAtParts.minute,
    0
  );
  const nowUtc = Date.UTC(
    Number(nowParts.year),
    Number(nowParts.month) - 1,
    Number(nowParts.day),
    Number(nowParts.hour) + 3,
    Number(nowParts.minute),
    Number(nowParts.second || 0)
  );

  return Math.floor((nowUtc - updatedUtc) / 60000);
}

function setOutput(name, value) {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) return;
  fs.appendFileSync(githubOutput, `${name}=${value}\n`, "utf8");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function inferPreviewWeekStart(preview) {
  const explicit = String(preview?.weekStartDate || "").trim();
  if (explicit) return explicit;

  const starts = (preview?.tournaments || [])
    .map((tournament) => String(tournament?.startDate || "").trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  return starts[0] || "";
}

function isUnfinishedResult(result) {
  if (!result || typeof result !== "object") return false;
  const status = String(result.status || "").trim().toLowerCase();
  const round = String(result.currentRound || "").trim().toUpperCase();

  if (!status || !round) return true;
  if (status === "ativo" && round !== "W") return true;
  if (round === "PENDENTE") return true;
  return false;
}

function tournamentStillLive(tournament) {
  const players = Array.isArray(tournament?.acceptedPlayers) ? tournament.acceptedPlayers : [];
  return players.some((player) => isUnfinishedResult(player.drawResult) || isUnfinishedResult(player.drawResultDoubles));
}

function weekLooksComplete(preview) {
  const tournaments = Array.isArray(preview?.tournaments) ? preview.tournaments : [];
  if (!tournaments.length) return false;

  const today = todayInSaoPaulo();

  return tournaments.every((tournament) => {
    const endDate = String(tournament?.endDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false;
    if (endDate > today) return false;
    if (tournamentStillLive(tournament)) return false;
    return true;
  });
}

function liveUpdatePolicy() {
  const preview = readJson("data/weekly-tournaments-preview.json");
  const currentWeekStart = weekStartDate(0);
  const nextWeekStart = weekStartDate(1);

  if (!preview) {
    return {
      forceRun: true,
      refreshTournaments: true,
      weekOffset: 0,
      policyReason: "weekly preview missing or unreadable"
    };
  }

  const previewWeekStart = inferPreviewWeekStart(preview);
  if (!previewWeekStart) {
    return {
      forceRun: true,
      refreshTournaments: true,
      weekOffset: 0,
      policyReason: "weekly preview has no identifiable week"
    };
  }

  if (previewWeekStart === nextWeekStart) {
    return {
      forceRun: false,
      refreshTournaments: false,
      weekOffset: 1,
      policyReason: "weekly preview already targets next week"
    };
  }

  if (previewWeekStart !== currentWeekStart) {
    return {
      forceRun: true,
      refreshTournaments: true,
      weekOffset: 0,
      policyReason: "weekly preview is out of sync with current week"
    };
  }

  if (weekLooksComplete(preview)) {
    return {
      forceRun: true,
      refreshTournaments: true,
      weekOffset: 1,
      policyReason: "current week is complete; advance to next week"
    };
  }

  return {
    forceRun: false,
    refreshTournaments: false,
    weekOffset: 0,
    policyReason: "current week still in progress"
  };
}

function decide() {
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const policy = liveUpdatePolicy();

  if (eventName === "workflow_dispatch") {
    return {
      shouldRun: true,
      reason: `Manual dispatch always runs; ${policy.policyReason}.`,
      refreshTournaments: policy.refreshTournaments,
      weekOffset: policy.weekOffset
    };
  }

  const latest = readJson("data/latest.json");
  if (!latest) {
    return {
      shouldRun: true,
      reason: `latest.json missing or unreadable; ${policy.policyReason}.`,
      refreshTournaments: true,
      weekOffset: policy.weekOffset
    };
  }

  const updatedAt = latest?.dataSource?.updatedAt;
  const updatedAtParts = parseBrazilianDateTime(updatedAt);

  if (!updatedAtParts) {
    return {
      shouldRun: true,
      reason: `updatedAt missing or invalid; ${policy.policyReason}.`,
      refreshTournaments: policy.refreshTournaments,
      weekOffset: policy.weekOffset
    };
  }

  const nowParts = formatNowInSaoPauloParts();
  const elapsedMinutes = minutesSince(updatedAtParts, nowParts);

  if (!Number.isFinite(elapsedMinutes)) {
    return {
      shouldRun: true,
      reason: `Could not compute elapsed minutes; ${policy.policyReason}.`,
      refreshTournaments: policy.refreshTournaments,
      weekOffset: policy.weekOffset
    };
  }

  const dueByTime = elapsedMinutes >= THRESHOLD_MINUTES;
  const shouldRun = dueByTime || policy.forceRun;

  return {
    shouldRun,
    reason: shouldRun
      ? `Live update authorized: ${policy.policyReason}; last update is ${elapsedMinutes} minutes old.`
      : `Last update is only ${elapsedMinutes} minutes old; ${policy.policyReason}.`,
    refreshTournaments: shouldRun ? policy.refreshTournaments : false,
    weekOffset: shouldRun ? policy.weekOffset : 0
  };
}

const decision = decide();

console.log(decision.reason);
setOutput("should_run", String(decision.shouldRun));
setOutput("reason", decision.reason.replace(/\r?\n/g, " "));
setOutput("refresh_tournaments", String(decision.refreshTournaments));
setOutput("week_offset", String(decision.weekOffset));
