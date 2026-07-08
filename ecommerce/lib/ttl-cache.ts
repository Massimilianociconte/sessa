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

export async function memoTtl<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.clear();
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
