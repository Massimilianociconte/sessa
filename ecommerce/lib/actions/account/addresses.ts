"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth/customer-session";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress
} from "@/lib/services/customer-account";
import { addressSchema, formDataToObject } from "@/lib/validation";

const PATH = "/account/indirizzi";

function back(key: "msg" | "err", value: string): never {
  redirect(`${PATH}?${key}=${encodeURIComponent(value)}`);
}

function parse(formData: FormData) {
  return addressSchema.safeParse({
    ...formDataToObject(formData),
    isDefault: formData.get("isDefault") === "on"
  });
}

export async function createAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const parsed = parse(formData);
  if (!parsed.success) back("err", parsed.error.issues[0]?.message ?? "Dati non validi.");
  await createAddress(customer.id, parsed.data);
  revalidatePath(PATH);
  back("msg", "Indirizzo salvato.");
}

export async function updateAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!id || !parsed.success) back("err", parsed.success ? "Indirizzo mancante." : parsed.error.issues[0]?.message ?? "Dati non validi.");
  await updateAddress(customer.id, id, parsed.data);
  revalidatePath(PATH);
  back("msg", "Indirizzo aggiornato.");
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (id) await deleteAddress(customer.id, id);
  revalidatePath(PATH);
  back("msg", "Indirizzo eliminato.");
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const id = String(formData.get("id") ?? "");
  if (id) await setDefaultAddress(customer.id, id);
  revalidatePath(PATH);
  back("msg", "Indirizzo predefinito aggiornato.");
}
