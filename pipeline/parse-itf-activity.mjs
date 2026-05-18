function cleanLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function isTournamentStart(lines, index) {
  return (
    /^J\d{2,3}\s|Junior Championships|Junior Tennis Championships|Junior Finals/i.test(lines[index] || "") &&
    /^\d{2}\s[A-Za-z]{3}\sto\s\d{2}\s[A-Za-z]{3}\s\d{4}$/.test(lines[index + 1] || "")
  );
}

function normalizeDateRange(value) {
  const match = value.match(/^(\d{2})\s([A-Za-z]{3})\sto\s(\d{2})\s([A-Za-z]{3})\s(\d{4})$/);
  if (!match) return { start: value, end: value };
  const [, startDay, startMonth, endDay, endMonth, year] = match;
  return {
    start: new Date(`${startDay} ${startMonth} ${year} UTC`).toISOString().slice(0, 10),
    end: new Date(`${endDay} ${endMonth} ${year} UTC`).toISOString().slice(0, 10)
  };
}

function parseMatches(lines, startIndex, endIndex) {
  const matches = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    const round = lines[index];
    if (!/^(R1|R2|R3|R4|R16|QF|SF|F)$/.test(round)) continue;

    const outcome = lines[index + 1];
    let cursor = index + 2;
    if (outcome !== "W" && outcome !== "L") {
      if (lines[index + 3] === "BYE") {
        matches.push({ round, outcome: "BYE", opponent: "BYE", score: "" });
        index += 3;
      }
      continue;
    }

    while (cursor < endIndex && lines[cursor] !== "v") cursor += 1;
    cursor += 1;

    const country = /^[A-Z]{3}$/.test(lines[cursor] || "") ? lines[cursor++] : "";
    const opponentParts = [];
    while (cursor < endIndex && !/^\d/.test(lines[cursor] || "") && !/^(R1|R2|R3|R4|R16|QF|SF|F)$/.test(lines[cursor] || "")) {
      opponentParts.push(lines[cursor]);
      cursor += 1;
    }

    const scoreParts = [];
    while (cursor < endIndex && !/^(R1|R2|R3|R4|R16|QF|SF|F)$/.test(lines[cursor] || "") && !isTournamentStart(lines, cursor)) {
      scoreParts.push(lines[cursor]);
      cursor += 1;
    }

    matches.push({
      round,
      outcome,
      opponentCountry: country,
      opponent: opponentParts.join(" "),
      score: scoreParts.join(" ")
    });
    index = cursor - 1;
  }

  return matches;
}

function nextRoundAfterBye(lines, startIndex, endIndex) {
  if (/^(R1|R2|R3|R4|R16|QF|SF|F)$/.test(lines[startIndex]) && lines[startIndex + 1] === "H2H") {
    return lines[startIndex];
  }

  for (let index = startIndex; index < endIndex - 3; index += 1) {
    if (/^(R1|R2|R3|R4|R16|QF|SF|F)$/.test(lines[index]) && lines[index + 3] === "BYE") {
      for (let cursor = index + 4; cursor < endIndex; cursor += 1) {
        if (/^(R1|R2|R3|R4|R16|QF|SF|F)$/.test(lines[cursor])) return lines[cursor];
      }
    }
  }
  return "";
}

export function parseItfActivity(text) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const activityIndex = lines.findIndex((line) => line.includes("JUNIORS SINGLES ACTIVITY"));
  const usefulLines = activityIndex >= 0 ? lines.slice(activityIndex) : lines;
  const tournaments = [];

  for (let index = 0; index < usefulLines.length; index += 1) {
    if (!isTournamentStart(usefulLines, index)) continue;

    const nextTournamentIndex = usefulLines.findIndex((line, candidateIndex) => candidateIndex > index && isTournamentStart(usefulLines, candidateIndex));
    const endIndex = nextTournamentIndex > index ? nextTournamentIndex : usefulLines.length;
    const dateRange = normalizeDateRange(usefulLines[index + 1]);
    const matchesStart = index + 9;
    const matches = parseMatches(usefulLines, matchesStart, endIndex);
    const lastPlayed = [...matches].reverse().find((match) => match.outcome === "W" || match.outcome === "L");
    const byeNextRound = nextRoundAfterBye(usefulLines, matchesStart, endIndex);

    tournaments.push({
      event: usefulLines[index],
      startDate: dateRange.start,
      endDate: dateRange.end,
      city: usefulLines[index + 2] || "",
      country: usefulLines[index + 3] || "",
      grade: usefulLines[index + 4] || "",
      surface: usefulLines[index + 5] || "",
      draw: usefulLines[index + 6] || "",
      matchType: usefulLines[index + 7] || "",
      entryType: usefulLines[index + 8] || "",
      status: lastPlayed?.outcome === "L" ? "Eliminado" : "Ativo",
      currentRound: lastPlayed?.round || byeNextRound || matches[0]?.round || "",
      matches
    });

    index = endIndex - 1;
  }

  return { tournaments };
}
