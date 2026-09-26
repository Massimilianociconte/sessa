import type { Location, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import {
  scheduleConfigFor,
  slotKeyContaining,
  upcomingSlotDays,
  validateSlotKey,
  type Slot
} from "@/lib/commerce/scheduling";

type ScheduleLocation = Pick<
  Location,
  "id" | "openingHours" | "closedDates" | "leadTimeMinutes" | "slotMinutes" | "slotCapacity" | "maxAdvanceDays"
>;

/** Stati che occupano una fascia: gli ordini annullati/rimborsati la liberano. */
const OCCUPYING_STATUSES_EXCLUDED = ["CANCELLED", "REFUNDED"];

/** Minuti di preparazione aggiuntivi richiesti dai prodotti nel carrello (torte su ordinazione…). */
export function productLeadMinutes(products: Array<{ leadTimeHours: number }>): number {
  return products.reduce((max, product) => Math.max(max, product.leadTimeHours * 60), 0);
}

export type SlotOption = { key: string; label: string; startMs: number; full: boolean };
export type SlotDayOption = { dateKey: string; label: string; slots: SlotOption[] };

export async function getSlotOptions(
  location: ScheduleLocation,
  extraLeadMinutes: number,
  now = new Date(),
  db: Pick<Prisma.TransactionClient, "order"> = prisma
): Promise<{ configured: boolean; days: SlotDayOption[] }> {
  const config = scheduleConfigFor(location);
  const days = upcomingSlotDays(config, now, extraLeadMinutes);
  const occupied = new Map<string, number>();
  if (location.slotCapacity > 0 && days.length > 0) {
    const from = days[0].slots[0].start;
    const lastDay = days[days.length - 1];
    const to = lastDay.slots[lastDay.slots.length - 1].end;
    const orders = await db.order.findMany({
      where: {
        locationId: location.id,
        status: { notIn: OCCUPYING_STATUSES_EXCLUDED },
        fulfillmentAt: { gte: from, lt: to }
      },
      select: { fulfillmentAt: true }
    });
    for (const order of orders) {
      if (!order.fulfillmentAt) continue;
      const key = slotKeyContaining(order.fulfillmentAt, config);
      if (key) occupied.set(key, (occupied.get(key) ?? 0) + 1);
    }
  }
  return {
    configured: config.configured,
    days: days.map((day) => ({
      dateKey: day.dateKey,
      label: day.label,
      slots: day.slots.map((slot) => ({
        key: slot.key,
        label: slot.label,
        startMs: slot.start.getTime(),
        full: location.slotCapacity > 0 && (occupied.get(slot.key) ?? 0) >= location.slotCapacity
      }))
    }))
  };
}

/**
 * Validazione autoritativa dentro la transazione SERIALIZABLE di checkout:
 * orari, chiusure, preparazione e capienza. Il conteggio nella stessa
 * transazione rende la capienza sicura anche con checkout concorrenti.
 */
export async function reserveSlotInTx(
  tx: Prisma.TransactionClient,
  location: ScheduleLocation,
  slotKey: string,
  extraLeadMinutes: number,
  now = new Date()
): Promise<Slot> {
  const config = scheduleConfigFor(location);
  const validation = validateSlotKey(slotKey, config, now, extraLeadMinutes);
  if (!validation.ok) throw new DomainError(validation.reason, "SLOT_UNAVAILABLE");
  if (location.slotCapacity > 0) {
    const taken = await tx.order.count({
      where: {
        locationId: location.id,
        status: { notIn: OCCUPYING_STATUSES_EXCLUDED },
        fulfillmentAt: { gte: validation.slot.start, lt: validation.slot.end }
      }
    });
    if (taken >= location.slotCapacity) {
      throw new DomainError("La fascia scelta è appena stata completata. Scegline un'altra.", "SLOT_FULL");
    }
  }
  return validation.slot;
}
