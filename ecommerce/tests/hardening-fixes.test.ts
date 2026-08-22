import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword
} from "../lib/auth/password";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  isEncryptedSensitiveValue,
  refreshEncryptedValue
} from "../lib/security/secret-box";
import { generateBackupCode } from "../lib/auth/totp";
import { planRefund } from "../lib/commerce/refund-math";

/**
 * Regression test per l'hardening 2026-08 (fix audit P0/P1):
 * scrypt corrente, rotazione secret-box, backup code senza bias,
 * invarianti rimborso parziale.
 */

test("hashPassword usa il costo corrente (N=65536) e passwordNeedsRehash marca i legacy", () => {
  const current = hashPassword("password-di-test-lunga-abbastanza");
  assert.ok(current.startsWith("scrypt$65536$8$1$"), current.split("$").slice(0, 4).join("$"));
  assert.equal(passwordNeedsRehash(current), false);
  assert.equal(verifyPassword("password-di-test-lunga-abbastanza", current), true);

  const legacy = current.replace("scrypt$65536$", "scrypt$16384$");
  // L'hash legacy resta sintatticamente valido: la verifica lo accetta
  // (stesso salt/hash) e lo marca per il rehash al prossimo login.
  assert.equal(passwordNeedsRehash(legacy), true);
});

test("verifyPassword rigetta parametri KDF gonfiati (DoS da hash ostile)", () => {
  const stored = hashPassword("password-di-test-lunga-abbastanza");
  const inflated = stored.replace("scrypt$65536$8$1$", "scrypt$65536$16$8$");
  assert.equal(verifyPassword("password-di-test-lunga-abbastanza", inflated), false);
  const hugeN = stored.replace("scrypt$65536$8$1$", "scrypt$268435456$8$1$");
  assert.equal(verifyPassword("password-di-test-lunga-abbastanza", hugeN), false);
});

test("secret-box: roundtrip v2 e upgrade opportunistico da v1", () => {
  process.env.SESSION_SECRET = "a".repeat(48);
  const value = "totp-secret-JBSWY3DPEHPK3PXP";
  const sealed = encryptSensitiveValue(value);
  assert.ok(sealed.startsWith("enc:v2:"));
  assert.equal(isEncryptedSensitiveValue(sealed), true);
  assert.equal(decryptSensitiveValue(sealed), value);
  assert.equal(refreshEncryptedValue(sealed), sealed);

  // Simula una busta legacy v1 (derivazione chiave senza dominio, come il
  // codice pre-rotazione): refreshEncryptedValue la ri-cifra in v2.
  const legacyKey = createHash("sha256").update(process.env.SESSION_SECRET).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const legacySealed = `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
  assert.equal(decryptSensitiveValue(legacySealed), value);
  const upgraded = refreshEncryptedValue(legacySealed);
  assert.ok(upgraded.startsWith("enc:v2:"));
  assert.equal(decryptSensitiveValue(upgraded), value);
});

test("secret-box: la rotazione del segreto non distrugge i dati v1 (SESSION_SECRET_PREVIOUS)", () => {
  const oldSecret = "vecchio-segreto-da-ruotare-0123456789abcdef";
  const newSecret = "nuovo-segreto-ruotato-9876543210fedcba";
  process.env.SESSION_SECRET = oldSecret;
  const legacySealed = encryptSensitiveValue("dato-sotto-vecchia-chiave")
    .replace("enc:v2:", "enc:v1:"); // formato storico: chiave = sha256(segreto)
  // Il valore e' stato cifrato con la chiave v2-domain del vecchio segreto:
  // per la decifratura legacy serve la derivazione senza dominio, quindi
  // ricreiamo la busta con la derivazione v1 reale.
  const legacyKey = createHash("sha256").update(oldSecret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
  const encrypted = Buffer.concat([cipher.update("dato-sotto-vecchia-chiave", "utf8"), cipher.final()]);
  const realLegacy = `enc:v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
  void legacySealed;

  // Rotazione: nuovo segreto attivo, vecchio conservato in PREVIOUS.
  process.env.SESSION_SECRET = newSecret;
  process.env.SESSION_SECRET_PREVIOUS = oldSecret;
  assert.equal(decryptSensitiveValue(realLegacy), "dato-sotto-vecchia-chiave");
  const upgraded = refreshEncryptedValue(realLegacy);
  assert.ok(upgraded.startsWith("enc:v2:"));
  assert.equal(decryptSensitiveValue(upgraded), "dato-sotto-vecchia-chiave");

  delete process.env.SESSION_SECRET_PREVIOUS;
  process.env.SESSION_SECRET = newSecret;
});

test("generateBackupCode: formato XXXX-XXXX su alfabeto senza caratteri ambigui", () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 200; i += 1) {
    const code = generateBackupCode();
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
    for (const char of code.replace("-", "")) {
      assert.ok(alphabet.includes(char), `carattere inatteso: ${char}`);
    }
  }
});

test("planRefund: il rimborso parziale non supera mai il residuo incassato", () => {
  // Ordine 50€ pagato in carta + 10€ gift card: rimborsabile = 50€.
  const first = planRefund({ totalCents: 6000, alreadyRefundedCents: 0, giftCardCents: 1000, requestedCents: 1000 });
  assert.equal(first.ok && first.amountCents, 1000);
  assert.equal(first.ok && first.fullyRefunded, false);
  const second = planRefund({ totalCents: 6000, alreadyRefundedCents: 1000, giftCardCents: 1000, requestedCents: 1000 });
  assert.equal(second.ok && second.amountCents, 1000);
  const overflow = planRefund({ totalCents: 6000, alreadyRefundedCents: 1000, giftCardCents: 1000, requestedCents: 999999 });
  assert.equal(overflow.ok, false);
  const negative = planRefund({ totalCents: 6000, alreadyRefundedCents: 0, giftCardCents: 0, requestedCents: -5 });
  assert.equal(negative.ok, false);
});
