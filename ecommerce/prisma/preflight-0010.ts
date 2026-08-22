import { PrismaClient } from "@prisma/client";

/**
 * Preflight READ-ONLY per il deploy migrazioni (fino a 0010). Non scrive nulla.
 * Tabelle mancanti (es. 0009 mai applicato) sono gestite, non un errore.
 */
const prisma = new PrismaClient();

async function scalar(sql: string): Promise<number> {
  const rows = (await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(sql)) as Array<{
    n: bigint | number;
  }>;
  return Number(rows[0]?.n ?? 0);
}

async function tableExists(name: string): Promise<boolean> {
  return (
    (await scalar(
      `SELECT COUNT(*)::bigint AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = '${name}'`
    )) > 0
  );
}

async function columnExists(table: string, column: string): Promise<boolean> {
  return (
    (await scalar(
      `SELECT COUNT(*)::bigint AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = '${table}' AND column_name = '${column}'`
    )) > 0
  );
}

/** Conta righe solo se tabella (e colonne richieste) esistono: altrimenti null. */
async function guardedCount(name: string, where: string, requiredColumns: string[] = []): Promise<number | null> {
  if (!(await tableExists(name))) return null;
  for (const column of requiredColumns) {
    if (!(await columnExists(name, column))) return null;
  }
  return scalar(`SELECT COUNT(*)::bigint AS n FROM "${name}" WHERE ${where}`);
}

async function main() {
  const state = {
    orders: await guardedCount("Order", "TRUE"),
    customers: await guardedCount("Customer", "TRUE"),
    carts: await guardedCount("Cart", "TRUE"),
    checkoutNonces: await guardedCount("CheckoutNonce", "TRUE"),
    returnRequests: await guardedCount("ReturnRequest", "TRUE")
  };

  // Bonifiche eseguite da 0010 con RAISE EXCEPTION se > 0.
  const orphanCartCustomers = await guardedCount(
    "Cart",
    `"customerId" IS NOT NULL AND "customerId" NOT IN (SELECT "id" FROM "Customer")`,
    ["customerId"]
  );
  const orphanNonceOrders = await guardedCount(
    "CheckoutNonce",
    `"orderId" IS NOT NULL AND "orderId" NOT IN (SELECT "id" FROM "Order")`
  );
  const orphanReturnOrders =
    (await tableExists("ReturnRequest")) && (await tableExists("Order"))
      ? await guardedCount("ReturnRequest", `"orderId" NOT IN (SELECT "id" FROM "Order")`)
      : null;
  const orphanReturnCustomers =
    (await tableExists("ReturnRequest")) && (await tableExists("Customer"))
      ? await guardedCount(
          "ReturnRequest",
          `"customerId" IS NOT NULL AND "customerId" NOT IN (SELECT "id" FROM "Customer")`,
          ["customerId"]
        )
      : null;
  const outOfRangeRefunds = await guardedCount(
    "Order",
    `"refundedCents" < 0 OR "refundedCents" > "totalCents"`,
    ["refundedCents", "totalCents"]
  );
  const duplicateActiveReturns = await tableExists("ReturnRequest")
    ? await scalar(
        `SELECT COUNT(*)::bigint AS n FROM (
           SELECT "orderId" FROM "ReturnRequest"
           WHERE "status" IN ('REQUESTED','APPROVED')
           GROUP BY "orderId" HAVING COUNT(*) > 1
         ) d`
      )
    : null;

  console.log("=== PREFLIGHT MIGRAZIONI (read-only) ===");
  console.log("Stato volumi:", state);
  console.log("Bonifiche 0010:", {
    orphanCartCustomers,
    orphanNonceOrders,
    orphanReturnOrders,
    orphanReturnCustomers,
    outOfRangeRefunds,
    duplicateActiveReturns
  });

  const blockers: string[] = [];
  for (const [k, v] of Object.entries({
    orphanCartCustomers,
    orphanNonceOrders,
    orphanReturnOrders,
    orphanReturnCustomers,
    outOfRangeRefunds,
    duplicateActiveReturns
  })) {
    if (typeof v === "number" && v > 0) blockers.push(`${k}: ${v}`);
  }
  if (blockers.length > 0) {
    console.error("\nBLOCCI (la migrazione fallirebbe):");
    for (const b of blockers) console.error(" -", b);
    process.exitCode = 1;
  } else {
    console.log("\nNessun blocco: deploy applicabile.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
