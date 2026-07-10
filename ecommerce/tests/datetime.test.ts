import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRomeDateTime,
  parseRomeDateTimeLocal,
  romeDayRange
} from "../lib/datetime";

test("datetime-local Europe/Rome viene salvato come istante UTC corretto", () => {
  assert.equal(
    parseRomeDateTimeLocal("2026-07-10T15:00")?.toISOString(),
    "2026-07-10T13:00:00.000Z"
  );
  assert.match(formatRomeDateTime(new Date("2026-07-10T13:00:00.000Z")), /15:00/);
});

test("rifiuta la wall-clock inesistente durante il cambio DST primaverile", () => {
  assert.equal(parseRomeDateTimeLocal("2026-03-29T02:30"), null);
});

test("gli intervalli giorno rispettano giornate DST da 23 e 25 ore", () => {
  const spring = romeDayRange("2026-03-29");
  const autumn = romeDayRange("2026-10-25");
  assert.ok(spring);
  assert.ok(autumn);
  assert.equal(spring.end.getTime() - spring.start.getTime(), 23 * 60 * 60_000);
  assert.equal(autumn.end.getTime() - autumn.start.getTime(), 25 * 60 * 60_000);
});
