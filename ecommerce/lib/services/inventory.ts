import { prisma } from "@/lib/db";
import { DomainError, type StockReason } from "@/lib/domain";
import { audit } from "@/lib/audit";

/**
 * Magazzino per sede: ogni variazione passa da qui (update atomico con guardia
 * anti-negativo + riga nel ledger StockMovement sullo StoreVariant).
 */
export async function adjustStock(
  storeVariantId: string,
  delta: number,
  reason: StockReason,
  actorEmail: string,
  note?: string
): Promise<void> {
  if (delta === 0) return;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.storeVariant.updateMany({
      where: {
        id: storeVariantId,
        ...(delta < 0 ? { stockQty: { gte: -delta } } : {})
      },
      data: { stockQty: { increment: delta } }
    });
    if (updated.count === 0) {
      throw new DomainError("Rettifica rifiutata: lo stock non può andare sotto zero.");
    }
    await tx.stockMovement.create({
      data: { storeVariantId, delta, reason, note, actor: actorEmail }
    });
  });
  await audit(actorEmail, "inventory.adjust", "StoreVariant", storeVariantId, { delta, reason, note });
}

export type InventoryFilter = {
  locationId?: string;
  query?: string; // nome prodotto, nome variante o SKU
  lowOnly?: boolean; // solo varianti sotto soglia
};

export async function listInventory(filter?: InventoryFilter | string) {
  // Retro-compatibile: accetta il vecchio parametro posizionale locationId.
  const f: InventoryFilter = typeof filter === "string" ? { locationId: filter } : (filter ?? {});
  const rows = await prisma.storeVariant.findMany({
    where: {
      ...(f.locationId ? { locationId: f.locationId } : {}),
      ...(f.query
        ? {
            variant: {
              OR: [
                { name: { contains: f.query, mode: "insensitive" } },
                { sku: { contains: f.query, mode: "insensitive" } },
                { product: { name: { contains: f.query, mode: "insensitive" } } }
              ]
            }
          }
        : {})
    },
    include: {
      location: { select: { name: true, slug: true } },
      variant: { include: { product: { select: { name: true, slug: true, status: true } } } }
    },
    orderBy: [{ location: { position: "asc" } }, { variant: { product: { position: "asc" } } }, { position: "asc" }]
  });
  // SQLite/Prisma non confrontano due colonne in where: filtro applicativo.
  return f.lowOnly ? rows.filter((sv) => sv.stockQty <= sv.lowStockThreshold) : rows;
}

export async function listRecentMovements(take = 50, locationId?: string) {
  return prisma.stockMovement.findMany({
    where: locationId ? { storeVariant: { locationId } } : undefined,
    include: {
      storeVariant: {
        include: {
          location: { select: { name: true } },
          variant: { include: { product: { select: { name: true } } } }
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take
  });
}

export async function lowStockVariants(locationId?: string) {
  // SQLite/Prisma non confrontano due colonne in where: filtro applicativo.
  const variants = await prisma.storeVariant.findMany({
    where: {
      isAvailable: true,
      variant: { isActive: true, product: { status: "ACTIVE" } },
      ...(locationId ? { locationId } : {})
    },
    include: {
      location: { select: { name: true } },
      variant: { include: { product: { select: { name: true } } } }
    }
  });
  return variants.filter((v) => v.stockQty <= v.lowStockThreshold);
}
