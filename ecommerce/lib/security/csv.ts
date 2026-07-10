/**
 * Neutralizza formule spreadsheet in celle controllabili dagli utenti e poi
 * applica l'escaping CSV standard.
 */
export function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
