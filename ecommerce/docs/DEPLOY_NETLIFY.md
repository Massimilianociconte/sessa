# Deploy Netlify - runbook

Sito temporaneo: `https://sessa-ecommerce.netlify.app` (project id
`3d1f1103-dc52-40c2-b30b-09adc32517d1`, non collegato a Git: deploy da CLI).

Prima del primo lancio seguire `docs/OPERATIONS_RUNBOOK.md` (rotazione
segreti, owner, dominio, backup) e portare a zero i punti bloccanti di
**Gestionale → Checklist lancio**.

## Sequenza completa di release (macOS / zsh)

### 1. Preflight del codice

```bash
cd ecommerce   # dalla radice del repository

git branch --show-current
git status --short

# Il runtime di produzione e Node 24. Con nvm:
nvm install 24
nvm use 24

npm ci
npx prisma validate
npx prisma generate
npm run lint
npx tsc --noEmit
npm test
npm run test:integration   # Postgres locale sessa_test, ricreato a ogni run
```

`test:integration` rifiuta qualunque database diverso da `sessa_test` su
localhost: non puo toccare la produzione. Gli stessi controlli girano in CI
(`.github/workflows/ecommerce-ci.yml`) a ogni push che tocca `ecommerce/`.

### 2. Connessione migrazioni e backup

Da Supabase, pulsante **Connect**, copiare la connessione **Direct** (porta 5432)
oppure **Session pooler** (porta 5432 se la rete locale non raggiunge IPv6).
Non usare il Transaction pooler 6543 per migrazioni o `pg_dump`.

```bash
read -rs "MIGRATION_DATABASE_URL?Incolla la URL Postgres per migrazioni (porta 5432): "
echo
export MIGRATION_DATABASE_URL

# Mostra solo destinazione e porta, mai la password.
node -e 'const u=new URL(process.env.MIGRATION_DATABASE_URL); if(u.port==="6543") throw new Error("Usa Direct/Session 5432, non Transaction 6543"); console.log({host:u.hostname,port:u.port||"5432",database:u.pathname.slice(1)})'

# Backup esterno al repository. Se pg_dump non e installato, creare/verificare
# prima un backup dal dashboard Supabase e non proseguire alla cieca.
BACKUP_DIR="$HOME/Backups/Sessa"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
pg_dump --format=custom --no-owner --no-acl "$MIGRATION_DATABASE_URL" \
  > "$BACKUP_DIR/sessa-before-$(date +%Y%m%d-%H%M%S).dump"
```

La distinzione e quella raccomandata da
[Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres):
Direct/Session per migrazioni e strumenti Postgres, Transaction 6543 per
traffico serverless.

### 3. Migrazione e verifica Prisma

```bash
npm run db:deploy
npm run db:verify
unset MIGRATION_DATABASE_URL
```

`db:deploy` applica in ordine le migrazioni additive `0002`-`0011` (tutte
idempotenti, registrate nel ledger `_sessa_migration_ledger`) e, verso un host
remoto, chiede di digitare `MIGRA` prima di procedere; `db:verify` deve
terminare con `Verifica schema completata.`. Su un database di
produzione esistente **non usare mai** `npm run db:bootstrap`: contiene
l'asserzione di database vuoto ed e riservato al primo setup di un database
nuovo.

### 4. Preview e pubblicazione applicativa

```bash
npx netlify status
npm run deploy:preview
# Verificare l'URL preview restituito dalla CLI.
npm run deploy:prod
```

Entrambi i deploy: rifiutano un working tree non committato
(`scripts/predeploy-guard.mjs`), buildano tramite `netlify.toml`, verificano che
il bundle non contenga file `.env` ne valori dei segreti presenti nei `.env*`
locali (`scripts/check-deploy-bundle.mjs`) e solo allora caricano asset,
funzione server, proxy e scheduled functions. Il build **non esegue
migrazioni**: la migrazione `0011` va applicata PRIMA del deploy del codice che
la usa. Una
preview non e una sandbox dati: usare un database preview dedicato oppure
limitarla a smoke test in sola lettura.

## Perche serve `ecommerce/.git` (directory vuota)

Il repo Git e nella cartella padre, mentre il progetto Netlify e in `ecommerce/`.
La CLI altrimenti risale alla root e puo cercare le funzioni nella cartella
sbagliata, pubblicando zero funzioni e lasciando il sito in 404/502.

Gli script di deploy eseguono `mkdir -p .git` per fermare la risalita. La
directory e intenzionalmente vuota e non va sostituita con symlink. Sintomo di
errore: `available_functions: []` nel deploy Netlify.

## Vincoli di configurazione

- `netlify.toml` deve mantenere `publish = ".next"` con il runtime Next v5.
- Prisma deve includere `binaryTargets = ["native", "rhel-openssl-3.0.x"]` per
  le lambda Amazon Linux.
- `SECRETS_SCAN_OMIT_KEYS` deve escludere solo valori pubblici/non sensibili.
- `0006` introduce il registro webhook/pagamenti; `0007` introduce worker email,
  prenotazioni stock, ruoli sede, 2FA admin, osservabilita e Merchant. Entrambe
  devono precedere il codice applicativo.
- `npm run deploy:prod` usa `--skip-functions-cache` per non riutilizzare bundle
  server sospetti.

## Database e runtime serverless

- `DATABASE_URL`: Supavisor Transaction, porta `6543`, `pgbouncer=true`,
  `connection_limit=1`, `pool_timeout=20`.
- `MIGRATION_DATABASE_URL`: Direct o Supavisor Session, porta `5432`, usata solo
  dai comandi di migrazione/verifica/backup.
- `DIRECT_URL`: non e letta automaticamente dagli script del progetto.
- Node 24 e fissato in `.node-version`, `package.json` e `netlify.toml`. In
  Netlify impostare anche `AWS_LAMBDA_JS_RUNTIME=nodejs24.x`.
- Monitorare connessioni e latenza nel dashboard Supabase prima di aumentare
  `DATABASE_CONNECTION_LIMIT`: una connessione per cold lambda e il default
  prudente sul pool condiviso.

## Variabili Netlify di produzione

Obbligatorie:

`DATABASE_URL`, `SESSION_SECRET`, `MAINTENANCE_SECRET`, `MERCHANT_FEED_TOKEN`,
`ADMIN_2FA_REQUIRED=true`, `NEXT_PUBLIC_SITE_URL`,
`AWS_LAMBDA_JS_RUNTIME=nodejs24.x`.

Solo finche non esiste il proprietario: `ADMIN_SETUP_TOKEN` (poi rimuoverlo).

Al dominio definitivo: `WEBAUTHN_RP_ID` (es. `sessa1930.com`) e
`WEBAUTHN_ORIGINS` (es. `https://sessa1930.com,https://www.sessa1930.com`).
Con Cloudflare davanti a Netlify: `TRUSTED_PROXY=cloudflare`.

Generare valori diversi e lunghi per i segreti, ad esempio con
`openssl rand -base64 48`. Configurare `SESSION_SECRET` prima di attivare 2FA o
accodare email: una rotazione non pianificata renderebbe illeggibili i segreti
TOTP e i body cifrati ancora in coda.

Email:

`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Senza SMTP le email non vengono dichiarate inviate: l'outbox passa a
`FAILED`/`DEAD` dopo retry limitati ed e visibile in `/admin/osservabilita`.

Pagamenti:

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STOCK_RESERVATION_MINUTES=35`.

Eventi da abilitare sull'endpoint webhook Stripe (`/api/webhooks/stripe`):
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, `charge.dispute.created`.

Regole di pagamento (importo massimo e anticipo del pagamento in sede, giorni
lavorativi minimi e scadenza del bonifico, tentativi carta) e finestra di
annullo cliente: **Gestionale → Impostazioni**.

## Worker e osservabilita

- `process-email-queue`: ogni minuto, massimo 3 consegne SMTP concorrenti.
- `expire-stock-reservations`: ogni 5 minuti, riconcilia Stripe prima di
  rilasciare stock, coupon, referral e gift card.
- Entrambi chiamano route interne protette da `MAINTENANCE_SECRET` e registrano
  solo contatori/log privi di dati sensibili.
- Le scheduled functions scattano automaticamente solo sul deploy pubblicato.
  In preview usare **Netlify > Functions > Run now**. Riferimento:
  [Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).
- In `/admin/osservabilita` controllare coda email, eventi aggregati e rilanciare
  in modo esplicito le operazioni recuperabili.

## Ruoli e 2FA amministratori

Il proprietario assegna in `/admin/impostazioni` i ruoli `ADMIN`,
`STORE_MANAGER`, `FULFILLMENT`, `MARKETING` e, per i ruoli operativi, le sole sedi
consentite. Ogni cambio di ruolo/perimetro revoca le sessioni esistenti.

In produzione il 2FA TOTP e obbligatorio per accedere alle sezioni operative:
al primo accesso l'utente viene confinato in `/admin/sicurezza`. Salvare offline i
10 codici monouso e verificare le sessioni attive. L'override
`ADMIN_2FA_REQUIRED=false` e solo una procedura d'emergenza temporanea.

## Google Merchant Center e inventario locale

1. Collegare il Google Business Profile a Merchant Center.
2. Copiare per ogni sede il relativo `store_code` alfanumerico, case-sensitive,
   quindi abilitarla da `/admin/sedi`.
3. In `/admin/merchant-center` risolvere tutti i blocker e copiare i due URL
   protetti: prodotti e inventario locale.
4. Configurare in Merchant Center sorgenti pianificate giornaliere. Gli `id`
   sono gli stessi SKU in entrambi i feed; quantita e prezzi provengono dallo
   stock per sede usato dal checkout.
5. Dopo collegamento o modifica degli store code attendere la sincronizzazione
   delle sedi prima del primo upload. Non abilitare codici inventati.

La specifica Google richiede corrispondenza esatta di `store_code` e `id`, e SLA
come `same day`, `next day`, `2-day`:
[Local inventory data specification](https://support.google.com/merchants/answer/14819809?hl=en).

Finche non viene acquistato il dominio, `NEXT_PUBLIC_SITE_URL` resta l'URL
Netlify temporaneo. Al cambio dominio aggiornare la variabile e ridistribuire per
rigenerare feed, sitemap, canonical e metadati assoluti.

## Verifica post-deploy

Dopo il deploy controllare nel dashboard la funzione server Next, il proxy edge
e le due scheduled functions. Non deve esistere un vecchio `keep-warm`.

```bash
for p in / /admin/login /admin/setup /account/login /carrello /checkout /sitemap.xml; do
  curl -s -o /dev/null -w "%{http_code} %{redirect_url} $p\n" \
    "https://sessa-ecommerce.netlify.app$p"
done
```

Attesi: pagine pubbliche/login `200`; checkout vuoto reindirizzato al carrello;
admin/account senza sessione reindirizzati alle login; sitemap `200`. Eseguire
anche:

- ordine Stripe test e webhook duplicato;
- login admin con TOTP e recovery code;
- revoca di una sessione;
- `Run now` dei due worker;
- feed `401` senza token e `200` con `Authorization: Bearer ...`;
- controllo `/admin/osservabilita` dopo i test.
