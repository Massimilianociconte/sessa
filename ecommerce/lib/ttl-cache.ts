/**
 * Memo in-memory con TTL per letture pubbliche "calde" (sedi, catalogo, settings).
 * Su serverless ogni istanza lambda tiene la sua cache: le richieste su istanza
 * calda saltano il roundtrip verso il database (che sta in un'altra regione),
 * la prima richiesta di un'istanza fredda paga la query come prima.
 * Le richieste concorrenti sulla stessa chiave condividono la stessa promise
 * (niente stampede). TTL breve: le modifiche dal gestionale appaiono comunque
 * entro pochi secondi.
 */
type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

const MAX_ENTRIES = 500;

/**
 * Evizione LRU-ish: elimina le voci scadute e poi, se serve, le meno
 * recentmente usate (l'ordine di inserimento di Map viene rinfrescato dai get).
 * Un flush totale ("store.clear()") creerebbe un thundering herd di query DB
 * sull'istanza appena il catalogo supera la capienza.
 */
function evictIfNeeded(): void {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
    if (store.size < MAX_ENTRIES) return;
  }
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export async function memoTtl<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) {
    // Rinfresca l'ordine di inserimento: approssima LRU senza strutture extra.
    store.delete(key);
    store.set(key, hit);
    return hit.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      evictIfNeeded();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

/** Invalida le chiavi che iniziano con il prefisso (es. dopo una scrittura). */
export function invalidateMemo(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
