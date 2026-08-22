# Sessa 1930 Ecommerce - Audit tecnico, sicurezza e SEO/GEO

Data audit: 11 luglio 2026  
Perimetro: app `ecommerce/`, PostgreSQL/Supabase, Prisma, ordini, pagamenti, account, admin, SEO/GEO, PWA, performance Netlify.

## Executive summary

La piattaforma ha una base nettamente superiore a un prototipo: checkout serializzabile, stock per sede, ledger gift card, tentativi di pagamento persistenti, sessioni revocabili, TOTP cifrato, passkey, rate limiting condiviso, audit admin e pagine locali sono gia presenti.

L'audit ha pero identificato quattro rischi concreti:

1. Un ordine segnato `PAID` poteva marcare come pagati tutti i tentativi ancora attivi, non solo quello realmente incassato.
2. Il pagamento in sede era confuso con lo stato di evasione e bloccava la preparazione finche l'ordine non veniva falsamente segnato come pagato.
3. Le pagine sede/prodotto erano renderizzate on demand e rispondevano `private, no-store`, con TTFB live osservato nell'ordine di 4-5 secondi.
4. L'indicizzazione locale era buona sulle sedi, ma mancavano home entity graph, landing categoria per sede, dati variante accurati, consenso analytics e difese DB riproducibili.

Questi punti sono stati corretti nel codice. La piattaforma resta da considerare **production candidate**, non ancora "world-class", finche non vengono completati dominio ufficiale, job asincroni, scadenza automatica stock, ruoli admin per sede, osservabilita e procedure operative.

## Evidenze verificate

- `npm audit`: 0 vulnerabilita note, incluse dev dependency.
- `npm test`: 12 test passati.
- `npm run lint`: passato.
- `npx tsc --noEmit`: passato.
- `npx prisma validate`: schema valido.
- Migrazioni `0000-0006`: bootstrap riuscito su PostgreSQL 17.
- Seconda esecuzione `db:deploy`: riuscita, quindi migrazioni idempotenti nel percorso verificato.
- `prisma/verify-flow.ts`: 67 controlli passati su database locale isolato.
- Build Next.js: 76 pagine generate; sedi, categorie locali e prodotti sono SSG/ISR.
- Browser production locale: nessun errore/warning console nei flussi catalogo verificati.
- Mobile 390 px: nessun overflow orizzontale; filtri in due colonne compatte.
- Header cache pubblico: `s-maxage=30` + `stale-while-revalidate`.
- Account/checkout/admin: `private, no-store` confermato.

## Correzioni applicate

### Ordini e pagamenti

- Aggiunto stato ordine `CONFIRMED` per pagamento al ritiro/consegna.
- Separati `Order.status` e `Order.paymentStatus` nei flussi manuali.
- Rimossa la marcatura massiva degli `PaymentAttempt` attivi come `PAID`.
- Aggiunta registrazione incasso manuale sul singolo tentativo e relativo audit.
- Impedito `CANCELLED` su un ordine pagato: deve passare da rimborso.
- Impedito `READY` per delivery e `SHIPPED` per pickup.
- Il referral viene convertito sul pagamento acquisito, anche se l'ordine e gia avanzato in preparazione.
- Rimossa la sede Ottaviano hardcoded dalle istruzioni del pagamento manuale.
- Tracking e nota admin sono ora atomici con il rispettivo `OrderEvent`.

### Webhook e idempotenza

- Nuovo modello `PaymentWebhookEvent`, con coppia provider/`eventId` univoca.
- Evento webhook e riconciliazione ordine/tentativo avvengono nella stessa transazione.
- Retry Stripe duplicati non possono duplicare pagamento, eventi o side effect.
- Mismatch di importo, valuta, metadata o stato entra in `REVIEW` con traccia persistente.

### Prisma e database

- Nuova migrazione `0006_transaction_security_geo.sql`.
- Un solo indirizzo predefinito per cliente tramite indice parziale.
- Gestione indirizzi spostata su transazioni `SERIALIZABLE` con promozione automatica del successivo default.
- Indici univoci case-insensitive per email, codici sconto, gift card e referral.
- Eliminato l'indice parziale ridondante dei tentativi pagamento.
- Aggiunti CHECK per stato ordine, coerenza pagamento/evasione e webhook.
- RLS abilitata sulle 38 tabelle applicative e privilegi `anon/authenticated` revocati.
- Correzione ufficiale Merlata Bloom: civico `0 C2`, orario `09:00-23:00`.

Nota RLS: Prisma usa il ruolo proprietario delle tabelle, che per PostgreSQL bypassa RLS salvo `FORCE ROW LEVEL SECURITY`. La misura protegge la Data API Supabase; non sostituisce validazione applicativa, query parametrizzate e least privilege del ruolo runtime.

### Account e sicurezza dati

Confermati come corretti:

- token sessione casuali a 256 bit, solo hash nel DB;
- cookie `HttpOnly`, `Secure` in produzione, `SameSite=Lax`;
- revoca sessione singola, altre sessioni o tutte le sessioni;
- TOTP AES-256-GCM, anti-replay dello step e backup code HMAC monouso;
- passkey WebAuthn con challenge firmata e counter;
- rate limiting Postgres per IP/account con chiavi HMAC;
- verifica email prima della scelta password;
- export e anonimizzazione account autenticati;
- server action e route admin protette da capability.

### SEO/GEO e product discovery

- Home con canonical e graph `Organization`, `WebSite`, `CollectionPage`, `ItemList` sedi.
- Landing indicizzabili `/sede/[slug]/categorie/[categorySlug]` per ogni combinazione reale.
- Sitemap estesa alle categorie locali e portata a ISR 5 minuti.
- Pagine private/transazionali escluse correttamente da indice e cache.
- Dati operativi del gestionale prioritari su indirizzo, CAP, provincia e orari SEO.
- Fonti terze spostate da `sameAs` a `subjectOf`.
- Product schema corretto: `ProductGroup`, varianti, SKU, prezzi e disponibilita per sede.
- Breadcrumb di prodotto verso la landing categoria locale pulita.
- Filtri client-side senza richiesta RSC e URL categoria crawlable per i bot.
- 7 sedi, 21 landing categoria e 43 pagine prodotto locali prerenderizzate nella build verificata.

Riferimenti metodologici: [Google LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Google ecommerce structured data](https://developers.google.com/search/docs/specialty/ecommerce/include-structured-data-relevant-to-ecommerce), [Google Product](https://developers.google.com/search/docs/appearance/structured-data/product), [Google Business Profile ordering links](https://support.google.com/business/answer/13769188), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Analytics e privacy

- Google Analytics non viene piu caricato prima del consenso.
- Banner con rifiuto equivalente, consenso analytics e pannello granulare accessibile.
- Nessun pixel marketing dichiarato/attivato.
- Preferenze persistenti per 180 giorni e riapribili dal footer.
- Gli eventi ecommerce vengono scartati finche `analytics` non e concesso.

## Risk register residuo

| Priorita | Rischio | Impatto | Rimedio richiesto |
|---|---|---|---|
| P0 deploy | Codice nuovo senza migration `0006` | Webhook 500 e modello mancante | Eseguire `npm run db:deploy` prima del deploy applicativo |
| P0 SEO | Canonical ancora su dominio Netlify | Autorita e local ranking dispersi | Attivare dominio ufficiale, idealmente `shop.sessa1930.com`, poi aggiornare env, Search Console e GBP |
| P1 stock | Nessun job che chiude sessioni Stripe scadute | Stock trattenuto dopo checkout abbandonato | Job schedulato che verifica Stripe server-side, scade attempt e rilascia stock atomicamente |
| P1 email | SMTP eseguito nel percorso request | Click/login/checkout piu lenti se SMTP e lento | Worker outbox con retry/backoff; richiesta salva `QUEUED` e risponde subito |
| P1 admin | Ruoli OWNER/ADMIN/STAFF non sono scoped per sede | Accesso eccessivo nel multi-store | `AdminLocation`, ruoli store manager/fulfillment/marketing e capability per sede |
| P1 admin auth | 2FA/passkey solo clienti | Compromissione gestionale ad alto impatto | TOTP/passkey obbligatoria almeno per OWNER/ADMIN |
| P1 osservabilita | Solo log piattaforma | Diagnosi lenta di webhook/checkout | Error tracking, correlation ID, alert su REVIEW/FAILED e dashboard riconciliazione |
| P1 backup | Restore non provato nel repository | RTO/RPO non verificati | PITR/backup Supabase, restore drill e runbook trimestrale |
| P1 GEO | Mancano coordinate e URL Google Maps verificati | LocalBusiness incompleto | Raccogliere lat/lng e URL GBP ufficiale per ciascuna sede |
| P1 merchant | Nessun feed Merchant Center/local inventory | Copertura Shopping/local ridotta | Merchant Center, feed prodotti e local inventory per sede |
| P2 catalogo | Tag/allergeni/ingredienti ancora testo/CSV | Query e food data poco strutturati | Modelli normalizzati per allergeni, ingredienti, conservazione, porzioni e media |
| P2 ricerca | Ricerca `contains` senza indice full-text | Degrado con catalogo grande | PostgreSQL FTS/trigram, ranking, typo tolerance e analytics query zero-result |
| P2 CSP | CSP minima senza nonce | Difesa XSS migliorabile | CSP nonce/hash graduale dopo inventario script/asset |
| P2 immagini | `images.unoptimized=true` | Peso immagini e LCP | Netlify Image CDN ora; Cloudflare Images/Polish in futuro |

## Dati aziendali da completare

- URL Google Business Profile e coordinate verificate per ogni sede.
- Telefono diretto per sede, se pubblicabile; non duplicare il centralino come dato locale senza conferma.
- Orari speciali/festivi e fonte operativa che li aggiorna.
- Area reale di consegna, costi, tempi e cut-off per sede.
- Politica stock reservation/timeout concordata con operations.
- SLA assistenza, canale rimborsi e responsabilita per sede.
- Ragione sociale, PEC, REA e dati legali definitivi nei placeholder dei documenti esistenti.
- Account Search Console, Merchant Center e accesso ai profili GBP.

## Sequenza di rilascio obbligatoria

1. Backup/PITR verificato e finestra di deploy concordata.
2. Impostare/controllare `MIGRATION_DATABASE_URL` e lanciare `npm run db:deploy`.
3. Verificare presenza tabella `PaymentWebhookEvent`, CHECK, indici e RLS.
4. Deploy applicativo Netlify.
5. Smoke test: sede, categoria, prodotto, carrello, login, 2FA, checkout manuale e webhook Stripe test.
6. Controllare cache pubblica e `no-store` privata.
7. Solo dopo il dominio ufficiale: aggiornare `NEXT_PUBLIC_SITE_URL`, sitemap, Search Console, GBP e Merchant Center.

Non applicare la migrazione e il deploy in ordine inverso: il nuovo codice webhook dipende dalla tabella introdotta in `0006`.
