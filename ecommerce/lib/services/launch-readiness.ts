import { prisma } from "@/lib/db";
import { isStripeConfigured } from "@/lib/payments/stripe";
import { parseWeeklyHours } from "@/lib/commerce/scheduling";
import { getLegalInfo, getOpsRecipients, LEGAL_KEY_LABELS } from "@/lib/services/commerce-settings";
import { countStaleEncryptedValues } from "@/lib/services/secret-rotation";
import { getPreviousAuthSecret } from "@/lib/auth/secret";
import { SITE_URL } from "@/lib/site";

export type ReadinessLevel = "ok" | "warning" | "blocker";
export type ReadinessItem = { id: string; level: ReadinessLevel; title: string; detail: string; href?: string };

/** Codici creati dal seed demo: non devono essere attivi in produzione. */
const DEMO_DISCOUNT_CODES = ["BENVENUTO10", "CINQUEEURO", "BABAMERLATA15", "BOXREGALO20"];

/**
 * Il checkout di produzione resta chiuso finché mancano i dati aziendali
 * obbligatori (vendere senza ragione sociale, P.IVA e informative rende i
 * contratti contestabili). Override d'emergenza consapevole via env.
 */
export async function checkoutBlockedReason(): Promise<string | null> {
  if (process.env.NODE_ENV !== "production" || process.env.SESSA_ALLOW_INCOMPLETE_LEGAL === "1") return null;
  const legal = await getLegalInfo();
  return legal.complete
    ? null
    : "Lo shop online sta completando la configurazione e riapre a breve. Per ordinare ora contatta la sede.";
}

export async function getLaunchReadiness(): Promise<ReadinessItem[]> {
  const items: ReadinessItem[] = [];
  const push = (item: ReadinessItem) => items.push(item);

  const [legal, recipients, admins, locations, activeProducts, demoCodes, localRates, nationalProducts] = await Promise.all([
    getLegalInfo(),
    getOpsRecipients(),
    prisma.adminUser.findMany({ where: { isActive: true }, select: { email: true, role: true, totpEnabledAt: true } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: { position: "asc" } }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, allergens: true, ingredients: true, storageInfo: true } }),
    prisma.discountCode.findMany({ where: { code: { in: DEMO_DISCOUNT_CODES }, isActive: true }, select: { code: true } }),
    prisma.shippingRate.count({ where: { scope: "LOCAL", isActive: true } }),
    prisma.product.count({ where: { status: "ACTIVE", shippingScope: "NATIONAL" } })
  ]);

  push(
    legal.complete
      ? { id: "legal", level: "ok", title: "Dati aziendali e informative", detail: "Completi: condizioni, privacy e note legali pubblicate." }
      : {
          id: "legal",
          level: "blocker",
          title: "Dati aziendali mancanti",
          detail: `Mancano: ${legal.missing.map((key) => LEGAL_KEY_LABELS[key]).join(", ")}. Il checkout di produzione resta chiuso finché non sono completi.`,
          href: "/admin/impostazioni"
        }
  );

  const withoutTwoFactor = admins.filter((admin) => !admin.totpEnabledAt);
  push(
    withoutTwoFactor.length === 0
      ? { id: "admin-2fa", level: "ok", title: "Verifica in due passaggi", detail: `Attiva per tutti i ${admins.length} utenti del gestionale.` }
      : { id: "admin-2fa", level: "warning", title: "Utenti senza 2FA", detail: withoutTwoFactor.map((admin) => admin.email).join(", "), href: "/admin/sicurezza" }
  );

  push(
    process.env.SMTP_HOST
      ? { id: "smtp", level: "ok", title: "Invio email", detail: `SMTP configurato (${process.env.SMTP_HOST}).` }
      : {
          id: "smtp",
          level: "blocker",
          title: "Email non configurate",
          detail: "Senza SMTP non partono conferme d'ordine, attivazioni account e reset password: la registrazione è impossibile."
        }
  );

  push(
    isStripeConfigured()
      ? {
          id: "stripe",
          level: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "ok" : "warning",
          title: "Pagamenti con carta",
          detail: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "Stripe in modalità live con webhook firmato." : "Stripe in modalità test: nessun incasso reale."
        }
      : { id: "stripe", level: "warning", title: "Pagamenti con carta disattivi", detail: "Configura STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET per accettare carte e wallet." }
  );

  let dbPort = "";
  try {
    dbPort = new URL(process.env.DATABASE_URL ?? "").port;
  } catch {
    dbPort = "";
  }
  const pooledHost = (process.env.DATABASE_URL ?? "").includes("pooler.supabase.com");
  push(
    !pooledHost || dbPort === "6543"
      ? {
          id: "db-pool",
          level: "ok",
          title: "Connessione database",
          detail: pooledHost ? "Runtime sul transaction pooler (6543)." : "Database non Supabase pooler: nessun limite di sessioni rilevato."
        }
      : { id: "db-pool", level: "blocker", title: "Database sul session pooler", detail: "Porta 5432: massimo ~15 istanze contemporanee. Usa il transaction pooler 6543 con pgbouncer=true." }
  );

  push(
    /^https:\/\//.test(SITE_URL) && !SITE_URL.includes("netlify.app")
      ? { id: "domain", level: "ok", title: "Dominio", detail: SITE_URL }
      : { id: "domain", level: "warning", title: "Dominio provvisorio", detail: `${SITE_URL}: attiva il dominio definitivo prima del lancio (SEO, passkey, email).` }
  );

  const unconfiguredHours = locations.filter((location) => !parseWeeklyHours(location.openingHours));
  push(
    unconfiguredHours.length === 0
      ? { id: "hours", level: "ok", title: "Orari delle sedi", detail: "Orari strutturati configurati per tutte le sedi attive." }
      : { id: "hours", level: "blocker", title: "Orari sedi da configurare", detail: `Fasce provvisorie 9-19 per: ${unconfiguredHours.map((l) => l.name).join(", ")}.`, href: "/admin/sedi" }
  );

  const withoutNotification = locations.filter((location) => !location.notificationEmail);
  push(
    withoutNotification.length === 0 || recipients.orders
      ? { id: "notifications", level: withoutNotification.length === 0 ? "ok" : "warning", title: "Avvisi nuovi ordini", detail: withoutNotification.length === 0 ? "Ogni sede riceve i propri ordini via email." : `Sedi senza email dedicata (ricevono su ${recipients.orders}): ${withoutNotification.map((l) => l.name).join(", ")}.` }
      : { id: "notifications", level: "blocker", title: "Nessuno riceve i nuovi ordini", detail: "Imposta un'email per sede o l'email avvisi generale.", href: "/admin/sedi" }
  );

  const deliveryLocations = locations.filter((location) => location.deliveryEnabled);
  const deliveryWithoutOptions = deliveryLocations.filter((location) => !location.localDeliveryPostalCodes.trim());
  if (deliveryLocations.length > 0) {
    push(
      localRates > 0 && deliveryWithoutOptions.length === 0
        ? { id: "delivery", level: "ok", title: "Consegna del fresco", detail: "Tariffe locali e CAP serviti configurati." }
        : {
            id: "delivery",
            level: "warning",
            title: "Consegna del fresco incompleta",
            detail: `${localRates === 0 ? "Nessuna tariffa locale attiva. " : ""}${deliveryWithoutOptions.length ? `Senza CAP serviti: ${deliveryWithoutOptions.map((l) => l.name).join(", ")}. ` : ""}Prodotti spedibili con corriere: ${nationalProducts}.`,
            href: "/admin/sedi"
          }
    );
  }

  const incompleteProducts = activeProducts.filter((product) => !product.allergens.trim() || !product.ingredients.trim() || !product.storageInfo.trim());
  push(
    incompleteProducts.length === 0
      ? { id: "food-info", level: "ok", title: "Informazioni alimentari", detail: "Ingredienti, allergeni e conservazione presenti per tutti i prodotti pubblicati." }
      : { id: "food-info", level: "blocker", title: "Informazioni alimentari incomplete", detail: `Da completare (Reg. UE 1169/2011): ${incompleteProducts.map((p) => p.name).join(", ")}.`, href: "/admin/prodotti" }
  );

  push(
    demoCodes.length === 0
      ? { id: "demo-codes", level: "ok", title: "Codici sconto demo", detail: "Nessun codice demo attivo." }
      : { id: "demo-codes", level: "blocker", title: "Codici sconto demo attivi", detail: `Disattiva: ${demoCodes.map((code) => code.code).join(", ")} (nomi pubblici nel repository, uso illimitato).`, href: "/admin/sconti" }
  );

  push(
    admins.length > 0 && process.env.ADMIN_SETUP_TOKEN
      ? { id: "setup-token", level: "warning", title: "Token di setup ancora impostato", detail: "Il proprietario esiste: rimuovi ADMIN_SETUP_TOKEN dalle variabili d'ambiente." }
      : { id: "setup-token", level: "ok", title: "Configurazione iniziale", detail: "Nessun token di setup residuo." }
  );

  const staleEncrypted = getPreviousAuthSecret() ? await countStaleEncryptedValues() : 0;
  push(
    getPreviousAuthSecret()
      ? {
          id: "secret-rotation",
          level: "warning",
          title: "Rotazione segreto in corso",
          detail:
            staleEncrypted > 0
              ? `${staleEncrypted} valori cifrati ancora con il segreto precedente: il job orario li sta aggiornando.`
              : "Ricifratura completata. Dopo 7 giorni dalla rotazione rimuovi SESSION_SECRET_PREVIOUS e ridistribuisci."
        }
      : { id: "secret-rotation", level: "ok", title: "Segreti", detail: "Nessuna rotazione in corso." }
  );

  push({
    id: "backup",
    level: "warning",
    title: "Backup e restore (verifica manuale)",
    detail: "Conferma backup giornalieri + PITR su Supabase e un test di restore su database isolato almeno una volta al trimestre."
  });

  return items;
}
