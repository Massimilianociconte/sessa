// Next copia in .next/standalone i file .env letti durante la build
// (writeStandaloneDirectory → loadedEnvFiles). Il plugin Netlify impacchetta
// poi quella cartella nella lambda: segreti locali finirebbero nel deploy.
// In produzione le variabili arrivano dall'ambiente Netlify, i file non servono.
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = [".next/standalone"];
const removed = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (name === "node_modules") continue;
    const info = statSync(full);
    if (info.isDirectory()) walk(full);
    else if (/^\.env(\..*)?$/.test(name) && name !== ".env.example") {
      rmSync(full, { force: true });
      removed.push(full);
    }
  }
}

for (const root of roots) walk(root);
console.log(
  removed.length
    ? `[strip-standalone-env] rimossi ${removed.length} file env dal bundle: ${removed.join(", ")}`
    : "[strip-standalone-env] nessun file env nel bundle."
);
