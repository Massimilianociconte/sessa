# Sessa 1930 E-commerce - CDN e Cloudflare readiness

Questa piattaforma e pronta per una CDN, ma con una regola fondamentale: cache aggressiva solo sugli asset statici. Carrello, checkout, account, ordini, admin e API devono sempre restare dinamici.

## Cosa cacheare

| Superficie | Strategia | Motivo |
| --- | --- | --- |
| `/_next/static/*` | `public, max-age=31536000, immutable` | asset Next con hash, sicuri da tenere a lungo in edge |
| `/icons/*`, `/brand/*`, `/patterns/*`, `/images/stickers/*` | `public, max-age=31536000, immutable` | brand asset versionati dal deploy |
| `/images/products/*` | `max-age=86400`, edge `s-maxage=604800`, `stale-while-revalidate=604800` | immagini prodotto frequenti, ma aggiornabili |
| `/manifest.webmanifest` | `max-age=3600`, `stale-while-revalidate=86400` | PWA aggiornata senza rimanere vecchia troppo a lungo |
| `/sw.js` | `no-cache, no-store, must-revalidate` | il service worker deve aggiornarsi subito |
| `/offline.html` | `no-cache, must-revalidate` | fallback controllato |

Gli header sono dichiarati in `next.config.mjs` e duplicati in `netlify.toml` per il deploy temporaneo su Netlify.

## Cosa non cacheare

Queste superfici includono cookie, stato utente, dati personali, ordini, sessioni o pagamenti:

- `/api/*`
- `/carrello*`
- `/checkout*`
- `/account/*`
- `/admin/*`
- `/ordine/*`

Per queste route sono impostati:

```txt
Cache-Control: private, no-store, max-age=0, must-revalidate
CDN-Cache-Control: no-store
Cloudflare-CDN-Cache-Control: no-store
```

## Regole Cloudflare consigliate

1. Bypass cache se la richiesta contiene cookie di sessione, carrello o admin:
   - `sessa_cart`
   - cookie sessione cliente
   - cookie sessione admin
2. Bypass cache per path:
   - `/api/*`
   - `/carrello*`
   - `/checkout*`
   - `/account/*`
   - `/admin/*`
   - `/ordine/*`
3. Eligible for cache per asset statici:
   - `/_next/static/*`
   - `/icons/*`
   - `/brand/*`
   - `/patterns/*`
   - `/images/stickers/*`
   - `/images/products/*`
4. Respect origin cache headers.
5. Attivare Brotli, HTTP/2 o HTTP/3, Polish/Image Optimization se disponibile.

## Catalogo pubblico

Le pagine `/sede/*` sono pubbliche ma oggi l'header legge il carrello server-side per mostrare il conteggio corretto. Per cache HTML edge aggressiva futura, separare il carrello in un fetch client-only (`/api/cart`) e rendere il catalogo completamente anonimo/cacheabile.

Fino a quel refactor, e piu sicuro cacheare solo asset e immagini, non l'HTML del catalogo.

## Invalidazione cache

Quando il gestionale modifica prodotti, immagini, categorie o disponibilita:

1. revalidare le route Next coinvolte;
2. purgare su CDN le immagini prodotto cambiate;
3. purgare le pagine sede/prodotto se in futuro diventano cacheabili in edge;
4. preferire purge per URL o cache tag, non purge globale.

## Deploy Netlify temporaneo

Per un deploy manuale o collegato al branch:

- base directory: `ecommerce`
- build command: `npm run build`
- publish directory: `.next`
- Node: `22`
- variabili minime:
  - `DATABASE_URL`
  - `NEXT_PUBLIC_SITE_URL`
  - `CUSTOMER_SESSION_SECRET` se previsto dall'ambiente
  - `ADMIN_SESSION_SECRET` se previsto dall'ambiente
  - `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` solo quando si abilita Stripe reale

Non committare `.env` o database locali.
