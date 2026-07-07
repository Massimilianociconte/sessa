# Sessa 1930 ecommerce audit

## Fonti di riferimento

- Sessa 1930 sito ufficiale: storia, prodotti, categorie e sedi pubbliche (`https://sessa1930.com/`, `https://sessa1930.com/chi-siamo/`).
- Stripe Checkout e payment methods dinamici: configurazione dashboard, metodi locali e wallet (`https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods`).
- Stripe Express Checkout Element: Link, Apple Pay, Google Pay e wallet rapidi (`https://docs.stripe.com/elements/express-checkout-element`).
- Baymard Institute Checkout UX e Product List UX: riduzione attrito, guest checkout, fulfillment e filtri (`https://baymard.com/checkout-usability`, `https://baymard.com/research/product-lists`).
- Nielsen Norman Group product pages: contenuto persuasivo, fiducia e pagine prodotto efficaci (`https://www.nngroup.com/articles/ecommerce-product-pages/`).
- Google Analytics 4 ecommerce: eventi e struttura `items` per funnel e merchandising (`https://developers.google.com/analytics/devguides/collection/ga4/ecommerce`).
- Web.dev Core Web Vitals: LCP, INP, CLS e performance mobile (`https://web.dev/articles/vitals`).
- W3C WCAG 2.2: focus, target size, redundant entry, accessibilita dei form (`https://www.w3.org/TR/WCAG22/`).

## Lettura del brand

Sessa va trattato come brand dolciario premium con radice napoletana, artigianalita e forte componente familiare. Le fonti ufficiali confermano il racconto dal 1930, la centralita di Napoli/Ottaviano, colazioni, sfogliatelle, pasticceria tradizionale, box regalo e lievitati stagionali. L'estetica del nuovo ecommerce resta invece quella della nuova identita in repo: terracotta, blu intenso, verde brillante, pattern maiolica, firma Sessa e prodotto incorniciato in modo editoriale.

Nota sedi: il sito ufficiale consultato espone 7 sedi pubbliche. La richiesta di prodotto parla di 9 sedi attuali e 11 future; il modello dati supporta sedi aggiuntive, cataloghi per sede, stock per sede e disponibilita differenziata, ma serve la lista interna definitiva per completare il seed/gestionale.

## Migliorie implementate in questo passaggio

- Product discovery: ricerca libera nel catalogo di sede, filtri per occasione commerciale, categorie preservate nei filtri e evento `view_item_list`.
- Scheda prodotto: trust layer su freschezza, allergeni, ritiro/consegna e regalo; tag occasione; prezzo piu evidente; prodotti correlati dalla stessa sede; evento `view_item`.
- Drawer carrello: eventi `view_cart` e `remove_from_cart` con valore, righe e sede.
- Drawer carrello: focus trap, chiusura Escape, ripristino focus al trigger e annunci screen reader.
- Checkout: trust strip, autocomplete sui campi chiave, radio pagamento controllati, microcopy Stripe wallet-ready, eventi `begin_checkout`, `add_payment_info` e `checkout_submit`.
- Stripe: metadata completi su sessione e PaymentIntent, `client_reference_id`, locale italiano, success URL con session id, cancel URL sulla pagina ordine invece che sul carrello convertito.
- Webhook Stripe: gestione di `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`.
- Ordine/tracking: notice chiari per pagamento riuscito, annullato o fallito; retry Stripe sicuro dall'ordine senza duplicare carrelli; stato pagamento e riferimento visibili; evento `purchase` quando l'ordine risulta pagato.
- Admin ordini: ricerca estesa a ID, codice, email, telefono, riferimento pagamento, gift card, referral e sconto; filtro per metodo pagamento; KPI operativi su ordini filtrati, incasso pagato, fallimenti e ritiro/consegna.
- Analytics: caricamento GA4 solo se `NEXT_PUBLIC_GA_ID`, utility client centralizzata, `select_item` sulle card prodotto e coda locale `sessaAnalyticsQueue` per debug pre-GA4.

## Priorita ancora aperte

1. Stripe live readiness: configurare Dashboard con metodi dinamici, Apple Pay/Google Pay, webhook reali, domini verificati e test end-to-end con carte Stripe.
2. Slot ritiro/consegna: sostituire il campo datetime libero con slot gestibili per sede, cutoff time e capacita laboratorio.
3. Admin operativo: vista Kanban, export CSV, alert scorte basse, log azioni su ogni modifica prodotto/promo e coda ordini da preparare.
4. Media pipeline: immagini prodotto responsive, formati moderni, priority sulle hero/PDP, blur placeholder e audit LCP/CLS/INP.
5. CRM: recupero carrello, ordine pronto, post-acquisto, reorder, compleanno, promo locale e referral campaign.
6. CRO: flag esperimenti per drawer, CTA, soglie promo, layout PDP, bundle e suggerimenti prodotto.
7. Accessibilita: audit Playwright/axe, target size mobile, messaggi errore annunciati e test tastiera completi.
8. Catalogo 9/11 sedi: completare dati sede interni, orari, opzioni fulfillment, prezzi differenziati e prodotti esclusivi.
9. Loyalty/card future: usare la base gift card/codici per card abbonamento, credito residuo, limiti utente e campagne.
