import type { AdminRole } from "@/lib/domain";

export type AdminCapability =
  | "dashboard:view"
  | "orders:manage"
  | "inventory:manage"
  | "catalog:manage"
  | "promotions:manage"
  | "customers:manage"
  | "settings:manage"
  | "exports:download"
  | "admins:manage";

const MANAGER_CAPABILITIES: readonly AdminCapability[] = [
  "dashboard:view",
  "orders:manage",
  "inventory:manage",
  "catalog:manage",
  "promotions:manage",
  "customers:manage",
  "settings:manage",
  "exports:download"
];

const CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  OWNER: [...MANAGER_CAPABILITIES, "admins:manage"],
  ADMIN: MANAGER_CAPABILITIES,
  STAFF: ["dashboard:view", "orders:manage", "inventory:manage"]
};

export function isAdminRole(value: string): value is AdminRole {
  return value === "OWNER" || value === "ADMIN" || value === "STAFF";
}

export function hasAdminCapability(role: string, capability: AdminCapability): boolean {
  return isAdminRole(role) && CAPABILITIES[role].includes(capability);
}
