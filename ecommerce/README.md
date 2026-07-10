# Sessa 1930 — E-commerce + Gestionale

Applicazione **standalone** (non tocca il sito vetrina nella cartella padre). Contiene
lo **storefront** (negozio online) e il **gestionale** `/admin`, una **PWA** installabile.

Stack: **Next.js 16 (App Router, Server Actions)** · **Prisma + PostgreSQL** ·
**TypeScript strict** · **Tailwind** · **Zod** · pagamenti manuali e **Stripe Checkout**.

> Base tecnica solida e sicura. L'estetica è volutamente minimale e coerente col brand
> (colori/font ripresi dal sito): sarà rivista in una fase successiva.

---

## Avvio rapido

```bash
cd ecommerce
npm install
npm run db:bootstrap # solo su un database PostgreSQL nuovo e vuoto
npm run db:seed      # carica catalogo, sedi e impostazioni iniziali
npm run dev          # http://localhost:3001
```

Prima dell'avvio, copiare `.env.example` in `.env` e configurare un database di
sviluppo dedicato. `DATABASE_URL` è la connessione runtime al transaction pooler;
`DIRECT_URL` è la connessione diretta/session pooler riservata alle migrazioni.
Non puntare i comandi locali al database di produzione.

- Storefront: `http://localhost:3001`
- Gestionale: `http://localhost:3001/admin`
- Primo admin: usare `/admin/setup` con un `ADMIN_SETUP_TOKEN` forte oppure
  valorizzare `SEED_ADMIN_PASSWORD` prima del seed. Non usare credenziali fallback
  in produzione.

Verifica dei flussi critici (ordini, stock, transizioni):

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run test:security
npm run build
# Solo contro un database di test sacrificabile:
npx tsx prisma/verify-flow.ts
```

---

## Struttura

```
app/
  page.tsx                selezione sede
  sede/[slug]/            catalogo per sede e filtri
  sede/[slug]/prodotti/   pagina prodotto con selezione variante
  carrello/               carrello server-side + codice sconto
  checkout/               checkout (useActionState)
  ordine/[code]/          tracking pubblico (protetto da token)
  admin/
    login/                accesso gestionale
    (protected)/          dashboard, ordini, prodotti, categorie,
                          magazzino, sconti, clienti, impostazioni
lib/
  domain.ts               enum, label IT, macchina a stati ordini
  money.ts                aritmetica in centesimi (mai float)
  validation.ts           schemi Zod (unica dogana degli input)
  db.ts / audit.ts        Prisma singleton, audit log
  auth/                   scrypt, sessioni (token hashato a DB)
  services/               logica di dominio (catalogo, carrello,
                          checkout, ordini, magazzino, sconti, spedizioni)
  payments/               provider manuale + Stripe Checkout e rimborsi
  actions/                server actions (storefront + admin)
prisma/
  schema.prisma           modello dati
  migrations-postgres/    bootstrap + migrazioni additive PostgreSQL
  seed.ts                 catalogo reale Sessa
  verify-flow.ts          test d'integrazione di sicurezza
public/
  manifest.webmanifest, sw.js, offline.html, icons/   asset PWA
```

## Modello dati (sintesi)

`Location · Category · Product · ProductVariant · ProductImage · StoreVariant ·
StockMovement · Cart · CartItem · Customer · PasswordResetToken · CustomerSession ·
Address · Order · OrderCounter · OrderItem · OrderEvent · DiscountCode ·
DiscountRedemption · GiftCard · GiftCardTransaction · Referral · ShippingZone ·
ShippingRate · EmailMessage · AdminUser · AdminSession · AuditLog · Setting`

Principi:
- **Prezzi in centesimi** (`Int`), IVA inclusa (scorporo informativo su `Order.taxCents`).
- **Ordine = snapshot immutabile**: nome, SKU, prezzo, indirizzo e sconto congelati
  al momento dell'acquisto (righe storiche non cambiano se il catalogo cambia).
- **Magazzino a ledger**: ogni variazione di stock genera uno `StockMovement`.
  Nessuna modifica silenziosa di `stockQty`.
- **Sequenza ordini dedicata**: `OrderCounter` evita contatori JSON in `Setting`
  e genera codici ordine leggibili in modo robusto sotto checkout concorrenti.
- **Riferimenti pagamento univoci**: `Order.paymentRef` è unico; collisioni da
  retry/webhook vengono bloccate e annotate invece di creare riconciliazioni ambigue.

---

## Sicurezza — garanzie implementate

| Rischio | Difesa |
|---|---|
| **Doppio ordine** (doppio click / retry) | Idempotenza: il carrello si ricarica _dentro_ la transazione e si converte con update condizionale `status = ACTIVE`; la seconda richiesta trova `CONVERTED` e fallisce. |
| **Ordini a vuoto** | Guardia su carrello vuoto e subtotale ≤ 0 dentro la transazione. |
| **Oversell** (vendere più dello stock) | Scarico con update condizionale `stockQty >= qty`; se non tocca righe → rollback dell'intera transazione. |
| **Sconto usato oltre il limite** | Consumo atomico: `usedCount < maxUses` in update condizionale. Sconto e prezzi **rivalidati dal DB** al checkout, mai fidandosi del client. |
| **Prezzi manomessi dal client** | Il client non invia prezzi: totali ricalcolati server-side dalle varianti. |
| **Dati carta** | Nessun dato carta salvato: Stripe Checkout gestisce l'acquisizione; webhook firmato e tentativi idempotenti riconciliano l'ordine. |
| **Password admin** | Hash **scrypt** con sale per-utente; mai in chiaro. Al cambio password **tutte** le sessioni vengono invalidate (rotazione), resta attiva solo quella corrente. |
| **Brute-force login** | Throttle IP+email: dopo 8 tentativi falliti in 15 min, blocco di 15 min (non blocca l'admin legittimo da un altro IP). |
| **Sessioni** | Token 32 byte in cookie `httpOnly`+`sameSite=lax` (+`secure` in prod); nel DB solo l'**hash SHA-256**. Scadenza 7 giorni, pruning automatico. |
| **Accesso gestionale** | Tripla barriera: middleware edge, layout protetto (rivalida a DB), e `requireAdmin()` in **ogni** server action di scrittura. |
| **IVA corretta** | `taxCents` scorporata dall'importo **scontato** (non dal lordo pieno): niente IVA sovrastimata quando c'è un codice sconto. |
| **Pagine private fuori dall'indice** | `robots.txt` + `noindex` su carrello/checkout/ordine/admin; solo catalogo e prodotti indicizzabili. |
| **Tracking ordine pubblico** | Richiede `code` + `publicToken` (16 byte); il solo codice non basta. |
| **Tracciabilità** | `AuditLog` su ogni scrittura admin + `OrderEvent` sulla storia di ogni ordine. |
| **Integrità referenziale** | Prodotti/varianti/sconti presenti in ordini storici non eliminabili (si archiviano/disattivano). |

## Cache & sincronizzazione gestionale → storefront

- Home, cataloghi e pagine prodotto hanno una cache breve (`revalidate = 30`);
  le query di catalogo hanno lo stesso TTL.
- I filtri basati su query string possono essere renderizzati dinamicamente.
  Carrello, checkout, ordine, account, admin e API sono privati e `no-store`.
- Le azioni admin che cambiano il catalogo invalidano le route storefront coinvolte;
  il TTL limita comunque la propagazione massima a circa 30 secondi.
- Il seed è **idempotente** (upsert su slug/SKU/codice): rilanciabile senza duplicati.
- Il seed accetta `SEED_ADMIN_PASSWORD` e `SEED_CUSTOMER_PASSWORD`; in produzione
  fallisce se non sono configurate, evitando credenziali demo involontarie.

---

## SEO & PWA

- `app/robots.ts` → `/robots.txt` (indicizza catalogo, blocca aree private).
- `app/sitemap.ts` → `/sitemap.xml` dinamica con categorie e prodotti attivi.
- `metadataBase` + OpenGraph impostati; **JSON-LD `Product`** (prezzo/disponibilità)
  sulla pagina prodotto per i rich results.
- Gestionale installabile come **PWA** (manifest, service worker network-first, offline).
- Pagine di errore/404 brandizzate (`app/error.tsx`, `app/not-found.tsx`).

Configurare `NEXT_PUBLIC_SITE_URL` in `.env` con il dominio reale (usato da sitemap,
robots e metadati assoluti).

## Passare in produzione

1. Configurare `DATABASE_URL` sul transaction pooler e `DIRECT_URL` sulla
   connessione diretta/session pooler. Su un DB esistente usare `npm run db:deploy`;
   `db:bootstrap` è riservato a un database nuovo e vuoto.
2. Valorizzare `SESSION_SECRET`, `ADMIN_SETUP_TOKEN`, `NEXT_PUBLIC_SITE_URL` e le
   credenziali SMTP in Netlify.
3. Per Stripe, configurare `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e il webhook
   `/api/webhooks/stripe`; senza chiave resta disponibile il pagamento manuale.
4. Eseguire preview e smoke test con `npm run deploy:preview`. Pubblicare solo con
   il comando esplicito `npm run deploy:prod`.

Il runbook completo è in [`docs/DEPLOY_NETLIFY.md`](docs/DEPLOY_NETLIFY.md).
