# Sessa 1930 E-commerce - Hardening produzione

Questo documento mappa i controlli presenti nel codice e i rischi operativi che
restano prima di considerare il servizio production-ready.

## Flussi critici coperti nel codice

- Checkout dentro transazione database.
- Carrello server-side con token httpOnly.
- Conversione carrello `ACTIVE -> CONVERTED` per bloccare doppi invii.
- Stock per sede su `StoreVariant`.
- Scarico stock con `updateMany` condizionale `stockQty >= qty`.
- Ledger magazzino `StockMovement`.
- Sequenza ordine per anno su `OrderCounter`, non piu in JSON dentro `Setting`.
- `Order.paymentRef` univoco per impedire riconciliazioni doppie tra ordine e pagamento.
- Sconti con `usedCount`, `maxUses`, `perUserLimit` e `DiscountRedemption`.
- Gift card con saldo e ledger, decremento condizionale atomico.
- Referral creati/convertiti in transazione insieme ai codici sconto riservati.
- State machine ordini centralizzata in `transitionOrder`.
- Tentativi pagamento Stripe persistiti e idempotenti, webhook con firma verificata.
- Fallimento/scadenza Stripe collegati ad annullamento e rilascio stock se l'ordine e ancora `PENDING_PAYMENT`.
- Rate limiting persistito su PostgreSQL per login, recupero, registrazione,
  checkout e mutazioni carrello.
- Sessioni cliente revocabili, TOTP con backup code e passkey/WebAuthn.

## Test disponibili

La suite minima non distruttiva è:

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run test:security
npm run build
```

`npx tsx prisma/verify-flow.ts`, da eseguire esclusivamente contro un database di
test sacrificabile, copre:

- ordine base;
- idempotenza anti doppio ordine;
- anti-oversell;
- due checkout simultanei sullo stesso stock;
- due checkout validi simultanei con codici ordine distinti;
- pagamento esterno non inizializzato con rilascio stock;
- transizioni ordine valide/non valide;
- sconti per categoria e sede;
- assortimento multi-sede;
- account, reset password e storico;
- gift card parziale/totale;
- referral anti abuso e conversione.

## Requisiti operativi ancora aperti

1. Portare il runtime sul transaction pooler Supabase (`DATABASE_URL`, porta 6543)
   e usare `MIGRATION_DATABASE_URL` solo quando serve una connessione separata per le migrazioni. Il pool runtime
   deve restare prudente (`connection_limit=1`) in ambiente serverless.
2. Allineare o mitigare la distanza tra regione Netlify Functions e regione DB;
   misurare separatamente warm latency e cold start.
3. Configurare backup automatici e provare davvero un restore su un database isolato.
4. Rendere l'outbox email un job retryable con dead-letter/alert: il record DB da
   solo non garantisce la consegna.
5. Aggiungere osservabilita con redazione dei dati personali:
   - errori checkout;
   - pagamento fallito;
   - webhook duplicato/fallito;
   - stock insufficiente;
   - login sospetto;
   - azioni admin critiche.
6. Abilitare alert su:
   - ordini `PENDING_PAYMENT` troppo vecchi;
   - pagamenti Stripe completati senza ordine;
   - ordini cancellati con stock non ripristinato;
   - email in `FAILED`;
   - gift card con ledger incoerente;
   - saturazione connessioni DB e aumento dei cold start.
7. Completare i dati legali, cookie/consensi, resi e informazioni alimentari nei
   draft in `docs/legal` prima di pubblicarli.

## Migrazioni e script database

- Il provider è PostgreSQL; `prisma/migrations-postgres/0001_init.sql` è il
  bootstrap e `0002`-`0005` sono migrazioni additive/idempotenti.
- `npm run db:bootstrap` è fail-closed su DB non vuoti. `npm run db:deploy` usa
  `MIGRATION_DATABASE_URL` solo se impostata e non riesegue la baseline.
- Il seed e rilanciabile: usa upsert su sedi, categorie, prodotti, varianti, sconti
  e dati demo; non ricrea stock o gift card gia presenti.
- `SEED_ADMIN_PASSWORD` e `SEED_CUSTOMER_PASSWORD` sono opzionali solo in sviluppo.
  Con `NODE_ENV=production`, il seed fallisce se non sono valorizzate.
- Prima di introdurre dati produzione esistenti, verificare duplicati su campi che
  hanno vincoli unici (`Order.paymentRef`, codici sconto, gift card, referral).

## Stato pagamento e stock

La piattaforma scala lo stock al checkout per evitare oversell. Questo e conservativo e adatto a prodotti freschi/scarsi. Per traffico molto alto si puo evolvere in stock hold temporanei:

1. `StockReservation` con scadenza;
2. rilascio automatico su timeout o pagamento fallito;
3. conferma definitiva su webhook `payment completed`;
4. job periodico di cleanup.

Fino a quel momento, gli ordini `PENDING_PAYMENT` vanno monitorati e cancellati/rilasciati se superano la finestra operativa.

## Sicurezza account

Gia presenti: password hash server-side, reset token monouso, sessioni revocabili,
rate limit persistito, TOTP, backup code monouso, passkey/WebAuthn, conferma email
e area `/account/sicurezza`.

Restano controlli operativi: verificare origin/RP ID passkey sul dominio definitivo,
consegnare realmente gli alert SMTP, definire retention di sessioni/audit e provare
recovery account e revoca da dispositivi reali.

## Admin e audit

Gia presenti: ruoli `OWNER | ADMIN | STAFF`, capability server-side centralizzate,
sessioni admin, `AuditLog` ed eventi ordine. La UI non è la barriera di sicurezza:
azioni ed export verificano la capability sul server.

Evoluzione possibile: ruoli operativi piu granulari:

- `OWNER`;
- `STORE_MANAGER`;
- `FULFILLMENT`;
- `MARKETING`;
- `SUPPORT`;

Ogni action admin deve validare il ruolo server-side, non solo nascondere UI.
