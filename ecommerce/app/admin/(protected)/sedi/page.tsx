import Flash from "@/components/admin/Flash";
import {
  createLocationAction,
  deleteLocationAction,
  updateLocationAction
} from "@/lib/actions/admin/locations";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sedi" };

type LocationDefaults = {
  name: string;
  slug: string;
  city: string;
  address: string;
  province: string;
  postalCode: string;
  phone: string | null;
  hours: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  isActive: boolean;
  position: number;
  merchantStoreCode: string | null;
  merchantEnabled: boolean;
  merchantPickupSla: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
  gbpUrl?: string | null;
};

function LocationFields({ d }: { d?: LocationDefaults }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label-field">Nome</label>
        <input name="name" defaultValue={d?.name} required className="input-field" />
      </div>
      <div>
        <label className="label-field">Slug</label>
        <input name="slug" defaultValue={d?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input-field" />
      </div>
      <div>
        <label className="label-field">Città</label>
        <input name="city" defaultValue={d?.city} required className="input-field" />
      </div>
      <div>
        <label className="label-field">Indirizzo</label>
        <input name="address" defaultValue={d?.address} required className="input-field" />
      </div>
      <div>
        <label className="label-field">Provincia</label>
        <input name="province" defaultValue={d?.province} maxLength={4} className="input-field" />
      </div>
      <div>
        <label className="label-field">CAP</label>
        <input name="postalCode" defaultValue={d?.postalCode} maxLength={10} className="input-field" />
      </div>
      <div>
        <label className="label-field">Telefono</label>
        <input name="phone" defaultValue={d?.phone ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">Orari</label>
        <input name="hours" defaultValue={d?.hours ?? ""} className="input-field" placeholder="07:00-00:00" />
      </div>
      <div>
        <label className="label-field">Latitudine</label>
        <input name="latitude" type="number" step="any" defaultValue={d?.latitude ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">Longitudine</label>
        <input name="longitude" type="number" step="any" defaultValue={d?.longitude ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">URL Google Maps</label>
        <input name="googleMapsUrl" defaultValue={d?.googleMapsUrl ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">URL Google Business</label>
        <input name="gbpUrl" defaultValue={d?.gbpUrl ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">Posizione</label>
        <input name="position" type="number" min={0} defaultValue={d?.position ?? 0} className="input-field" />
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="pickupEnabled" defaultChecked={d?.pickupEnabled ?? true} className="accent-terracotta" />
          Ritiro in sede
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="deliveryEnabled" defaultChecked={d?.deliveryEnabled ?? true} className="accent-terracotta" />
          Consegna a domicilio
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="isActive" defaultChecked={d?.isActive ?? true} className="accent-terracotta" />
          Sede attiva
        </label>
      </div>
      <section className="rounded-2xl border border-ceramic/20 bg-ceramic/5 p-4 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">Inventario locale Google</p><p className="text-xs text-ink/50">Attiva solo dopo aver copiato il codice esatto dal Google Business Profile.</p></div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="merchantEnabled" defaultChecked={d?.merchantEnabled ?? false} className="accent-terracotta" />Sede nei feed locali</label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label-field">Store code</label><input name="merchantStoreCode" maxLength={64} defaultValue={d?.merchantStoreCode ?? ""} className="input-field" placeholder="Codice Business Profile" /></div>
          <div><label className="label-field">Tempo ritiro</label><select name="merchantPickupSla" defaultValue={d?.merchantPickupSla ?? "same day"} className="input-field"><option value="same day">In giornata</option><option value="next day">Giorno successivo</option><option value="2-day">Entro 2 giorni</option><option value="3-day">Entro 3 giorni</option><option value="4-day">Entro 4 giorni</option><option value="5-day">Entro 5 giorni</option><option value="6-day">Entro 6 giorni</option><option value="multi-week">Da concordare</option></select></div>
        </div>
      </section>
    </div>
  );
}

export default async function AdminLocationsPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdminCapability("catalog:manage");
  const { msg, err } = await searchParams;
  const locations = await prisma.location.findMany({
    include: { _count: { select: { storeVariants: true, orders: true } } },
    orderBy: { position: "asc" }
  });

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Sedi / Punti vendita</h1>
      <p className="mt-1 text-sm text-ink/50">
        Ogni sede ha il proprio assortimento, prezzi e stock. Creando una sede il catalogo attivo
        viene predisposto automaticamente (nascosto e stock 0: attivalo sede per sede).
      </p>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          {locations.map((location) => (
            <details key={location.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4">
                <span className="font-serif text-lg font-semibold">{location.name}</span>
                <span className="text-sm text-ink/50">/{location.slug}</span>
                <span className="ml-auto flex items-center gap-2">
                  {!location.isActive && <span className="badge bg-ink/10 text-ink/50">Disattivata</span>}
                  <span className="badge bg-cream text-ink/60">{location._count.orders} ordini</span>
                </span>
              </summary>
              <div className="border-t border-ink/10 p-5">
                <form action={updateLocationAction} className="space-y-4">
                  <input type="hidden" name="id" value={location.id} />
                  <LocationFields d={location} />
                  <button type="submit" className="btn-secondary">
                    Salva
                  </button>
                </form>
                <form action={deleteLocationAction} className="mt-3">
                  <input type="hidden" name="id" value={location.id} />
                  <button type="submit" className="text-xs font-semibold text-terracotta hover:underline">
                    Elimina sede
                  </button>
                </form>
              </div>
            </details>
          ))}
        </div>

        <section className="card h-fit p-6">
          <h2 className="mb-4 font-serif text-xl font-semibold">Nuova sede</h2>
          <form action={createLocationAction} className="space-y-4">
            <LocationFields />
            <button type="submit" className="btn-primary">
              Crea sede
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
