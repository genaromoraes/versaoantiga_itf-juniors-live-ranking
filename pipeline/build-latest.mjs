import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(rootDir, "data.js");
const previewFile = path.join(rootDir, "data", "itf-player-preview.json");
const outputDir = path.join(rootDir, "data");
const outputFile = path.join(outputDir, "latest.json");

const dataCode = await fs.readFile(dataFile, "utf8");
const context = vm.createContext({});

vm.runInContext(
  `${dataCode}
this.payload = {
  dataSource,
  players: samplePlayers
};`,
  context,
  { filename: "data.js" }
);

async function readRealPlayerPreview() {
  try {
    return JSON.parse(await fs.readFile(previewFile, "utf8"));
  } catch {
    return { players: [] };
  }
}

function applyRealPlayerPreview(players, previewPlayers) {
  const realById = new Map(previewPlayers.map((player) => [player.id, player]));

  return players.map((player) => {
    const realPlayer = realById.get(player.id);
    if (!realPlayer) return player;

    return {
      ...player,
      sourceUrl: realPlayer.sourceUrl,
      sourceTotalCombinedPoints: realPlayer.totalCombinedPoints,
      singles: realPlayer.singles.map((result) => ({
        event: result.event,
        round: result.grade,
        points: result.points,
        date: result.date,
        sourceCounting: result.sourceCounting
      })),
      doubles: realPlayer.doubles.map((result) => ({
        event: result.event,
        round: result.grade,
        points: result.points,
        date: result.date,
        sourceCounting: result.sourceCounting
      }))
    };
  });
}

const realPreview = await readRealPlayerPreview();
const players = applyRealPlayerPreview(context.payload.players, realPreview.players || []);

const payload = {
  ...context.payload,
  players,
  dataSource: {
    ...context.payload.dataSource,
    updatedAt: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    }).format(new Date())
  },
  generatedBy: "pipeline/build-latest.mjs",
  realPlayersApplied: realPreview.players?.map((player) => player.id) || []
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Generated ${path.relative(rootDir, outputFile)} with ${payload.players.length} players.`);
