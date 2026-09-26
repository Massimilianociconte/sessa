/** Validazioni fiscali italiane per la richiesta di fattura (nessuna chiamata esterna). */

/** Partita IVA: 11 cifre con cifra di controllo (algoritmo di Luhn modificato). */
export function isValidPartitaIva(value: string): boolean {
  const digits = value.replace(/\s+/g, "").replace(/^IT/i, "");
  if (!/^\d{11}$/.test(digits) || /^0{11}$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    let digit = Number(digits[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[10]);
}

const CF_ODD: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23
};

function cfEvenValue(char: string): number {
  return /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 65;
}

/** Codice fiscale persona fisica (16 caratteri, con carattere di controllo) o numerico (11 cifre). */
export function isValidCodiceFiscale(value: string): boolean {
  const cf = value.replace(/\s+/g, "").toUpperCase();
  if (/^\d{11}$/.test(cf)) return isValidPartitaIva(cf);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
  let sum = 0;
  for (let index = 0; index < 15; index += 1) {
    const char = cf[index];
    sum += index % 2 === 0 ? CF_ODD[char] : cfEvenValue(char);
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15];
}

/** Codice destinatario SDI: 7 caratteri alfanumerici (6 per la PA). */
export function isValidSdiCode(value: string): boolean {
  return /^[A-Z0-9]{6,7}$/i.test(value.trim());
}

export type InvoiceData = {
  name: string;
  vatNumber: string | null;
  taxCode: string | null;
  sdiCode: string | null;
  pec: string | null;
  address: string;
};
