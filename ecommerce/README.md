# Sessa 1930 — E-commerce + Gestionale

Applicazione **standalone** (non tocca il sito vetrina nella cartella padre). Contiene
lo **storefront** (negozio online) e il **gestionale** `/admin`, una **PWA** installabile.

Stack: **Next.js 16 (App Router, Server Actions)** · **Prisma + SQLite** (dev) ·
**TypeScript strict** · **Tailwind** · **Zod** · pagamenti con astrazione provider.

> Base tecnica solida e sicura. L'estetica è volutamente minimale e coerente col brand
> (colori/font ripresi dal sito): sarà rivista in una fase successiva.

---

## Avvio rapido

```bash
cd ecommerce
npm install
npm run db:push      # crea lo schema SQLite
npm run db:seed      # carica catalogo reale Sessa + admin + impostazioni
npm run dev          # http://localhost:3001
```

- Storefront: `http://localhost:3001`
- Gestionale: `http://localhost:3001/admin`
- Credenziali admin iniziali: **admin@sessa1930.com** / **sessa1930!admin**
  — cambiale subito da _Impostazioni → Cambia password_.

Verifica dei flussi critici (ordini, stock, transizioni):

```bash
npm run build              # type-check + build produzione
npx tsx prisma/verify-flow.ts   # 17 controlli di sicurezza end-to-end
```

---

## Struttura

```
app/
  page.tsx                catalogo (filtro per categoria)
  prodotti/[slug]/        pagina prodotto con selezione variante
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
  payments/               astrazione provider (manual attivo, stripe predisposto)
  actions/                server actions (storefront + admin)
prisma/
  schema.prisma           modello dati
  seed.ts                 catalogo reale Sessa
  verify-flow.ts          test d'integrazione di sicurezza
public/
  manifest.webmanifest, sw.js, offline.html, icons/   asset PWA
```

## Modello dati (sintesi)

`Category · Product · ProductVariant · ProductImage · StockMovement · Cart · CartItem ·
Customer · Address · Order · OrderItem · OrderEvent · DiscountCode · ShippingZone ·
ShippingRate · AdminUser · AdminSession · AuditLog · Setting`

Principi:
- **Prezzi in centesimi** (`Int`), IVA inclusa (scorporo informativo su `Order.taxCents`).
- **Ordine = snapshot immutabile**: nome, SKU, prezzo, indirizzo e sconto congelati
  al momento dell'acquisto (righe storiche non cambiano se il catalogo cambia).
- **Magazzino a ledger**: ogni variazione di stock genera uno `StockMovement`.
  Nessuna modifica silenziosa di `stockQty`.

---

## Sicurezza — garanzie implementate

| Rischio | Difesa |
|---|---|
| **Doppio ordine** (doppio click / retry) | Idempotenza: il carrello si ricarica _dentro_ la transazione e si converte con update condizionale `status = ACTIVE`; la seconda richiesta trova `CONVERTED` e fallisce. |
| **Ordini a vuoto** | Guardia su carrello vuoto e subtotale ≤ 0 dentro la transazione. |
| **Oversell** (vendere più dello stock) | Scarico con update condizionale `stockQty >= qty`; se non tocca righe → rollback dell'intera transazione. |
| **Sconto usato oltre il limite** | Consumo atomico: `usedCount < maxUses` in update condizionale. Sconto e prezzi **rivalidati dal DB** al checkout, mai fidandosi del client. |
| **Prezzi manomessi dal client** | Il client non invia prezzi: totali ricalcolati server-side dalle varianti. |
| **Dati carta** | Nessun dato sensibile salvato: provider "manual" (bonifico / ritiro). Stripe predisposto via webhook. |
| **Password admin** | Hash **scrypt** con sale per-utente; mai in chiaro. Al cambio password **tutte** le sessioni vengono invalidate (rotazione), resta attiva solo quella corrente. |
| **Brute-force login** | Throttle IP+email: dopo 8 tentativi falliti in 15 min, blocco di 15 min (non blocca l'admin legittimo da un altro IP). |
| **Sessioni** | Token 32 byte in cookie `httpOnly`+`sameSite=lax` (+`secure` in prod); nel DB solo l'**hash SHA-256**. Scadenza 7 giorni, pruning automatico. |
| **Accesso gestionale** | Tripla barriera: middleware edge, layout protetto (rivalida a DB), e `requireAdmin()` in **ogni** server action di scrittura. |
| **IVA corretta** | `taxCents` scorporata dall'importo **scontato** (non dal lordo pieno): niente IVA sovrastimata quando c'è un codice sconto. |
| **Pagine private fuori dall'indice** | `robots.txt` + `noindex` su carrello/checkout/ordine/admin; solo catalogo e prodotti indicizzabili. |
| **Tracking ordine pubblico** | Richiede `code` + `publicToken` (16 byte); il solo codice non basta. |
| **Tracciabilità** | `AuditLog` su ogni scrittura admin + `OrderEvent` sulla storia di ogni ordine. |
| **Integrità referenziale** | Prodotti/varianti/sconti presenti in ordini storici non eliminabili (si archiviano/disattivano). |

## Persistenza & sincronizzazione gestionale → storefront

- Le pagine storefront sono `dynamic = "force-dynamic"`: leggono sempre lo stato attuale.
- Ogni azione admin che cambia il catalogo chiama `revalidatePath("/", "layout")`:
  **le modifiche dal gestionale sono immediatamente visibili sul negozio**.
- Il seed è **idempotente** (upsert su slug/SKU/codice): rilanciabile senza duplicati.

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

1. **Database**: cambiare `datasource` in `schema.prisma` a `postgresql` e impostare
   `DATABASE_URL`. Il codice è già scritto con guardie transazionali adatte a Postgres.
2. **`SESSION_SECRET`**: valorizzare con stringa casuale lunga.
3. **Pagamenti Stripe**: seguire le istruzioni in `lib/payments/stripe.ts`
   (installare `stripe`, implementare `init()`, aggiungere il webhook, impostare
   `payments.provider = "stripe"` dalle impostazioni).
4. **Immagini prodotto**: sono copiate in `public/images/products/`. In produzione si
   possono caricare da gestionale (campo URL/percorso già presente) o servire da CDN.
```
