// Deploy manuali solo da codice versionato: niente modifiche non committate in
// produzione, commit sempre tracciabile. Override consapevole: SESSA_ALLOW_DIRTY_DEPLOY=1.
import { execSync } from "node:child_process";

const run = (command) => execSync(command, { encoding: "utf8" }).trim();
const dirty = run("git status --porcelain -- .");
if (dirty && process.env.SESSA_ALLOW_DIRTY_DEPLOY !== "1") {
  console.error("[predeploy] Modifiche non committate nella cartella ecommerce:\n" + dirty);
  console.error("Committa (o usa SESSA_ALLOW_DIRTY_DEPLOY=1 consapevolmente) prima del deploy.");
  process.exit(1);
}
console.log(`[predeploy] commit ${run("git rev-parse --short HEAD")} su ${run("git rev-parse --abbrev-ref HEAD")}`);
