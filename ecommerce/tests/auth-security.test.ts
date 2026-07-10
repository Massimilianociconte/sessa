import test from "node:test";
import assert from "node:assert/strict";
import { hasAdminCapability } from "../lib/auth/admin-authorization";
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from "../lib/auth/password";
import { safeNextPath } from "../lib/auth/redirects";
import { csvCell } from "../lib/security/csv";
import { REDACTED_EMAIL_BODY, retainedEmailBody } from "../lib/security/email-retention";

test("safeNextPath accetta solo destinazioni locali nel perimetro auth", () => {
  assert.equal(safeNextPath("/account/ordini?stato=1", "/account", "/account"), "/account/ordini?stato=1");
  assert.equal(safeNextPath("https://evil.example", "/account", "/account"), "/account");
  assert.equal(safeNextPath("//evil.example/account", "/account", "/account"), "/account");
  assert.equal(safeNextPath("/account\\evil", "/account", "/account"), "/account");
  assert.equal(safeNextPath(`/account/${"a".repeat(600)}`, "/account", "/account"), "/account");
});

test("RBAC separa staff operativo dai dati e dalle configurazioni sensibili", () => {
  assert.equal(hasAdminCapability("STAFF", "orders:manage"), true);
  assert.equal(hasAdminCapability("STAFF", "customers:manage"), false);
  assert.equal(hasAdminCapability("STAFF", "exports:download"), false);
  assert.equal(hasAdminCapability("ADMIN", "settings:manage"), true);
  assert.equal(hasAdminCapability("ADMIN", "admins:manage"), false);
  assert.equal(hasAdminCapability("OWNER", "admins:manage"), true);
  assert.equal(hasAdminCapability("SUPERUSER", "dashboard:view"), false);
});

test("CSV neutralizza formule senza perdere escaping standard", () => {
  assert.equal(csvCell("=HYPERLINK(\"https://evil\")"), '"\'=HYPERLINK(""https://evil"")"');
  assert.equal(csvCell("  +1+1"), "'  +1+1");
  assert.equal(csvCell("test;valore"), '"test;valore"');
});

test("i body email con token non restano persistiti in produzione", () => {
  const body = "Apri https://shop.example/account/reset?token=raw-secret-token";
  assert.equal(retainedEmailBody(body, "production"), REDACTED_EMAIL_BODY);
  assert.equal(retainedEmailBody(body, "production").includes("raw-secret-token"), false);
  assert.equal(retainedEmailBody(body, "development"), body);
});

test("password scrypt valida il formato e usa il confronto dummy per account assenti", () => {
  const stored = hashPassword("una-password-molto-lunga");
  assert.equal(verifyPassword("una-password-molto-lunga", stored), true);
  assert.equal(verifyPassword("password-sbagliata", stored), false);
  assert.equal(verifyPassword("password", "scrypt$999999999$8$1$salt$hash"), false);
  assert.equal(verifyPasswordOrDummy("password", null), false);
});
