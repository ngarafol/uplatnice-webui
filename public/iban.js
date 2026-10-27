/**
 * IBAN: normalizacija, čitljiv zapis i provjera po ISO 13616 (mod-97).
 *
 * Isti modul koristi server (hub3.js pri validaciji uplatnice) i preglednik
 * (/static/iban.js za provjeru dok se tipka). Jedna kopija pravila, da se
 * serverska i klijentska provjera ne mogu razići.
 *
 * Podržane su sve države: provjera je generička, a duljina se dodatno provjeri
 * za države iz registra. Nepoznata država prolazi samo generičku provjeru —
 * IBAN se razvija, pa ne želimo odbiti novu članicu samo zato što je nema u tablici.
 */

/** Ukloni razmake i prebaci u velika slova. */
export const normalizeIban = (value) => String(value ?? '').replace(/\s+/g, '').toUpperCase();

/** "hr6710010051738712003" -> "HR67 1001 0051 7387 1200 3" */
export const formatIban = (value) => normalizeIban(value).replace(/(.{4})(?=.)/g, '$1 ');

/** Duljina IBAN-a po državi (ISO 13616 registar). */
const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 20,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** Duljina koju IBAN te države mora imati; null za države koje nisu u registru. */
export function ibanExpectedLength(value) {
  const iban = normalizeIban(value);
  return IBAN_LENGTHS[iban.slice(0, 2)] ?? null;
}

/** Provjera: struktura, duljina za poznatu državu i kontrolne znamenke (mod-97). */
export function isValidIban(raw) {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const expected = ibanExpectedLength(iban);
  if (expected !== null && iban.length !== expected) return false;

  // Prva četiri znaka idu na kraj, slova se pretvaraju u brojeve (A=10 … Z=35).
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= '0' && char <= '9' ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
