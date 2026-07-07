# Sessa 1930 E-commerce - Hardening produzione

Questo documento mappa i controlli gia presenti e le prossime decisioni necessarie per scalare in produzione.

## Flussi critici coperti nel codice

- Checkout dentro transazione database.
- Carrello server-side con token httpOnly.
- Conversione carrello `ACTIVE -> CONVERTED` per bloccare doppi invii.
- Stock per sede su `StoreVariant`.
- Scarico stock con `updateMany` condizionale `stockQty >= qty`.
- Ledger magazzino `StockMovement`.
- Sconti con `usedCount`, `maxUses`, `perUserLimit` e `DiscountRedemption`.
- Gift card con saldo e ledger, decremento condizionale atomico.
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
- pagamento esterno non inizializzato con rilascio stock;
- transizioni ordine valide/non valide;
- sconti per categoria e sede;
- assortimento multi-sede;
- account, reset password e storico;
- gift card parziale/totale;
- referral anti abuso e conversione.

## Requisiti prima della produzione reale

1. Passare da SQLite a Postgres gestito.
2. Aggiungere indici Postgres mirati per:
   - `Order(code)`, `Order(paymentRef)`, `Order(locationId, status, placedAt)`;
   - `StoreVariant(locationId, isAvailable, stockQty)`;
   - `Cart(token, status)`;
   - `DiscountRedemption(discountId, customerId)`;
   - `GiftCard(code, balanceCents)`.
3. Usare rate limit condiviso, preferibilmente Redis o database, non memoria di processo.
4. Configurare backup automatici e restore testato.
5. Spostare invio email, ricevute, analytics e sync secondari su job/outbox retryable.
6. Aggiungere osservabilita:
   - errori checkout;
   - pagamento fallito;
   - webhook duplicato/fallito;
   - stock insufficiente;
   - login sospetto;
   - azioni admin critiche.
7. Abilitare alert su:
   - ordini `PENDING_PAYMENT` troppo vecchi;
   - pagamenti Stripe completati senza ordine;
   - ordini cancellati con stock non ripristinato;
   - email in `FAILED`;
   - gift card con ledger incoerente.

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
