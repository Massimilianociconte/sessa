# Sessa E-commerce — da MVP a piattaforma multi-sede

Documento di analisi e piano. Redatto prima delle "modifiche profonde" richieste.

## 1. Dove siamo (architettura attuale)

MVP mono-sede solido e sicuro, ma con assunzioni da rimuovere per il target:

| Area | Stato attuale | Limite per il target |
|---|---|---|
| Sedi | Nessun concetto di punto vendita | Servono 9→11 sedi con catalogo/prezzi/stock propri |
| Prezzo & stock | Su `ProductVariant` (unico valore) | Devono diventare **per sede** |
| Catalogo | Globale | Deve essere **filtrato per sede** |
| Carrello/Ordine | Senza sede | Ordine deve appartenere a **una sede**, con ritiro/consegna |
| Sconti | Globali (percent/fixed) | Servono scope: sede, categoria, prodotto, primo ordine, per-utente… |
| Clienti | Solo anagrafica (no login) | Servono **account** (login, area personale, storico) |
| Gift card / referral / abbonamenti | Assenti | Da introdurre |
| Ricerca ordini gestionale | Codice/email/nome | Serve ricerca per sede, pagamento, evasione, codice, telefono… |

Cosa è già solido e resta la base: money in centesimi, ordini come snapshot immutabile,
magazzino a ledger, transazione di checkout con anti-oversell + idempotenza, macchina a
stati ordini, audit log, auth admin con scrypt+sessioni, sync gestionale→front (force-dynamic
+ revalidate).

## 2. Modello dati target (le entità nuove)

```
Location (punto vendita)
 └─ StoreVariant (assortimento per sede: prezzo override, stock, disponibilità)  ← stock e prezzo diventano QUI
Cart      → locationId (il carrello appartiene a una sede)
CartItem  → storeVariantId
Order     → locationId + snapshot sede + fulfillment (PICKUP|DELIVERY) + snapshot gift/referral
StockMovement → storeVariantId (ledger per sede)

DiscountCode  + scope (ALL|LOCATIONS|CATEGORIES|PRODUCTS) + firstOrderOnly + perUserLimit + stackable + customerId
 ├─ DiscountLocation / DiscountCategory / DiscountProduct (join granulari)
 └─ DiscountRedemption (chi/quando/quale ordine ha usato il codice)

Customer  + passwordHash + referralCode (diventa account)
 └─ CustomerSession (login clienti, token hashato come per l'admin)
GiftCard + GiftCardTransaction (ledger saldo)
Referral (referrer → invitato, riscatto una tantum, anti-abuso)
```

Scelta chiave: **prezzo e stock si spostano da `ProductVariant` a `StoreVariant`**.
`ProductVariant` resta la definizione del prodotto (nome, SKU, prezzo base, IVA); ogni sede
ne pubblica un assortimento con prezzo/stock/visibilità propri. Prodotto "globale" = presente
in tutte le sedi; prodotto "esclusivo" = StoreVariant in una sola sede.

## 3. Piano a fasi (ordine di implementazione)

**Fase 1 — Fondazione multi-sede** ✅ *COMPLETATA E TESTATA*
- Schema: Location, StoreVariant, ledger per sede, carrello/ordine con sede + ritiro/consegna.
- Catalogo, carrello, checkout, ordini, magazzino resi **store-aware**.
- Gestionale: gestione sedi, prodotti con assortimento per sede, stock per sede,
  ricerca ordini estesa (sede, pagamento, evasione, telefono, codice sconto…).
- Motore sconti **granulare** (sede/categoria/prodotto/primo-ordine/min/finestra/per-utente).
- Seed reale: 9 sedi + assortimento (esclusive, prezzi differenziati, esaurito) + sconti d'esempio.
- Schema **predisposto** (tabelle create) per account clienti, gift card, referral.
- Verificato: `next build` (22 route) + `verify-flow` (16/16: catalogo, carrello, checkout
  ritiro/consegna, stock per sede, idempotenza, oversell, transizioni, sconti scoped, assortimento).

**Fase 2 — Account clienti & area personale** ✅ *COMPLETATA E TESTATA*
- Login/registrazione/logout/recupero password clienti (sessioni token-hash, rate-limit, rotazione).
- Area personale `/account`: panoramica, profilo, indirizzi (CRUD + predefinito), storico ordini + dettaglio, **riordino**.
- Checkout integrato: prefill account, indirizzi salvati, associazione ordine→account, guest checkout mantenuto.
- Essenziali pasticceria aggiunti: **data/ora di ritiro-consegna** (`fulfillmentAt`, stato "Pronto per il ritiro"),
  **allergeni/ingredienti** sui prodotti (obbligo food) in front e gestionale, **coda email** (conferma ordine +
  recupero password) pronta da collegare a SMTP.
- Verificato: `verify-flow` 25/25 (16 multi-sede + 9 account: registrazione, collegamento ordine, storico, reset).

**Fase 3 — Gift card & crediti** ✅ *COMPLETATA E TESTATA*
- Emissione/gestione gift card dal gestionale (`/admin/gift-card`); ledger saldo con
  riscatto ATOMICO al checkout (decremento condizionale, mai negativo, no doppio uso);
  copertura parziale → resta da pagare; copertura totale → ordine PAID (metodo gift_card).

**Fase 4 — Referral & invito amici** ✅ *COMPLETATA E TESTATA*
- Link `/r/[code]` → cookie → collegamento alla registrazione. Sconto di benvenuto per
  l'amico + ricompensa al referrer alla prima conversione. Anti-abuso: no auto-invito,
  un solo referral per invitato (unique), ricompensa una tantum (transizione atomica).
  Area `/account/invita` + panoramica gestionale `/admin/referral`.

**Fase 5 — Pagamenti reali & email** ✅ *COMPLETATA (attivabile via env)*
- Provider **Stripe** (Checkout Session + webhook con firma verificata, idempotente);
  metodo "Carta" nel checkout quando `STRIPE_SECRET_KEY` è presente, altrimenti manuale.
  Charge sull'importo dovuto (al netto gift card). **Email SMTP** via nodemailer
  (conferma ordine, recupero password, referral); fallback a coda/log senza credenziali.

**Grafica** ✅ — design editoriale coerente col branch `codex/sessa-maiolica-preview`:
nastro terracotta, script Allura, titoli serif Cormorant, cornici a maiolica, card ad accento.

**Estensioni future**: card abbonamento, programma fedeltà, vendita gift card come prodotto,
campagne avanzate.

## 4. Criticità individuate da tenere sotto controllo

- **Migrazione stock**: spostando lo stock su StoreVariant, in dev si riparte da seed
  (nessun dato di produzione). In produzione servirà uno script di migrazione dedicato.
- **Carrello legato a una sede**: un carrello non può mischiare prodotti di sedi diverse;
  cambiando sede il carrello si azzera (scelta esplicita, coerente con "un ordine = una sede").
- **Sconti su sottoinsieme**: gli sconti per categoria/prodotto si applicano solo alle righe
  idonee, non all'intero subtotale (comportamento granulare corretto).
- **Concorrenza**: le stesse guardie transazionali (anti-oversell, idempotenza, consumo
  atomico) vanno replicate sul nuovo asse StoreVariant + su gift card e referral.
- **Coerenza gestionale↔front**: ogni pubblicazione/oscuramento per sede deve invalidare
  la cache della sola sede interessata.
