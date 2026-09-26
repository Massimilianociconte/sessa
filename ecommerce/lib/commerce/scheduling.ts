import { formatRomeDateTimeLocal, parseRomeDateTimeLocal, romeDateKey } from "@/lib/datetime";

/**
 * Fasce di ritiro/consegna per sede. Tutto il calcolo avviene sulla
 * wall-clock di Europe/Rome (le lambda girano in UTC) e rispetta orari
 * settimanali, chiusure straordinarie, tempo di preparazione e anticipo massimo.
 */

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type TimeRange = [string, string];
export type WeeklyHours = Record<DayKey, TimeRange[]>;

export const DAY_LABELS_IT: Record<DayKey, string> = {
  mon: "Lunedì",
  tue: "Martedì",
  wed: "Mercoledì",
  thu: "Giovedì",
  fri: "Venerdì",
  sat: "Sabato",
  sun: "Domenica"
};

/** Orario prudente quando la sede non ha ancora un orario strutturato. */
export const FALLBACK_WEEKLY_HOURS: WeeklyHours = {
  mon: [["09:00", "19:00"]],
  tue: [["09:00", "19:00"]],
  wed: [["09:00", "19:00"]],
  thu: [["09:00", "19:00"]],
  fri: [["09:00", "19:00"]],
  sat: [["09:00", "19:00"]],
  sun: [["09:00", "13:00"]]
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function timeToMinutes(value: string): number | null {
  if (!TIME.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Parsing difensivo: qualunque valore non valido rende l'orario "non configurato". */
export function parseWeeklyHours(raw: string | null | undefined): WeeklyHours | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const result = {} as WeeklyHours;
  for (const day of DAY_KEYS) {
    const ranges = (parsed as Record<string, unknown>)[day] ?? [];
    if (!Array.isArray(ranges)) return null;
    const clean: TimeRange[] = [];
    for (const range of ranges) {
      if (!Array.isArray(range) || range.length !== 2) return null;
      const [open, close] = range;
      if (typeof open !== "string" || typeof close !== "string") return null;
      const start = timeToMinutes(open);
      const end = timeToMinutes(close);
      if (start === null || end === null || start >= end) return null;
      clean.push([open, close]);
    }
    clean.sort((a, b) => (timeToMinutes(a[0]) ?? 0) - (timeToMinutes(b[0]) ?? 0));
    result[day] = clean;
  }
  return result;
}

export function serializeWeeklyHours(hours: WeeklyHours): string {
  const ordered = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return JSON.stringify(Object.fromEntries(ordered.map((day) => [day, hours[day]])));
}

/** "06:30-13:00, 16:00-20:00" ↔ intervalli: formato usato dal gestionale. */
export function parseRangesText(text: string): TimeRange[] | null {
  const trimmed = text.trim();
  if (trimmed === "" || /^chius[oa]$/i.test(trimmed)) return [];
  const ranges: TimeRange[] = [];
  for (const part of trimmed.split(",")) {
    const match = part.trim().match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
    if (!match) return null;
    const start = timeToMinutes(match[1]);
    const end = timeToMinutes(match[2]);
    if (start === null || end === null || start >= end) return null;
    ranges.push([match[1], match[2]]);
  }
  return ranges;
}

export function formatRangesText(ranges: TimeRange[]): string {
  return ranges.length === 0 ? "chiuso" : ranges.map(([open, close]) => `${open}-${close}`).join(", ");
}

export function parseClosedDates(csv: string | null | undefined): Set<string> {
  return new Set(
    (csv ?? "")
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter((value) => DATE_KEY.test(value))
  );
}

function dayKeyOf(dateKey: string): DayKey {
  const [year, month, day] = dateKey.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

// --- Festività nazionali italiane (per giorni lavorativi e bonifici) ---------

function easterSunday(year: number): { month: number; day: number } {
  // Algoritmo di Meeus/Jones/Butcher (calendario gregoriano).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

export function italianHolidays(year: number): Set<string> {
  const pad = (value: number) => String(value).padStart(2, "0");
  const easter = easterSunday(year);
  const easterKey = `${year}-${pad(easter.month)}-${pad(easter.day)}`;
  return new Set([
    `${year}-01-01`,
    `${year}-01-06`,
    easterKey,
    addDaysToKey(easterKey, 1), // Lunedì dell'Angelo
    `${year}-04-25`,
    `${year}-05-01`,
    `${year}-06-02`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-12-08`,
    `${year}-12-25`,
    `${year}-12-26`
  ]);
}

export function isBusinessDay(dateKey: string): boolean {
  const day = dayKeyOf(dateKey);
  if (day === "sat" || day === "sun") return false;
  return !italianHolidays(Number(dateKey.slice(0, 4))).has(dateKey);
}

/**
 * Aggiunge N giorni lavorativi bancari (esclusi weekend e festività nazionali)
 * mantenendo l'orario Europe/Rome: un bonifico ordinario del venerdì sera
 * scade il mercoledì, non la domenica.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const local = formatRomeDateTimeLocal(from);
  let dateKey = local.slice(0, 10);
  const time = local.slice(11);
  let remaining = days;
  while (remaining > 0) {
    dateKey = addDaysToKey(dateKey, 1);
    if (isBusinessDay(dateKey)) remaining -= 1;
  }
  return parseRomeDateTimeLocal(`${dateKey}T${time}`) ?? new Date(from.getTime() + days * 24 * 60 * 60_000);
}

/** Primo giorno (YYYY-MM-DD, Roma) distante almeno N giorni lavorativi da oggi. */
export function earliestDateAfterBusinessDays(now: Date, days: number): string {
  let cursor = romeDateKey(now);
  let counted = 0;
  while (counted < days) {
    cursor = addDaysToKey(cursor, 1);
    if (isBusinessDay(cursor)) counted += 1;
  }
  return cursor;
}

export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  let cursor = romeDateKey(from);
  const end = romeDateKey(to);
  while (cursor < end) {
    cursor = addDaysToKey(cursor, 1);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

// --- Fasce ------------------------------------------------------------------

export type ScheduleConfig = {
  hours: WeeklyHours;
  closedDates: Set<string>;
  leadTimeMinutes: number;
  slotMinutes: number;
  maxAdvanceDays: number;
};

export type LocationScheduleFields = {
  openingHours: string | null;
  closedDates: string;
  leadTimeMinutes: number;
  slotMinutes: number;
  maxAdvanceDays: number;
};

export function scheduleConfigFor(location: LocationScheduleFields): ScheduleConfig & { configured: boolean } {
  const parsed = parseWeeklyHours(location.openingHours);
  return {
    hours: parsed ?? FALLBACK_WEEKLY_HOURS,
    configured: parsed !== null,
    closedDates: parseClosedDates(location.closedDates),
    leadTimeMinutes: Math.max(0, location.leadTimeMinutes),
    slotMinutes: Math.min(240, Math.max(5, location.slotMinutes)),
    maxAdvanceDays: Math.min(366, Math.max(1, location.maxAdvanceDays))
  };
}

export type Slot = { key: string; start: Date; end: Date; label: string };

function slotsOnDay(dateKey: string, config: ScheduleConfig, earliest: Date): Slot[] {
  if (config.closedDates.has(dateKey)) return [];
  const slots: Slot[] = [];
  for (const [open, close] of config.hours[dayKeyOf(dateKey)]) {
    const startMinutes = timeToMinutes(open) ?? 0;
    const endMinutes = timeToMinutes(close) ?? 0;
    for (let minute = startMinutes; minute + config.slotMinutes <= endMinutes; minute += config.slotMinutes) {
      const startTime = minutesToTime(minute);
      const endTime = minutesToTime(minute + config.slotMinutes);
      const start = parseRomeDateTimeLocal(`${dateKey}T${startTime}`);
      // Fascia che termina a mezzanotte: fine = 00:00 del giorno dopo.
      const end = endTime === "24:00"
        ? parseRomeDateTimeLocal(`${addDaysToKey(dateKey, 1)}T00:00`)
        : parseRomeDateTimeLocal(`${dateKey}T${endTime}`);
      // Orari inesistenti nel cambio d'ora legale vengono saltati.
      if (!start || !end || start < earliest) continue;
      slots.push({ key: `${dateKey}T${startTime}`, start, end, label: `${startTime}–${endTime === "24:00" ? "24:00" : endTime}` });
    }
  }
  return slots;
}

export type SlotDay = { dateKey: string; label: string; slots: Slot[] };

/** Giorni con almeno una fascia disponibile, dal primo utile all'anticipo massimo. */
export function upcomingSlotDays(
  config: ScheduleConfig,
  now: Date,
  extraLeadMinutes = 0,
  maxDays = config.maxAdvanceDays
): SlotDay[] {
  const earliest = new Date(now.getTime() + (config.leadTimeMinutes + extraLeadMinutes) * 60_000);
  const today = romeDateKey(now);
  const days: SlotDay[] = [];
  const horizon = Math.min(maxDays, config.maxAdvanceDays);
  for (let offset = 0; offset <= horizon; offset += 1) {
    const dateKey = addDaysToKey(today, offset);
    const slots = slotsOnDay(dateKey, config, earliest);
    if (slots.length === 0) continue;
    const [year, month, day] = dateKey.split("-").map(Number);
    days.push({
      dateKey,
      label: `${DAY_LABELS_IT[dayKeyOf(dateKey)]} ${day}/${String(month).padStart(2, "0")}${year !== Number(today.slice(0, 4)) ? `/${year}` : ""}`,
      slots
    });
  }
  return days;
}

export type SlotValidation = { ok: true; slot: Slot } | { ok: false; reason: string };

export function validateSlotKey(
  slotKey: string,
  config: ScheduleConfig,
  now: Date,
  extraLeadMinutes = 0
): SlotValidation {
  const match = slotKey.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) return { ok: false, reason: "Scegli una fascia oraria valida." };
  const [, dateKey] = match;
  const today = romeDateKey(now);
  if (dateKey > addDaysToKey(today, config.maxAdvanceDays)) {
    return { ok: false, reason: `Puoi ordinare al massimo con ${config.maxAdvanceDays} giorni di anticipo.` };
  }
  if (config.closedDates.has(dateKey)) return { ok: false, reason: "La sede è chiusa nel giorno scelto." };
  const earliest = new Date(now.getTime() + (config.leadTimeMinutes + extraLeadMinutes) * 60_000);
  const slot = slotsOnDay(dateKey, config, earliest).find((candidate) => candidate.key === slotKey);
  if (!slot) {
    return {
      ok: false,
      reason: "La fascia scelta non è più disponibile (orari della sede o tempi di preparazione). Scegline un'altra."
    };
  }
  return { ok: true, slot };
}

/** Chiave della fascia che contiene un istante (per contare la capienza). */
export function slotKeyContaining(date: Date, config: ScheduleConfig): string | null {
  const local = formatRomeDateTimeLocal(date);
  const dateKey = local.slice(0, 10);
  const minute = timeToMinutes(local.slice(11)) ?? 0;
  for (const [open, close] of config.hours[dayKeyOf(dateKey)]) {
    const start = timeToMinutes(open) ?? 0;
    const end = timeToMinutes(close) ?? 0;
    if (minute < start || minute >= end) continue;
    const slotStart = start + Math.floor((minute - start) / config.slotMinutes) * config.slotMinutes;
    return `${dateKey}T${minutesToTime(slotStart)}`;
  }
  return null;
}

export function describeWeeklyHours(hours: WeeklyHours): Array<{ day: string; text: string }> {
  const ordered = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  return ordered.map((day) => ({ day: DAY_LABELS_IT[day], text: formatRangesText(hours[day]) }));
}
