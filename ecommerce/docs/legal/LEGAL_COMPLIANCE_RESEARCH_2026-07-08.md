# Sessa 1930 E-commerce - Legal & Compliance Research Pack

Data ricerca: 8 luglio 2026  
Ambito: e-commerce B2C italiano/UE per pasticceria artigianale, prodotti dolciari freschi e confezionati, multi-sede, ritiro/consegna locale, account, pagamenti online, gift card, referral, codici sconto, analytics, cookie, PWA e futura loyalty.

Questo documento e le bozze collegate sono preparati per revisione legale. Non sostituiscono il controllo finale di avvocato, commercialista, DPO/referente privacy e responsabile HACCP/OSA.

## 1. Dati Sessa verificati e da validare

### Verificati da fonti ufficiali pubbliche

Fonte principale: sito ufficiale Sessa 1930, `https://sessa1930.com/`, `https://sessa1930.com/chi-siamo/`, privacy/cookie policy storiche; accesso 8 luglio 2026.

- Brand commerciale: Sessa 1930.
- Posizionamento: pasticceria artigianale napoletana con storia dal 1930.
- P.IVA indicata nel footer/policy storiche: `11751160968`.
- Contatti pubblici indicati dal sito storico: `info@sessa1930.com`, telefono `+39 081 038 1373`.
- Sede storica indicata dal sito: Ottaviano, Via/Piazza Municipio 27, 80044 Ottaviano (NA). Il progetto e-commerce usa "Piazza Municipio"; il sito storico mostra anche "Via Municipio". Da uniformare.
- Sedi/proiezione commerciale presenti nel progetto e sito: Napoli/Ottaviano, Milano/Merlata Bloom, Roma Termini, Torino e altre sedi operative. L'elenco definitivo a valore legale va confermato dall'azienda.

### Dati bloccanti mancanti

Questi dati non vanno inventati e devono essere confermati prima della pubblicazione:

- [RAGIONE SOCIALE] completa del venditore.
- [SEDE LEGALE] completa.
- [P.IVA] e codice fiscale, se diversi.
- [REA/REGISTRO IMPRESE], capitale sociale, eventuale stato societario.
- [PEC].
- [EMAIL SUPPORTO E-COMMERCE] e canale reclami.
- [DPO/REFERENTE PRIVACY] o conferma che non e' nominato DPO.
- [TITOLARE TRATTAMENTO] e eventuali contitolari/responsabili.
- [SEDI OPERATIVE] definitive, indirizzi, orari, telefono, opzioni ritiro/consegna.
- [TEMPI CONSEGNA/RITIRO], cut-off preparazione, zone servite, costi.
- [OPERATORE SETTORE ALIMENTARE/HACCP] e tracciabilita' lotti/produzione.
- [ELENCO PROCESSORI] privacy: hosting, email, pagamenti, analytics, CRM, customer support, antispam, CDN/Cloudflare, Netlify, eventuale Supabase/Postgres provider.
- [COOKIE E SDK REALI] con nomi, durata, terze parti, finalita'.
- [STRIPE/PSP] se usato in produzione e contratto/DPA attivo.
- [POLITICHE RIMBORSO] operative: modalita', tempi interni, casi food safety.

## 2. Matrice fonti

| Area | Fonte | Ente/autore | Giurisdizione | Forza | Sezioni rilevanti | Impatto pratico Sessa |
|---|---|---:|---:|---:|---|---|
| Brand/dati societari | `https://sessa1930.com/` e `https://sessa1930.com/chi-siamo/` | Sessa 1930 | Italia | Fonte aziendale | Footer, contatti, storia, sedi | Confermare dati legali, tono, storia, sedi e categorie senza copiare la vecchia estetica. |
| GDPR | `https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng` | UE | UE/SEE | Vincolante | Artt. 5, 6, 12-15, 21, 25, 28, 30, 32, 44 ss. | Privacy policy, basi giuridiche, diritti, sicurezza, processor, trasferimenti extra UE. |
| Codice Privacy | `https://www.garanteprivacy.it/` e D.Lgs. 196/2003 come modificato | Garante/Italia | Italia | Vincolante | Cookie/ePrivacy, marketing, minori, controlli Garante | Integra GDPR con regole nazionali e provvedimenti autorita'. |
| Cookie | `https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876` | Garante Privacy | Italia | Linee guida autorita' | Banner, consenso, rifiuto, scrolling, analytics, preferenze | Banner con accetta/rifiuta/gestisci, no cookie marketing prima del consenso, consenso documentato. |
| FAQ cookie | `https://www.garanteprivacy.it/faq/cookie` | Garante Privacy | Italia | Soft law autorita' | Cookie tecnici, analytics, profilazione | Pannello preferenze granulare e accessibile. |
| Consenso GDPR | EDPB Guidelines 05/2020 on consent, `https://www.edpb.europa.eu/` | EDPB | UE | Linee guida autorita' | Libero, specifico, informato, inequivocabile; revoca facile | No caselle preselezionate; no consenso forzato; revoca semplice. |
| Consumer law | Codice del Consumo D.Lgs. 206/2005, `https://www.normattiva.it/` e Gazzetta Ufficiale | Italia | Italia | Vincolante | Artt. 49, 51, 52-59, 66-bis, garanzia legale | Informazioni precontrattuali, pulsante ordine, recesso, eccezioni freschi/deperibili. |
| Contratti online | Direttiva 2011/83/UE e sintesi UE consumer rights | UE | UE/Italia | Vincolante via recepimento | Contratti a distanza, withdrawal, button solution | Checkout con riepilogo chiaro e "ordine con obbligo di pagare". |
| E-commerce | Direttiva 2000/31/CE e D.Lgs. 70/2003, `https://eur-lex.europa.eu/eli/dir/2000/31/oj/eng`, `https://www.normattiva.it/` | UE/Italia | UE/Italia | Vincolante | Informazioni prestatore, fasi tecniche ordine, conferma ricezione, archiviazione contratto | Note legali, conferma ordine email, correzione errori prima invio. |
| Prezzi/sconti | D.Lgs. 26/2023, FAQ MIMIT sconti, `https://www.mimit.gov.it/` | Italia | Italia | Vincolante/guida autorita' | Prezzo precedente, riduzioni prezzo, pratiche scorrette | Prezzo barrato: mostrare prezzo precedente piu' basso degli ultimi 30 giorni dove applicabile. |
| Pratiche scorrette | `https://www.agcm.it/` | AGCM | Italia | Autorita' | Trasparenza, claim, recensioni, dark pattern | Evitare claim non dimostrabili; recensioni future con autenticita' dichiarata. |
| Food information | Reg. UE 1169/2011, `https://eur-lex.europa.eu/` | UE | UE/Italia | Vincolante | Artt. 9, 14, 21, allegato II allergeni | Prima dell'acquisto: ingredienti/allergeni, quantita', conservazione, OSA, info obbligatorie dove applicabili. |
| Sicurezza alimentare | Reg. CE 178/2002; Ministero Salute `https://www.salute.gov.it/` | UE/Italia | UE/Italia | Vincolante/autorita' | Tracciabilita', richiami, responsabilita' OSA | Procedure richiami, reclami food safety, lotti e responsabilita'. |
| MOCA/packaging | Reg. CE 1935/2004 e norme MOCA | UE/Italia | Vincolante | Materiali a contatto alimentare | Claim packaging/regalo senza promesse non verificate; documentazione fornitori. |
| Pagamenti | PSD2/SCA, RTS SCA, Stripe docs `https://stripe.com/docs/strong-customer-authentication`, `https://stripe.com/docs/payments/payment-intents` | UE/Stripe | UE/contrattuale | Vincolante/contrattuale | SCA, Payment Intent, webhook, idempotenza, rimborso | Stato pagamento server-side, no salvataggio dati carta, webhook verificati e idempotenti. |
| Wallet | Apple Pay / Google Pay docs terms | Apple/Google | Contrattuale | Contrattuale | Requisiti merchant, privacy, tokenizzazione | Inserire solo se attivati; informare su PSP e dati trattati. |
| Accessibilita' | WCAG 2.2 `https://www.w3.org/TR/WCAG22/`, quickref `https://www.w3.org/WAI/WCAG22/quickref/` | W3C | Standard tecnico | Standard | Livello AA, focus, contrasto, target size, errori | Riferimento tecnico per UI, checkout, cookie banner, modali. |
| European Accessibility Act | Direttiva UE 2019/882 `https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng`, D.Lgs. 82/2022 | UE/Italia | Vincolante | Servizi e-commerce dal 28 giugno 2025 | Statement accessibilita', canale feedback, processo correzione, progettazione accessibile. |
| EN 301 549 | Standard europeo accessibilita' ICT | ETSI/CEN/CENELEC | UE | Norma armonizzata/riferimento | Requisiti ICT | Benchmark tecnico insieme a WCAG. |
| ADR/ODR | Commissione UE ODR, Reg. UE 2024/3228; `https://ec.europa.eu/consumers/odr` | UE | UE | Vincolante/stato aggiornato | Piattaforma ODR cessata nel 2025 | Non inserire link ODR non piu' operativo; indicare ADR/organismi competenti se applicabile. |
| Newsletter/marketing | GDPR, ePrivacy, Codice Privacy art. 130, Garante | UE/Italia | Vincolante | Consenso, soft spam clienti, revoca | Consenso newsletter separato; soft spam solo su prodotti analoghi e opt-out. |
| PWA/storage | GDPR, ePrivacy, browser permissions | UE/Italia | Vincolante/best practice | Local storage, notifiche push, permessi device | Informare su storage tecnico, notifiche solo opt-in, no tracking nascosto. |

## 3. Mappa obblighi applicabili

### Precontrattuale e checkout

- Mostrare prima del pagamento identita' venditore, caratteristiche essenziali prodotto, prezzo totale IVA inclusa, costi consegna, tempi e modalita', restrizioni sede/territorio, durata offerta, diritto di recesso o esclusione. Fonti: Codice Consumo art. 49; Reg. 1169/2011 art. 14.
- Riepilogo ordine con prodotti, quantita', sede, ritiro/consegna, indirizzo, sconti, gift card, totale finale e metodo pagamento. Fonti: Codice Consumo artt. 49 e 51.
- Pulsante finale non ambiguo: "Ordine con obbligo di pagamento", "Paga ora" o equivalente. Fonte: Codice Consumo art. 51.
- Consentire correzione errori prima dell'invio: modifica carrello, quantita', sede, indirizzo, note, codice. Fonte: D.Lgs. 70/2003; Codice Consumo.
- Conferma ordine su supporto durevole: email con riepilogo e condizioni applicabili. Fonti: Codice Consumo, D.Lgs. 70/2003.

### Recesso, resi e prodotti alimentari

- Diritto di recesso standard 14 giorni per contratti a distanza, salvo eccezioni. Fonte: Codice Consumo artt. 52 ss.
- Eccezioni rilevanti: beni che rischiano deterioramento/scadenza rapida; beni confezionati su misura/personalizzati; beni sigillati non restituibili per motivi igienici se aperti. Fonte: Codice Consumo art. 59.
- Per prodotti alimentari freschi va spiegato chiaramente prima dell'acquisto che il recesso puo' essere escluso per natura deperibile o igienica.
- Distinguere recesso da rimedio per prodotto errato, difettoso, danneggiato o non conforme. In tali casi resta possibile rimedio/rimborso/sostituzione secondo legge.

### Food law

- Per vendita a distanza, le informazioni obbligatorie sugli alimenti devono essere disponibili prima della conclusione dell'acquisto, con eccezione della data di scadenza/TMC quando non disponibile prima della consegna; devono essere disponibili alla consegna. Fonte: Reg. 1169/2011 art. 14.
- Evidenziare allergeni dell'allegato II nella lista ingredienti o sezione dedicata, leggibile e non nascosta.
- Inserire conservazione, modalita' consumo, peso/formato, porzioni quando pertinenti.
- Stabilire processo richiami: identificazione ordine/lotto, contatti clienti, comunicazione Ministero/autorita' se necessaria.

### Privacy, account e sicurezza

- Privacy policy completa con titolare, finalita', basi giuridiche, categorie dati, destinatari, trasferimenti, tempi conservazione, diritti, reclamo al Garante. Fonti: GDPR artt. 12-15.
- Account: dati profilo, indirizzi, ordini, sessioni, 2FA/passkey se attive, log accessi. Base giuridica: contratto, obbligo legale, legittimo interesse sicurezza, consenso per marketing/profilazione.
- Privacy by design e misure sicurezza adeguate. Fonti: GDPR artt. 25 e 32.
- Processor/DPA: hosting, email, Stripe/PSP, analytics, CRM, CDN. Fonte: GDPR art. 28.
- Trasferimenti extra UE solo con garanzie appropriate. Fonte: GDPR artt. 44 ss.

### Cookie/ePrivacy

- Cookie tecnici senza consenso, con informativa.
- Analytics assimilabili a tecnici solo se configurati secondo condizioni Garante; altrimenti consenso.
- Marketing/profilazione solo dopo consenso esplicito.
- Banner con rifiuto facile quanto accettazione, gestione preferenze, nessun consenso tramite scroll, revoca semplice.
- Conservare prova consenso e ripresentare banner secondo criteri Garante.

### Promozioni, gift card e referral

- Regole chiare prima dell'uso: valore, scadenza, spendibilita' per sede/categoria/prodotto, cumulabilita', utilizzi, soglia minima, non convertibilita' in denaro salvo legge.
- Sconti con prezzo barrato: applicare regole prezzo precedente quando si annuncia riduzione di prezzo.
- Referral: evitare auto-invito, doppio utilizzo, abuso; informare su trattamento dati e regole premio.

### Accessibilita'

- Dal 28 giugno 2025 i servizi e-commerce rientrano nel perimetro EAA/D.Lgs. 82/2022 salvo eventuali esenzioni da validare.
- Standard operativo: WCAG 2.2 livello AA come benchmark, con particolare attenzione a checkout, carrello, cookie banner, form, modali, drawer.
- Statement di accessibilita': stato, metodo valutazione, canale feedback, tempi risposta, processo miglioramento, eventuali contenuti non conformi.

### ADR/ODR

- La piattaforma UE ODR e' stata chiusa/cessata nel 2025. Non usare il vecchio link come obbligo operativo nel 2026.
- Valutare indicazione di organismi ADR competenti, canale reclami e legge/foro applicabile secondo Codice Consumo.

## 4. Risk register

| Rischio | Gravita' | Probabilita' | Area | Rimedio |
|---|---:|---:|---|---|
| Ragione sociale/REA/PEC mancanti o errati | Alta | Media | Note legali, checkout, footer | Conferma azienda/commercialista prima pubblicazione. |
| Recesso non escluso correttamente per freschi/deperibili | Alta | Media | PDP, checkout, T&C, resi | Microcopy prima pagamento + policy chiara art. 59. |
| Ingredienti/allergeni non disponibili prima acquisto | Alta | Alta se catalogo incompleto | PDP, quick add, checkout | Campi obbligatori prodotto + fallback "contattare sede" solo se conforme; validazione admin. |
| Cookie marketing caricati prima consenso | Alta | Media | Front-end, analytics | CMP con gating tecnico, consent log e rifiuto immediato. |
| Privacy policy generica senza processor/retention | Alta | Media | Legal/privacy | Data map reale e tabella retention. |
| Pagamento determinato dal front-end | Critica | Bassa/media | Checkout, webhook | Webhook verificati, Payment Intent server-side, idempotency key. |
| Prezzi barrati non conformi Omnibus | Alta | Media | Catalogo, promo | Campo prezzo precedente 30 giorni e audit promo. |
| Referral/gift card abusabili | Media/alta | Media | Account, checkout | Vincoli unici DB, atomicita', condizioni chiare e antifrode. |
| Accessibilita' checkout/cookie non conforme | Alta | Media | UI/UX | Test WCAG 2.2 AA, focus trap, keyboard, contrasto, target. |
| Link ODR obsoleto | Media | Alta se copiato da template vecchi | Note legali | Non includere ODR come piattaforma attiva; usare reclami/ADR. |
| Email cookie policy storica malformata | Media | Alta | Privacy/cookie | Sostituire con contatto ufficiale confermato. |
| Sedi/orari discordanti tra fonti | Media | Media | SEO locale, checkout | Fonte unica admin + snapshot ordine + revisione store manager. |
| PWA/local storage non dichiarato | Media | Media | Privacy/cookie | Inserire storage tecnico e notifiche opt-in. |

## 5. Checklist compliance sviluppatore/UX/legal

### Prodotto e catalogo

- [ ] Ogni prodotto ha nome, descrizione, prezzo IVA inclusa, categoria, sede, disponibilita'.
- [ ] Ogni prodotto alimentare ha ingredienti, allergeni evidenziati, peso/formato, conservazione, durata/TMC quando disponibile, modalita' consumo.
- [ ] Quick add mostra allergeni/info essenziali prima di aggiungere se il prodotto richiede scelta formato o note.
- [ ] Prezzo barrato supporta prezzo precedente conforme agli ultimi 30 giorni dove applicabile.

### Checkout

- [ ] Riepilogo completo prima del pagamento.
- [ ] Pulsante finale chiaro con obbligo di pagamento.
- [ ] Link a T&C, privacy, resi, allergeni/policy freschi prima del pagamento.
- [ ] Conferma ordine email con condizioni e riepilogo.
- [ ] Ordini non diventano pagati senza verifica server-side.
- [ ] Webhook idempotenti e verificati.

### Privacy/cookie

- [ ] Cookie tecnici separati da analytics/marketing.
- [ ] Banner con "Accetta", "Rifiuta", "Personalizza".
- [ ] Preferenze granulari accessibili da footer.
- [ ] Consent log con timestamp, versione policy, categorie.
- [ ] Privacy policy aggiornata con processor, retention, trasferimenti.

### Account e sicurezza

- [ ] Sessioni attive visibili e revocabili.
- [ ] 2FA/passkey se attive solo con informativa e recupero.
- [ ] Export/cancellazione account con eccezioni obblighi legali.
- [ ] Dati ordine visibili solo all'utente proprietario.

### Admin

- [ ] Ruoli e permessi differenziati.
- [ ] Audit log per prodotto, stock, sconti, gift card, ordini.
- [ ] Validazione campi food obbligatori prima pubblicazione prodotto.
- [ ] Export dati con tracciamento.

### Accessibilita'

- [ ] WCAG 2.2 AA: contrasto, focus, errori, label, keyboard, target size.
- [ ] Cookie banner, cart drawer, quick add e checkout testati via tastiera.
- [ ] Statement accessibilita' pubblicato e canale feedback attivo.

## 6. Struttura consigliata documenti

1. Note legali.
2. Condizioni generali di vendita.
3. Policy resi, cancellazioni e rimborsi.
4. Privacy Policy.
5. Cookie Policy.
6. Pannello preferenze cookie e banner.
7. Informativa accessibilita'.
8. Condizioni gift card e crediti.
9. Condizioni referral e codici sconto.
10. Microcopy checkout e product page.

## 7. Clausole critiche e fonti

- Identita' venditore e contatti: Codice Consumo art. 49; D.Lgs. 70/2003 art. 7.
- Informazioni alimentari prima acquisto: Reg. UE 1169/2011 art. 14.
- Allergeni: Reg. UE 1169/2011 art. 21 e Allegato II.
- Pulsante ordine/pagamento: Codice Consumo art. 51.
- Recesso e sue eccezioni: Codice Consumo artt. 52-59.
- Conferma contratto: Codice Consumo e D.Lgs. 70/2003.
- Cookie: Linee guida Garante 2021 e FAQ cookie.
- Privacy: GDPR artt. 5, 6, 12-15, 21, 25, 28, 32, 44 ss.
- Marketing/soft spam: Codice Privacy art. 130 e GDPR.
- Prezzi scontati: D.Lgs. 26/2023 e Codice Consumo come modificato.
- Accessibilita': Direttiva UE 2019/882, D.Lgs. 82/2022, WCAG 2.2 AA.
- Pagamenti: PSD2/SCA, Stripe Payment Intents/webhook/idempotency docs.

## 8. Validazioni finali obbligatorie

- Avvocato: T&C, recesso, gift card/referral, foro/legge, ADR, limitazioni responsabilita'.
- Commercialista: dati societari, IVA, fatturazione/ricevute, gift card contabile/fiscale.
- DPO/referente privacy: privacy, cookie, processor, retention, marketing, trasferimenti.
- Responsabile HACCP/OSA: ingredienti, allergeni, conservazione, scadenze, richiami, consegna freschi.
- Payment/compliance: Stripe/PSP, SCA, rimborsi, antifrode, PCI scope.
- Accessibility specialist: audit WCAG 2.2 AA/EAA prima go-live.
