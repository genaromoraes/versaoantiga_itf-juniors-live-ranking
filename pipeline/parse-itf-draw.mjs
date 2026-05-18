function cleanLine(line) {
  return line.replace(/\s+/g, " ").trim();
}

function readAfter(lines, label) {
  const index = lines.indexOf(label);
  return index >= 0 ? lines[index + 1] || "" : "";
}

function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isLikelyPlayerLine(line) {
  if (!line || line.length < 3) return false;
  if (/^(H2H|Previous scores|PRINT|MAIN DRAW|KNOCK-OUT|BOYS|GIRLS|SINGLES|DOUBLES|R1|R2|QF|SF|F)$/i.test(line)) {
    return false;
  }
  if (/^\d+$/.test(line) || /^RETIRED$/i.test(line)) return false;
  return /[a-z]/i.test(line);
}

export function parseItfDraw(text) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const tournamentIndex = lines.findIndex((line) => /^J\d{2,3}\s/i.test(line));
  const tournamentName = tournamentIndex >= 0 ? lines[tournamentIndex] : "";
  const date = readAfter(lines, "Date:");
  const hostNation = readAfter(lines, "Host nation:");
  const surface = readAfter(lines, "Surface:");
  const playerType = lines.includes("BOYS") ? "Boys" : lines.includes("GIRLS") ? "Girls" : "";
  const matchType = lines.includes("SINGLES") ? "Singles" : lines.includes("DOUBLES") ? "Doubles" : "";
  const drawType = lines.includes("MAIN DRAW") ? "Main draw" : "";
  const roundLabels = lines.filter((line) => /^(R1|R2|R3|QF|SF|F)$/.test(line));

  const drawStart = lines.indexOf("H2H");
  const drawEnd = lines.findIndex((line, index) => index > drawStart && line === "COMMERCIAL PARTNERS");
  const drawLines = drawStart >= 0 ? lines.slice(drawStart, drawEnd > drawStart ? drawEnd : undefined) : [];
  const playerLines = [];

  for (let index = 0; index < drawLines.length; index += 1) {
    const line = drawLines[index];
    if (/^[A-Z]{3}$/.test(line) && isLikelyPlayerLine(drawLines[index + 1])) {
      playerLines.push({
        country: line,
        name: drawLines[index + 1],
        normalizedName: normalizeName(drawLines[index + 1])
      });
      index += 1;
      continue;
    }

    if (isLikelyPlayerLine(line) && /^(H2H|Previous scores)$/.test(drawLines[index - 1] || "")) {
      playerLines.push({
        country: "",
        name: line,
        normalizedName: normalizeName(line)
      });
    }
  }

  return {
    tournamentName,
    date,
    hostNation,
    surface,
    playerType,
    matchType,
    drawType,
    roundLabels,
    players: Array.from(new Map(playerLines.map((player) => [player.normalizedName, player])).values())
  };
}
