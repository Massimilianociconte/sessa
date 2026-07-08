import { prisma } from "@/lib/db";
import { invalidateMemo, memoTtl } from "@/lib/ttl-cache";

// Le impostazioni cambiano di rado: memo breve per non ripagare il roundtrip DB
// a ogni request. setSetting invalida subito la cache dell'istanza che scrive.
const SETTINGS_TTL_MS = 30_000;

/**
 * Impostazioni chiave/valore con valori JSON tipizzati dal chiamante.
 * Letture FAULT-TOLERANT: se il database non è raggiungibile (build della 404,
 * hiccup transitorio) l'interfaccia degrada ai default invece di rompere la pagina.
 * Le scritture (setSetting) restano rigorose e propagano gli errori.
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  let row: { value: string } | null = null;
  try {
    row = await memoTtl(`setting:${key}`, SETTINGS_TTL_MS, () =>
      prisma.setting.findUnique({ where: { key } })
    );
  } catch {
    return fallback;
  }
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function getSettings(keys: string[]): Promise<Record<string, unknown>> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  } catch {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      // valore corrotto: lo si ignora, il chiamante usa il default
    }
  }
  return out;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  await prisma.setting.upsert({
    where: { key },
    update: { value: serialized },
    create: { key, value: serialized }
  });
  invalidateMemo(`setting:${key}`);
}

/** Salva più impostazioni in una sola transazione (1 round-trip invece di N). */
export async function setSettings(entries: Record<string, unknown>): Promise<void> {
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) => {
      const serialized = JSON.stringify(value);
      return prisma.setting.upsert({
        where: { key },
        update: { value: serialized },
        create: { key, value: serialized }
      });
    })
  );
  for (const key of Object.keys(entries)) invalidateMemo(`setting:${key}`);
}
