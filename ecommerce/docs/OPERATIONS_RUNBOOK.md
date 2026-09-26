# Runbook operativo di lancio

Passi che richiedono accesso agli account esterni (Netlify, Supabase, Stripe,
GitHub, provider email, dominio) e che quindi non sono nel codice. Vanno
eseguiti **in quest'ordine**: alcuni dipendono dai precedenti.

Lo stato si controlla in **Gestionale → Checklist lancio** (`/admin/prontezza`):
il lancio è possibile quando non restano punti "Bloccante". Il checkout di
produzione resta comunque chiuso finché mancano i dati aziendali.

---

## 0. Subito, prima di tutto il resto

1. **Repository privato.** GitHub → `Massimilianociconte/sessa` → Settings →
   General → Danger zone → *Change visibility* → Private. Il repository
   contiene schema, logica di pagamento e nomi dei codici sconto demo.
2. **Dump del database con dati personali, non cifrati:**
   - `Sessa/Backup_database/sessa-ecommerce-pre-0005-2026-07-10.dump`
   - `~/Backups/Sessa/sessa-public-before-20260711-135803.dump`
   - `~/Backups/Sessa/pre-0010-20260822-204238/`

   Se servono ancora, cifrarli e cancellare l'originale:

   ```bash
   brew install age
   age-keygen -o ~/.config/sessa-backup.key   # conservare la chiave nel password manager
   age -r "$(grep -o 'age1.*' ~/.config/sessa-backup.key)" -o FILE.dump.age FILE.dump
   rm -P FILE.dump
   ```

   Altrimenti cancellarli e basta. Non tenerli in cartelle sincronizzate (iCloud,
   Dropbox) né dentro il repository.
3. **`.env.production` locale** contiene le credenziali reali di produzione.
   Non serve per lavorare (il `.env` ora punta al DB locale `sessa_dev`).
   Dopo la rotazione al punto 2 va cancellato: `rm -P ecommerce/.env.production`.

## 1. Database: migrazione 0011 e backup

1. Supabase → progetto → *Database → Backups*: verificare che i backup
   giornalieri siano attivi. Per un e-commerce serve il piano Pro con
   **Point-in-Time Recovery**: senza, un errore o un attacco fa perdere fino a
   24 ore di ordini.
2. Backup esterno cifrato prima della migrazione (vedi `DEPLOY_NETLIFY.md` §2,
   poi cifrarlo con `age` come sopra).
3. Migrazione (dalla cartella `ecommerce/`, con la URL diretta porta 5432
   incollata nella shell, mai salvata su file):

   ```bash
   read -rs "MIGRATION_DATABASE_URL?URL Postgres diretta (5432): "; echo
   export MIGRATION_DATABASE_URL
   npm run db:deploy     # chiede di digitare MIGRA
   npm run db:verify
   unset MIGRATION_DATABASE_URL
   ```

   `0011` aggiunge orari, fasce, dati fattura, consenso, sequenza codici ordine
   e sblocca i rimborsi parziali. È additiva e idempotente: il codice vecchio
   continua a funzionare, quindi va applicata **prima** del deploy nuovo.
4. **Test di restore** (una volta ora, poi ogni trimestre): ripristinare un
   backup su un database isolato e aprire il gestionale contro quello.

## 2. Rotazione dei segreti

I valori attuali sono stati per mesi in `.env` locali e nella cartella di
build. Vanno considerati compromessi.

1. **Pubblicare prima il codice nuovo** (supporta `SESSION_SECRET_PREVIOUS`),
   poi seguire `docs/SECRET_ROTATION_RUNBOOK.md` §1: nessun cliente viene
   disconnesso e i codici 2FA restano validi.
2. **Password database**: `SECRET_ROTATION_RUNBOOK.md` §2. Aggiornare
   `DATABASE_URL` su Netlify con il transaction pooler (vedi punto 3).
3. **`MAINTENANCE_SECRET`**, **`MERCHANT_FEED_TOKEN`**: nuovi valori con
   `openssl rand -hex 32`. Dopo il cambio del token feed, aggiornare gli URL
   delle sorgenti in Merchant Center (li mostra `/admin/merchant-center`).
4. **SMTP e Stripe**: rigenerare password SMTP e chiavi Stripe
   (`SECRET_ROTATION_RUNBOOK.md` §5).
5. Verifica: `npm run deploy:prod` rifiuta il deploy se il bundle contiene un
   file `.env` o uno dei valori presenti nei `.env*` locali.

## 3. Netlify

1. **`DATABASE_URL` sul transaction pooler**: porta **6543** con
   `?pgbouncer=true&connection_limit=1&pool_timeout=20`. Con la porta 5432
   (session pooler) bastano ~15 funzioni contemporanee per esaurire le
   connessioni e far fallire i checkout. Il server scrive un avviso critico nei
   log delle funzioni se lo rileva, e la Checklist lo segnala come bloccante.
2. **Regione delle funzioni**: Site configuration → Functions → Region → la
   stessa regione del database Supabase (es. `eu-central-1` se il DB è a
   Francoforte). Ogni query attraversa l'Atlantico se restano su `us-east-1`.
3. **Deploy da Git** (consigliato): collegare il repository privato al sito
   Netlify, così ogni deploy corrisponde a un commit verificato dalla CI.
   Finché resta il deploy da CLI, `npm run deploy:prod` rifiuta un working tree
   non committato.
4. **`ADMIN_SETUP_TOKEN`**: vedi punto 4, poi rimuoverlo.
5. `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` (già documentato in `DEPLOY_NETLIFY.md`).

## 4. Proprietario del gestionale

Il database di produzione non deve contenere l'utente demo del seed.

1. Controllare chi esiste (Supabase → SQL editor):

   ```sql
   SELECT email, role, "isActive", "createdAt", "totpEnabledAt" FROM "AdminUser";
   ```

   Se il proprietario è l'utente demo `admin@sessa1930.com` del seed (password
   finita in file locali), il proprietario non si può disattivare: si
   trasforma nell'account vero.

   ```sql
   UPDATE "AdminUser" SET "email" = 'EMAIL-REALE-DEL-TITOLARE'
   WHERE "email" = 'admin@sessa1930.com';
   DELETE FROM "AdminSession"
   WHERE "userId" = (SELECT "id" FROM "AdminUser" WHERE "email" = 'EMAIL-REALE-DEL-TITOLARE');
   ```

   Poi accedere, cambiare subito la password (`/admin/impostazioni` → *Cambia
   password*) e attivare il 2FA in `/admin/sicurezza`.
2. Senza utenti: impostare su Netlify un `ADMIN_SETUP_TOKEN` nuovo, deploy,
   aprire `/admin/setup`, creare il proprietario con email reale, attivare
   subito il 2FA in `/admin/sicurezza` e salvare i 10 codici di backup offline.
3. Rimuovere `ADMIN_SETUP_TOKEN` da Netlify e ridistribuire.
4. Creare gli utenti delle sedi con ruolo `STORE_MANAGER` o `FULFILLMENT`
   limitati alla propria sede. Ognuno attiva il proprio 2FA.

## 5. Codici sconto demo

`BENVENUTO10`, `CINQUEEURO`, `BABAMERLATA15`, `BOXREGALO20` sono nel
repository e senza limite d'uso. Disattivarli da `/admin/sconti`, oppure:

```sql
UPDATE "DiscountCode" SET "isActive" = false
WHERE "code" IN ('BENVENUTO10', 'CINQUEEURO', 'BABAMERLATA15', 'BOXREGALO20');
```

Le promozioni vere vanno create con nomi nuovi, limite d'uso e scadenza.

## 6. Dati legali e contenuti obbligatori

1. **Gestionale → Impostazioni → Dati legali, avvisi e regole di pagamento**:
   ragione sociale, sede
   legale, partita IVA, REA, PEC, email assistenza, email privacy (D.Lgs.
   70/2003 art. 7). Finché mancano, il checkout di produzione mostra "negozio
   in configurazione" e non accetta ordini.
2. **Revisione legale**: condizioni di vendita, privacy e cookie sono generate
   da `lib/legal/documents.ts` con i dati sopra. Farle rileggere a un legale
   prima del lancio, in particolare: esclusione del recesso per prodotti
   deperibili (art. 59 Cod. Consumo), tempi di conservazione, responsabile del
   trattamento per Stripe/Netlify/Supabase/provider email.
3. **Informazioni alimentari** (Reg. UE 1169/2011): per ogni prodotto attivo
   ingredienti, allergeni e conservazione, da `/admin/prodotti`. I testi di
   conservazione del seed locale sono esempi: vanno validati dal laboratorio.
4. **Orari, fasce e capienza** di ogni sede: `/admin/sedi`. Per la consegna
   locale del fresco indicare i CAP serviti; senza CAP la consegna del fresco
   non viene offerta.
5. **Email avvisi ordini** per sede (`/admin/sedi`) e destinatari allarmi
   (`/admin/impostazioni`).

## 7. Email

1. Provider transazionale (Postmark, Brevo, Amazon SES…) con dominio
   verificato: record **SPF**, **DKIM** e **DMARC** sul DNS del dominio.
2. Su Netlify: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
   `SMTP_PASS`, `SMTP_FROM` (mittente sul dominio verificato).
3. Prova: registrazione di un account reale → deve arrivare l'email di
   attivazione. Senza SMTP la registrazione è impossibile e i clienti non
   ricevono conferme d'ordine.

## 8. Stripe

1. Chiavi live su Netlify (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
2. Endpoint webhook `https://<dominio>/api/webhooks/stripe` con gli eventi
   elencati in `DEPLOY_NETLIFY.md` → *Pagamenti*.
3. Prova end-to-end in modalità test su una preview: pagamento, pagamento
   annullato, rimborso parziale dal dashboard Stripe (deve comparire
   nell'ordine come "Rimborso parziale").

## 9. Dominio

1. Collegare il dominio definitivo a Netlify (HTTPS automatico).
2. `NEXT_PUBLIC_SITE_URL=https://<dominio>`, `WEBAUTHN_RP_ID=<dominio>`,
   `WEBAUTHN_ORIGINS=https://<dominio>,https://www.<dominio>`; ridistribuire.
   Decidere l'RP ID **prima** che i clienti registrino passkey: cambiarlo dopo
   le invalida tutte.
3. Con Cloudflare davanti a Netlify: `TRUSTED_PROXY=cloudflare`.
4. Search Console: proprietà di dominio, invio `https://<dominio>/sitemap.xml`.

## 10. Analytics

Se si usa GA4 (`NEXT_PUBLIC_GA_ID`): Amministrazione → Stream di dati →
Misurazione avanzata → **disattivare** "Modifiche di pagina basate sugli
eventi della cronologia del browser". Lo shop invia già page_view ripuliti
(senza email, codici ordine o token nell'URL); lasciandola attiva GA registra
anche gli URL grezzi.

## 11. Monitoraggio

1. **Uptime esterno** (UptimeRobot, Better Stack o simili, piano gratuito):
   controllo ogni minuto di `https://<dominio>/api/health`, che risponde 503
   se il database non risponde entro 2,5 secondi. Avviso via SMS/app a chi
   gestisce il sito.
2. **Allarmi applicativi**: in `/admin/impostazioni` indicare l'email
   destinataria degli allarmi e, se si usa Slack/Teams/Discord, l'URL del
   webhook. Gli eventi critici (pagamenti incoerenti, contestazioni Stripe,
   worker fermi) arrivano alla prima occorrenza e poi a 10, 100, 1000
   ripetizioni, senza inondare la casella.
3. Una volta a settimana: `/admin/osservabilita` (coda email, eventi aperti).

## 12. Prova generale prima dell'apertura

Su una preview con database di prova (mai la produzione):

- ordine con ritiro e pagamento in sede → email a cliente e sede, ordine in
  dashboard con suono/notifica, avanzamento fino a "Consegnato e incassato";
- ordine con consegna locale in un CAP servito e uno non servito;
- ordine con bonifico → scadenza della prenotazione e promemoria;
- ordine con carta (Stripe test) e rimborso parziale e totale;
- registrazione, attivazione, reset password, 2FA cliente;
- richiesta di cancellazione account con un ordine aperto (deve essere
  rifiutata) e dopo la consegna (deve anonimizzare).

Poi, in produzione, un primo ordine reale di importo minimo pagato con carta
e rimborsato.
