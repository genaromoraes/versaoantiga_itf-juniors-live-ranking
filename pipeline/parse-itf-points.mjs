const DATE_RE = /^\d{2}\s[A-Za-z]{3}\s\d{4}$/;

function cleanLine(line) {
  return line.replace(/\s+/g, " ").trim();
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

export function parseItfPointsBreakdown(text) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const profileStart = lines.findIndex((line) => line.includes("ITF POINTS BREAKDOWN"));
  const usefulLines = profileStart >= 0 ? lines.slice(profileStart) : lines;
  const playerHeading = usefulLines[0] || "";
  const totalIndex = usefulLines.findIndex((line) => line.startsWith("Total Combined Ranking Points:"));
  const totalCombinedPoints = totalIndex >= 0 ? Number(usefulLines[totalIndex + 1]) : null;

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

  return {
    playerHeading,
    totalCombinedPoints,
    singles,
    doubles
  };
}
