# Deploy Netlify — runbook

Sito: `https://sessa-ecommerce.netlify.app` (project id `3d1f1103-dc52-40c2-b30b-09adc32517d1`, non collegato a Git: si deploya da CLI).

## Comando

```bash
cd ecommerce
npm run deploy        # = mkdir -p .git && netlify deploy --prod
```

Il comando builda in locale (prisma generate + migrazione Postgres idempotente + next build via `[build].command` di `netlify.toml`) e carica asset, blob, funzione server e middleware edge.

## Perché serve `ecommerce/.git` (dir vuota)

Il repo Git sta alla root (`sito-sessa-bozza/`), il progetto Netlify in `ecommerce/`. La CLI Netlify risolve la "repository root" con `findUp('.git')`: senza contromisure risale alla root del repo e cerca le funzioni in `sito-sessa-bozza/.netlify/functions-internal` (vuota) → **deploya zero funzioni → 404 su tutto il sito**.

La dir vuota `ecommerce/.git` ferma la risalita: la CLI usa `ecommerce/` come root e trova le funzioni giuste. Una `.git` vuota è invalida per Git, quindi il repo esterno la ignora del tutto (i file di `ecommerce/` restano tracciati normalmente). Non è committabile: per questo lo script `deploy` la ricrea con `mkdir -p`.

Sintomo se manca: log di deploy con `Finished hashing N files and edge functions` **senza** `X functions`, e `available_functions: []` sul deploy.

NON aggirare con symlink `root/.netlify/functions-internal → ecommerce/...`: la funzione viene zippata con i path interni sbagliati e la lambda crasha con `ERR_MODULE_NOT_FOUND` (502).

## Vincoli di configurazione

- `netlify.toml` → `publish = ".next"`: obbligatorio col runtime Next v5 (il plugin valida che il publish contenga l'output Next). Non puntarlo altrove.
- `prisma/schema.prisma` → `binaryTargets = ["native", "rhel-openssl-3.0.x"]`: le lambda Netlify girano su Amazon Linux; senza il target rhel la build fatta da macOS non include il query engine giusto e ogni query Prisma fallisce (pagine con fallback rendono comunque, `/sitemap.xml` va in 500).
- `SECRETS_SCAN_OMIT_KEYS` in `netlify.toml`: Prisma embedda `DATABASE_URL` nel bundle server (mai in quello client); senza omit lo scan dei secret blocca il deploy con falsi positivi.
- `npm run db:deploy` applica `prisma/migrations-postgres/0002_account_email_pwa_hardening.sql` prima del build: e' additiva/idempotente e serve a evitare crash in produzione quando account, verifica email, sessioni attive o 2FA usano tabelle appena introdotte.
- Se un deploy riusa una zip di funzione sospetta: `netlify deploy --prod --skip-functions-cache`.

## Env di produzione (già impostate sul sito)

`DATABASE_URL` (Supabase pooler, ruolo applicativo), `SESSION_SECRET`, `ADMIN_SETUP_TOKEN`, `NEXT_PUBLIC_SITE_URL`.

Per avere verifica email, reset password e avvisi sicurezza realmente inviati in produzione servono anche:

`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Se SMTP non e' configurato, le email vengono tracciate in `EmailMessage` come `FAILED` e la UI non deve promettere invii riusciti.

## Verifica post-deploy

```bash
for p in / /admin/login /admin/setup /account/login /carrello /checkout /sitemap.xml; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "https://sessa-ecommerce.netlify.app$p"
done
```

Attesi: tutti 200. `/admin` e `/account` → 307 verso le rispettive login. `/sitemap.xml` 200 conferma che il DB Supabase è raggiungibile dalla lambda.
