# Sessa 1930 E-commerce - Hardening produzione

Questo documento mappa i controlli gia presenti e le prossime decisioni necessarie per scalare in produzione.

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
- Webhook Stripe con firma verificata.
- Fallimento/scadenza Stripe collegati ad annullamento e rilascio stock se l'ordine e ancora `PENDING_PAYMENT`.
- Rate limiting base su login cliente.
- Sessioni cliente revocabili da area personale.

## Test disponibili

`npx tsx prisma/verify-flow.ts` copre:

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

## Requisiti prima della produzione reale

1. Passare da SQLite a Postgres gestito.
2. Rigenerare/verificare le migrazioni contro provider `postgresql` prima del deploy reale.
   La cartella `prisma/migrations` contiene ora una baseline SQLite tracciata per nuovi
   ambienti locali; non va applicata alla cieca su un database produzione gia popolato.
3. Verificare in Postgres gli indici gia dichiarati nello schema per catalogo, ordini,
   pagamenti, gift card, referral, sessioni, admin e audit log.
4. Usare rate limit condiviso, preferibilmente Redis o database, non memoria di processo.
5. Configurare backup automatici e restore testato.
6. Spostare invio email, ricevute, analytics e sync secondari su job/outbox retryable.
7. Aggiungere osservabilita:
   - errori checkout;
   - pagamento fallito;
   - webhook duplicato/fallito;
   - stock insufficiente;
   - login sospetto;
   - azioni admin critiche.
8. Abilitare alert su:
   - ordini `PENDING_PAYMENT` troppo vecchi;
   - pagamenti Stripe completati senza ordine;
   - ordini cancellati con stock non ripristinato;
   - email in `FAILED`;
   - gift card con ledger incoerente.

## Migrazioni e script database

- `prisma.config.ts` dichiara schema, cartella migrazioni e seed senza usare la
  configurazione deprecata `package.json#prisma`.
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

Gia presenti:

- password hash server-side;
- reset token monouso e scadenza;
- sessioni server-side revocabili;
- rate limiting login;
- area account `/account/sicurezza`.

Prossimi step gratuiti consigliati:

- TOTP con app authenticator;
- backup codes monouso;
- passkey/WebAuthn;
- email alert su nuovo login e cambio password;
- conferma cambio email;
- storico accessi con IP/user agent normalizzati.

## Admin e audit

Gia presenti:

- utenti admin con ruolo;
- sessioni admin;
- `AuditLog`;
- eventi ordine.

Prossimo step: espandere i ruoli da `OWNER | ADMIN | STAFF` a ruoli operativi granulari:

- `OWNER`;
- `STORE_MANAGER`;
- `FULFILLMENT`;
- `MARKETING`;
- `SUPPORT`;

Ogni action admin deve validare il ruolo server-side, non solo nascondere UI.
