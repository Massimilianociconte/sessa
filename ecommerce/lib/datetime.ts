export const ROME_TIME_ZONE = "Europe/Rome";
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const romePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ROME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const romeDateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: ROME_TIME_ZONE,
  dateStyle: "short"
});

const romeDateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: ROME_TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short"
});

/** Formattazione deterministica: le lambda Netlify girano in UTC, il negozio in Europe/Rome. */
export function formatRomeDate(date: Date): string {
  return romeDateFormatter.format(date);
}

export function formatRomeDateTime(date: Date): string {
  return romeDateTimeFormatter.format(date);
}

function partsAt(date: Date): Record<string, number> {
  return Object.fromEntries(
    romePartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

/** Converte una wall-clock Europe/Rome in UTC, rifiutando date/DST inesistenti. */
export function parseRomeDateTimeLocal(value: string): Date | null {
  const match = value.match(LOCAL_DATE_TIME);
  if (!match) return null;
  const [, ys, ms, ds, hs, mins] = match;
  const year = Number(ys);
  const month = Number(ms);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mins);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const atGuess = partsAt(new Date(wallAsUtc));
  const offsetAtGuess = Date.UTC(
    atGuess.year,
    atGuess.month - 1,
    atGuess.day,
    atGuess.hour,
    atGuess.minute
  ) - wallAsUtc;
  let result = new Date(wallAsUtc - offsetAtGuess);

  // Sul cambio DST l'offset al guess puo differire da quello del risultato.
  const atResult = partsAt(result);
  const resultWall = Date.UTC(
    atResult.year,
    atResult.month - 1,
    atResult.day,
    atResult.hour,
    atResult.minute
  );
  if (resultWall !== wallAsUtc) {
    result = new Date(result.getTime() - (resultWall - wallAsUtc));
  }
  const verified = partsAt(result);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) return null;
  return result;
}

export function romeDayRange(value: string): { start: Date; end: Date } | null {
  const match = value.match(LOCAL_DATE);
  if (!match) return null;
  const [, ys, ms, ds] = match;
  const start = parseRomeDateTimeLocal(`${ys}-${ms}-${ds}T00:00`);
  if (!start) return null;
  const nextCalendar = new Date(Date.UTC(Number(ys), Number(ms) - 1, Number(ds) + 1));
  const nextKey = `${nextCalendar.getUTCFullYear()}-${String(nextCalendar.getUTCMonth() + 1).padStart(2, "0")}-${String(nextCalendar.getUTCDate()).padStart(2, "0")}`;
  const end = parseRomeDateTimeLocal(`${nextKey}T00:00`);
  return end ? { start, end } : null;
}

export function romeDateKey(date: Date): string {
  const p = partsAt(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Valore `datetime-local` nella wall-clock di Roma, indipendente dal TZ del runtime. */
export function formatRomeDateTimeLocal(date: Date): string {
  const p = partsAt(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * Limiti della fascia oraria di ritiro/consegna richiesti dal checkout:
 * minimo 1 ora da ora, default suggerito a 2 ore. La fonte del tempo vive qui
 * (helper di dominio), non nel body del Server Component.
 */
export function checkoutScheduleBounds(now = new Date()): { minWhen: string; defaultWhen: string } {
  return {
    minWhen: formatRomeDateTimeLocal(new Date(now.getTime() + 60 * 60_000)),
    defaultWhen: formatRomeDateTimeLocal(new Date(now.getTime() + 2 * 60 * 60_000))
  };
}
