# Runbook rotazione segreti (SESSION_SECRET, credenziali DB, ADMIN_SETUP_TOKEN)

> Da eseguire **subito** se i valori attuali sono mai finiti su disco non
> cifrato (backup, archivi zip, screenshot) o in mano a terzi.
> Tutti i passi sono a impatto zero per gli utenti se seguiti nell'ordine.

## 1. SESSION_SECRET

`SESSION_SECRET` deriva le chiavi di: cifratura AES-256-GCM dei segreti TOTP
e dei corpi email in coda (`lib/security/secret-box.ts`), HMAC del cookie
display-name e dei challenge WebAuthn, derivazione chiavi rate-limit.

Il formato busta è versionato (`enc:v1:` legacy, `enc:v2:` corrente): le nuove
cifrazioni usano v2; le letture v1 usano `SESSION_SECRET_PREVIOUS` quando
presente. I valori vengono ri-cifrati in v2 in modo opportunistico ad ogni
verifica 2FA riuscita e alla consegna delle email, quindi la previous key si
rimuove dopo una finestra di osservazione.

Procedura:

```bash
# 1. Genera i due nuovi valori (32+ byte esadecimali)
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

# 2. Netlify → Site configuration → Environment variables:
#    SESSION_SECRET           = <NUOVO>
#    SESSION_SECRET_PREVIOUS  = <VECCHIO>   ← abilita la decifratura dei dati v1
# 3. Deploy (npm run deploy:prod).
# 4. Finestra di osservazione 7-14 giorni: ogni verifica 2FA riuscita ri-cifra
#    il secret TOTP dell'utente in v2; la coda email si svuota naturalmente.
#    Verifica residui:
#      SELECT COUNT(*) FROM "Customer" WHERE "totpSecret" LIKE 'enc:v1:%';
#      SELECT COUNT(*) FROM "AdminUser" WHERE "totpSecret" LIKE 'enc:v1:%';
#      SELECT COUNT(*) FROM "EmailMessage" WHERE body LIKE 'enc:v1:%';
# 5. A residui zero (o dopo accettazione del rischio): rimuovi
#    SESSION_SECRET_PREVIOUS e ridistribuisci.
```

Nota: gli utenti con TOTP che NON effettuano login durante la finestra restano
in v1 finché non rientrano — tenere `SESSION_SECRET_PREVIOUS` fino a copertura
soddisfacente, oppure chiedere una riattivazione 2FA ai residuali.

## 2. DATABASE_URL (password Supabase)

1. Supabase → Settings → Database → Reset database password.
2. Aggiornare le tre variabili su Netlify (`DATABASE_URL` pooler :6543 runtime,
   `MIGRATION_DATABASE_URL` diretta :5432 per le release) e i file locali
   `.env` / `.env.production`.
3. Verificare `npm run db:verify` e uno smoke checkout in preview.
4. Il vecchio valore resta valido finché non ruotato: trattare qualunque copia
   su disco come compromessa e rimuoverla (`.env*`, note, password manager).

## 3. ADMIN_SETUP_TOKEN

Serve solo finché `AdminUser.count() === 0`. Se un owner esiste già:

- nessuna urgenza tecnica, ma va comunque rigenerato (stesso schema Netlify);
- la pagina `/admin/setup` è auto-disabilitata quando esiste almeno un admin.

## 4. Sviluppo locale vs produzione

Il `.env` locale DEVE puntare a un Postgres locale/di staging:

```
# .env (sviluppo)
DATABASE_URL="postgresql://sessa:sessa@localhost:5432/sessa_dev"
```

`lib/db.ts` emette un warning forte se rileva host Supabase da NODE_ENV≠production;
l'override consapevole è `SESSA_ALLOW_PROD_DB_FROM_DEV=1`.

## 5. STRIPE_WEBHOOK_SECRET / chiavi API

Rotazione standard dal dashboard Stripe (Developers → API keys / Webhook
signing secret), aggiornando le variabili Netlify. Nessuna dipendenza
applicativa dalla storia del valore.
