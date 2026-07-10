# Deploy Netlify — runbook

Sito: `https://sessa-ecommerce.netlify.app` (project id `3d1f1103-dc52-40c2-b30b-09adc32517d1`, non collegato a Git: si deploya da CLI).

## Comandi

```bash
cd ecommerce
npm run deploy:preview # preview isolata; alias: npm run deploy
npm run deploy:prod    # produzione: scelta esplicita
```

Entrambi buildano in locale tramite `netlify.toml`, quindi caricano asset,
funzione server e middleware edge. Il contesto `deploy-preview` genera Prisma e
Next ma **non esegue migrazioni**; solo `context.production` include
`npm run db:deploy`. Una preview non è comunque una sandbox dati: configurare un
database preview dedicato nel relativo contesto oppure limitarla a smoke test in
sola lettura. Non usare una preview come scorciatoia per migrare produzione.

## Perché serve `ecommerce/.git` (dir vuota)

Il repo Git sta alla root (`sito-sessa-bozza/`), il progetto Netlify in `ecommerce/`. La CLI Netlify risolve la "repository root" con `findUp('.git')`: senza contromisure risale alla root del repo e cerca le funzioni in `sito-sessa-bozza/.netlify/functions-internal` (vuota) → **deploya zero funzioni → 404 su tutto il sito**.

La dir vuota `ecommerce/.git` ferma la risalita: la CLI usa `ecommerce/` come root e trova le funzioni giuste. Una `.git` vuota è invalida per Git, quindi il repo esterno la ignora del tutto (i file di `ecommerce/` restano tracciati normalmente). Non è committabile: per questo gli script di deploy la ricreano con `mkdir -p`.

Sintomo se manca: log di deploy con `Finished hashing N files and edge functions` **senza** `X functions`, e `available_functions: []` sul deploy.

NON aggirare con symlink `root/.netlify/functions-internal → ecommerce/...`: la funzione viene zippata con i path interni sbagliati e la lambda crasha con `ERR_MODULE_NOT_FOUND` (502).

## Vincoli di configurazione

- `netlify.toml` → `publish = ".next"`: obbligatorio col runtime Next v5 (il plugin valida che il publish contenga l'output Next). Non puntarlo altrove.
- `prisma/schema.prisma` → `binaryTargets = ["native", "rhel-openssl-3.0.x"]`: le lambda Netlify girano su Amazon Linux; senza il target rhel la build fatta da macOS non include il query engine giusto e ogni query Prisma fallisce (pagine con fallback rendono comunque, `/sitemap.xml` va in 500).
- `SECRETS_SCAN_OMIT_KEYS` esclude solo valori pubblici/non sensibili. Credenziali
  DB, sessione, setup, Stripe e SMTP restano scansionate. In caso di falso positivo,
  identificare prima file e chiave invece di ampliare l'omit globale.
- `npm run db:deploy` applica in ordine le migrazioni additive `0002`-`0005` a un
  DB esistente. Usa `MIGRATION_DATABASE_URL` solo se impostata esplicitamente,
  altrimenti usa `DATABASE_URL`.
  `npm run db:bootstrap` aggiunge `0001` ed è riservato a un DB nuovo e vuoto.
- Prima di un deploy produzione: dump verificato, preflight invarianti, migrazione
  esplicita sul database scelto, poi deploy. Le preview saltano questo passaggio.
- Se un deploy riusa una zip di funzione sospetta: `npm run deploy:prod` usa già
  `--skip-functions-cache`.

## Database e runtime serverless

- `DATABASE_URL`: transaction pooler Supabase, porta `6543`, `pgbouncer=true`,
  `connection_limit=1`, `pool_timeout=20`.
- `MIGRATION_DATABASE_URL`: opzionale, connessione diretta/session pooler usata
  soltanto dal migration runner quando impostata.
- `DIRECT_URL`: non viene usata automaticamente dagli script; tenerla solo se serve
  a strumenti esterni.
- Il progetto usa Node 24 (`.node-version`, `package.json`, `netlify.toml`). In
  **Site configuration → Environment variables** impostare anche
  `AWS_LAMBDA_JS_RUNTIME=nodejs24.x`: questo override non vive in `netlify.toml`.
- La regione funzioni osservata è Ohio mentre Supabase è in Europa centrale. La
  scelta della regione richiede un piano Netlify compatibile; nel frattempo non
  aumentare il pool per singola lambda e monitorare latenza e cold start.

## Env di produzione da impostare o verificare

`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SETUP_TOKEN`,
`NEXT_PUBLIC_SITE_URL`, `AWS_LAMBDA_JS_RUNTIME`.

Per avere verifica email, reset password e avvisi sicurezza realmente inviati in produzione servono anche:

`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Se SMTP non e' configurato, le email vengono tracciate in `EmailMessage` come `FAILED` e la UI non deve promettere invii riusciti.

## Verifica preview e post-deploy

Prima della produzione, usare l'URL restituito da `npm run deploy:preview` ed
eseguire gli stessi controlli. Dopo il deploy, verificare nel dashboard la funzione
server Next e il middleware edge; non deve più esistere una scheduled function
`keep-warm`. `available_functions: []` indica un deploy statico incompleto.

```bash
for p in / /admin/login /admin/setup /account/login /carrello /checkout /sitemap.xml; do
  curl -s -o /dev/null -w "%{http_code} %{redirect_url} $p\n" "https://sessa-ecommerce.netlify.app$p"
done
```

Attesi: pagine pubbliche e login `200`; `/checkout` con carrello vuoto reindirizza
a `/carrello`; `/admin` e `/account` senza sessione reindirizzano alle rispettive
login. `/sitemap.xml` `200` conferma che la funzione raggiunge Supabase. Eseguire
anche un ordine Stripe test, un login con 2FA e un logout da browser reale.
