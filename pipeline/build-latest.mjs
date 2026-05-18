import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(rootDir, "data.js");
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

const payload = {
  ...context.payload,
  dataSource: {
    ...context.payload.dataSource,
    updatedAt: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    }).format(new Date())
  },
  generatedBy: "pipeline/build-latest.mjs"
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`Generated ${path.relative(rootDir, outputFile)} with ${payload.players.length} players.`);
