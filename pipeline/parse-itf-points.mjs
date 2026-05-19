const DATE_RE = /^\d{2}\s[A-Za-z]{3}\s\d{4}$/;
const DATE_INLINE_RE = /\d{2}\s[A-Za-z]{3}\s\d{4}/;
const CATEGORY_RE = /(JGS|JM|J500|J300|J200|J100|J60|J30|GC|GA|GB|G1|G2|G3|G4|G5)/;
const SURFACE_RE = /(Clay|Hard|Grass|Carpet|Acrylic|Artificial Grass|Artificial Clay)/i;
const ROUND_RE = /(WR|W|RU|F|SF|QF|R16|R32|R64|R128|RR|Q[0-9]?|Round Robin [0-9a-z\s]+ Place)/i;

function cleanLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function parsePoints(value = "") {
  const normalized = String(value).replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value) {
  const parsed = new Date(`${value} UTC`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function parseTournamentBlocks(lines, startIndex) {
  const results = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (
      line === "Total Points:" ||
      line.startsWith("Total Points:") ||
      line === "Countable Tournaments" ||
      line === "Remaining Non-countable Tournaments" ||
      line === "Latest media"
    ) {
      break;
    }

    const dateIndex = lines.slice(index + 1, index + 5).findIndex((candidate) => DATE_RE.test(candidate));
    if (dateIndex === -1) {
      index += 1;
      continue;
    }

    const absoluteDateIndex = index + 1 + dateIndex;
    const event = lines.slice(index, absoluteDateIndex).join(" ");
    const date = lines[absoluteDateIndex];
    const grade = lines[absoluteDateIndex + 1] || "";
    const surface = lines[absoluteDateIndex + 2] || "";
    const pointsLabel = lines[absoluteDateIndex + 3] || "";
    const points = Number(lines[absoluteDateIndex + 4] || 0);

    if (event && pointsLabel === "Points:" && Number.isFinite(points)) {
      results.push({
        event,
        date: normalizeDate(date),
        grade,
        surface,
        points
      });
      index = absoluteDateIndex + 5;
      continue;
    }

    index += 1;
  }

  return { results, nextIndex: index };
}

function sectionAfter(text, startMarker, endMarkers) {
  const startIndex = text.indexOf(startMarker);
  if (startIndex < 0) return "";

  const contentStart = startIndex + startMarker.length;
  const endIndex = endMarkers
    .map((marker) => text.indexOf(marker, contentStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return text.slice(contentStart, endIndex >= 0 ? endIndex : undefined).trim();
}

function stripTableHeader(text) {
  return text
    .replace(/^TOURNAMENT\s+CATEGORY\s+COUNTRY\s+START DATE\s+SURFACE\s+ROUND\s+DRAW\s+POINTS\s*/i, "")
    .replace(/\s*Total Points:\s*[\d.,]+.*$/i, "")
    .trim();
}

function parseCompactTournamentRows(text, sourceCounting) {
  const results = [];
  const rowText = stripTableHeader(text);
  if (!rowText) return results;

  const rowPattern = new RegExp(
    `(.+?)\\s+${CATEGORY_RE.source}\\s+(.+?)\\s+(${DATE_INLINE_RE.source})\\s+${SURFACE_RE.source}\\s+${ROUND_RE.source}\\s+([MQ])\\s+(-?\\d+(?:[.,]\\d+)?)`,
    "gi"
  );

  for (const match of rowText.matchAll(rowPattern)) {
    const [, event, grade, country, date, surface, round, draw, points] = match;

    results.push({
      event: event.trim(),
      date: normalizeDate(date),
      grade: grade.toUpperCase(),
      country: country.trim(),
      surface: surface.trim(),
      round: round.trim(),
      draw,
      points: parsePoints(points),
      sourceCounting
    });
  }

  return results;
}

function parseCompactBreakdown(text) {
  const compactText = cleanLine(text);
  const singlesCountable = sectionAfter(compactText, "Singles Countable Tournaments", [
    "Remaining Non-countable Tournaments",
    "Doubles Countable Tournaments",
    "Latest media"
  ]);
  const singlesNonCountable = sectionAfter(compactText, "Remaining Non-countable Tournaments", [
    "Doubles Countable Tournaments",
    "Latest media"
  ]);
  const doublesCountable = sectionAfter(compactText, "Doubles Countable Tournaments", [
    "Remaining Non-countable Tournaments",
    "Latest media"
  ]);
  const doublesNonCountableStart = compactText.indexOf("Doubles Countable Tournaments");
  const doublesNonCountable =
    doublesNonCountableStart >= 0
      ? sectionAfter(compactText.slice(doublesNonCountableStart), "Remaining Non-countable Tournaments", ["Latest media"])
      : "";

  return {
    singles: [
      ...parseCompactTournamentRows(singlesCountable, true),
      ...parseCompactTournamentRows(singlesNonCountable, false)
    ],
    doubles: [
      ...parseCompactTournamentRows(doublesCountable, true),
      ...parseCompactTournamentRows(doublesNonCountable, false)
    ]
  };
}

export function parseItfPointsBreakdown(text) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const profileStart = lines.findIndex((line) => line.includes("ITF POINTS BREAKDOWN"));
  const usefulLines = profileStart >= 0 ? lines.slice(profileStart) : lines;
  const playerHeading = usefulLines[0] || "";
  const nameIndex = lines.findIndex((line, index) => line === "SINGLES" && lines[index - 1]);
  const playerName = nameIndex > 0 ? lines[nameIndex - 1] : "";
  const countryIndex = lines.findIndex((line) => line === "Age:");
  const country = countryIndex > 0 ? lines[countryIndex - 1] : "";
  const totalIndex = usefulLines.findIndex((line) => line.startsWith("Total Combined Ranking Points:"));
  const totalFromNextLine = totalIndex >= 0 ? parsePoints(usefulLines[totalIndex + 1]) : null;
  const compactTotal = cleanLine(text).match(/Total Combined Ranking Points:\s*[\d.,]+\s*\+\s*\([\d.,]+\/4\)\s*=\s*([\d.,]+)/i);
  const totalCombinedPoints = compactTotal ? parsePoints(compactTotal[1]) : totalFromNextLine;

  const singles = [];
  const doubles = [];
  let mode = "";
  let sectionCounting = true;

  for (let index = 0; index < usefulLines.length; index += 1) {
    const line = usefulLines[index];

    if (line === "Singles") {
      mode = "singles";
      sectionCounting = true;
      continue;
    }

    if (line === "Doubles") {
      mode = "doubles";
      sectionCounting = true;
      continue;
    }

    if (line === "Remaining Non-countable Tournaments") {
      sectionCounting = false;
      const parsed = parseTournamentBlocks(usefulLines, index + 1);
      const target = mode === "doubles" ? doubles : singles;
      target.push(...parsed.results.map((item) => ({ ...item, sourceCounting: false })));
      index = parsed.nextIndex - 1;
      continue;
    }

    if (line === "Countable Tournaments" && (usefulLines[index + 1] === "Singles" || usefulLines[index + 1] === "Doubles")) {
      mode = usefulLines[index + 1].toLowerCase();
      sectionCounting = true;
      const parsed = parseTournamentBlocks(usefulLines, index + 2);
      const target = mode === "doubles" ? doubles : singles;
      target.push(...parsed.results.map((item) => ({ ...item, sourceCounting: sectionCounting })));
      index = parsed.nextIndex - 1;
    }
  }

  if (!singles.length && !doubles.length) {
    const compact = parseCompactBreakdown(text);
    singles.push(...compact.singles);
    doubles.push(...compact.doubles);
  }

  return {
    playerHeading,
    playerName,
    country,
    totalCombinedPoints,
    singles,
    doubles
  };
}
