import fs from "node:fs";

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
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return map;
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

function decide() {
  const eventName = process.env.GITHUB_EVENT_NAME || "";

  if (eventName === "workflow_dispatch") {
    return {
      shouldRun: true,
      reason: "Manual dispatch always runs."
    };
  }

  let latest;
  try {
    latest = JSON.parse(fs.readFileSync("data/latest.json", "utf8"));
  } catch {
    return {
      shouldRun: true,
      reason: "latest.json missing or unreadable."
    };
  }

  const updatedAt = latest?.dataSource?.updatedAt;
  const updatedAtParts = parseBrazilianDateTime(updatedAt);

  if (!updatedAtParts) {
    return {
      shouldRun: true,
      reason: "updatedAt missing or invalid."
    };
  }

  const nowParts = formatNowInSaoPauloParts();
  const elapsedMinutes = minutesSince(updatedAtParts, nowParts);

  if (!Number.isFinite(elapsedMinutes)) {
    return {
      shouldRun: true,
      reason: "Could not compute elapsed minutes."
    };
  }

  if (elapsedMinutes >= THRESHOLD_MINUTES) {
    return {
      shouldRun: true,
      reason: `Last update is ${elapsedMinutes} minutes old.`
    };
  }

  return {
    shouldRun: false,
    reason: `Last update is only ${elapsedMinutes} minutes old.`
  };
}

const decision = decide();

console.log(decision.reason);
setOutput("should_run", String(decision.shouldRun));
setOutput("reason", decision.reason.replace(/\r?\n/g, " "));
