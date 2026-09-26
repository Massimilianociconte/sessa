# Runbook rotazione segreti (SESSION_SECRET, credenziali DB, ADMIN_SETUP_TOKEN)

> Da eseguire **subito** se i valori attuali sono mai finiti su disco non
> cifrato (backup, archivi zip, screenshot) o in mano a terzi.
> Tutti i passi sono a impatto zero per gli utenti se seguiti nell'ordine.

## 1. SESSION_SECRET

`SESSION_SECRET` deriva le chiavi di: cifratura AES-256-GCM dei segreti TOTP,
delle email in coda e dei dati sensibili (`lib/security/secret-box.ts`), HMAC
dei codici di backup 2FA, del cookie display-name, dei challenge WebAuthn, dei
link firmati (disiscrizione) e delle chiavi di rate limit.

Il codice lavora con un **keyring**: firma e cifra sempre con
`SESSION_SECRET`, ma verifica e decifra anche con `SESSION_SECRET_PREVIOUS`.
Durante la rotazione quindi nessuno viene disconnesso, i link già inviati
restano validi e i codici 2FA continuano a funzionare. Il job orario
(`/api/internal/jobs/email`, minuto 0) ri-cifra in blocchi con la chiave nuova
admin, clienti ed email in coda; i codici di backup vengono riscritti al primo
uso.

Procedura (dopo aver pubblicato il codice con keyring, **mai prima**):

```bash
# 1. Genera il nuovo valore
openssl rand -hex 32

# 2. Netlify → Site configuration → Environment variables:
#    SESSION_SECRET           = <NUOVO>
#    SESSION_SECRET_PREVIOUS  = <VECCHIO>
# 3. Nuovo deploy (le variabili si leggono al deploy): npm run deploy:prod
# 4. Gestionale → Checklist lancio → "Segreti": mostra i record ancora da
#    ri-cifrare. Il job orario li porta a zero (di solito in poche ore).
#    Verifica diretta, se serve:
#      SELECT COUNT(*) FROM "Customer"  WHERE "totpSecret" IS NOT NULL;
#      SELECT COUNT(*) FROM "AdminUser" WHERE "totpSecret" IS NOT NULL;
# 5. A residui zero, e dopo almeno 7 giorni (link email già inviati e
#    sessioni lunghe), rimuovi SESSION_SECRET_PREVIOUS e ridistribuisci.
```

Da quel momento il vecchio valore non apre più nulla: le copie su disco del
vecchio `.env.production` diventano innocue per questo segreto.

## 2. DATABASE_URL (password Supabase)

1. Supabase → Settings → Database → Reset database password.
2. Aggiornare su Netlify `DATABASE_URL` (transaction pooler :6543 runtime).
   `MIGRATION_DATABASE_URL` (diretta :5432) non va salvata da nessuna parte:
   si incolla nella shell al momento della release (vedi DEPLOY_NETLIFY.md).
3. Verificare `npm run db:verify` e uno smoke checkout in preview.
4. Il vecchio valore resta valido finché non ruotato: trattare qualunque copia
   su disco come compromessa e rimuoverla (`.env*`, note, password manager).

## 3. ADMIN_SETUP_TOKEN

Serve solo finché `AdminUser.count() === 0`. Se un owner esiste già:

- rimuovere la variabile da Netlify: non serve più (la Checklist lancio lo segnala);
- la pagina `/admin/setup` è comunque auto-disabilitata quando esiste almeno un admin.

## 4. Sviluppo locale vs produzione

Il `.env` locale punta a un Postgres locale (`sessa_dev`). `lib/db-guard.ts`
**rifiuta** la connessione a qualunque host remoto quando `NODE_ENV` non è
`production` (dev server, seed, script, test). L'eccezione consapevole, solo
da riga di comando per un singolo comando di release, è
`SESSA_ALLOW_REMOTE_DB=1`; `npm run db:deploy` verso un host remoto chiede
inoltre di digitare `MIGRA`.

`.env.production` non serve per lavorare: le variabili di produzione vivono su
Netlify. Se esiste ancora in locale, dopo la rotazione cancellarlo (contiene
solo valori ormai revocati) o spostarlo in un password manager.

## 5. STRIPE_WEBHOOK_SECRET / chiavi API

Rotazione standard dal dashboard Stripe (Developers → API keys / Webhook
signing secret), aggiornando le variabili Netlify. Nessuna dipendenza
applicativa dalla storia del valore.
