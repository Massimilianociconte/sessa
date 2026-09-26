// Fallisce se un artefatto di deploy contiene file .env o valori di segreti
// noti (ambiente corrente + file .env* locali, cioè proprio quelli che Next
// copiava nel bundle). Da eseguire tra `netlify build` e `netlify deploy`.
// I valori non vengono mai stampati.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = [".netlify/functions-internal", ".netlify/functions", ".next/standalone", ".next/static"];
const SECRET_KEYS = [
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "SESSION_SECRET",
  "SESSION_SECRET_PREVIOUS",
  "ADMIN_SETUP_TOKEN",
  "MAINTENANCE_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SMTP_PASS",
  "MERCHANT_FEED_TOKEN"
];
function envFileValues(file) {
  if (!existsSync(file)) return [];
  const values = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || !SECRET_KEYS.includes(match[1])) continue;
    values.push(match[2].trim().replace(/^(['"])(.*)\1$/, "$2"));
  }
  return values;
}

const candidates = [
  ...SECRET_KEYS.map((key) => process.env[key]),
  ...[".env", ".env.local", ".env.production", ".env.production.local"].flatMap(envFileValues)
];
const secrets = [...new Set(candidates.map((value) => value?.trim()).filter((value) => value && value.length >= 12))];
const problems = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (name !== "node_modules") walk(full);
      continue;
    }
    if (/^\.env(\..*)?$/.test(name) && name !== ".env.example") problems.push(`file env nel bundle: ${full}`);
    if (secrets.length === 0 || info.size > 20 * 1024 * 1024) continue;
    const content = readFileSync(full, "latin1");
    if (secrets.some((secret) => content.includes(secret))) problems.push(`segreto in chiaro in: ${full}`);
  }
}

for (const root of roots) walk(root);
if (problems.length) {
  console.error("[check-deploy-bundle] DEPLOY BLOCCATO:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`[check-deploy-bundle] ok (${secrets.length} segreti verificati, nessun file env).`);
