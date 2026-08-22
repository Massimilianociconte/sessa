import type { AdminRole } from "@/lib/domain";

export type AdminCapability =
  | "dashboard:view"
  | "orders:manage"
  | "orders:refund"
  | "inventory:manage"
  | "catalog:manage"
  | "promotions:manage"
  | "customers:manage"
  | "settings:manage"
  | "exports:download"
  | "admins:manage"
  | "operations:view"
  | "merchant:manage";

const MANAGER_CAPABILITIES: readonly AdminCapability[] = [
  "dashboard:view",
  "orders:manage",
  "orders:refund",
  "inventory:manage",
  "catalog:manage",
  "promotions:manage",
  "customers:manage",
  "settings:manage",
  "exports:download",
  "operations:view",
  "merchant:manage"
];

const CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  OWNER: [...MANAGER_CAPABILITIES, "admins:manage"],
  ADMIN: MANAGER_CAPABILITIES,
  STORE_MANAGER: ["dashboard:view", "orders:manage", "inventory:manage", "exports:download"],
  FULFILLMENT: ["dashboard:view", "orders:manage"],
  MARKETING: ["dashboard:view", "catalog:manage", "promotions:manage", "merchant:manage"]
};

export function isAdminRole(value: string): value is AdminRole {
  return ["OWNER", "ADMIN", "STORE_MANAGER", "FULFILLMENT", "MARKETING"].includes(value);
}

export function hasAdminCapability(role: string, capability: AdminCapability): boolean {
  return isAdminRole(role) && CAPABILITIES[role].includes(capability);
}
