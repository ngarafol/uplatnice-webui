/**
 * HUB3A PDF417 payload — gradnja i validacija.
 *
 * Barkod nosi 14 polja odvojenih "\n". Bankovna aplikacija ih čita POZICIJSKI,
 * pa prazno polje mora ostati prazan red — ne smije se preskočiti.
 *
 *  1  HRVHUB30
 *  2  valuta (EUR)
 *  3  iznos u centima, 15 znamenki, zero-padded
 *  4  platitelj: naziv/ime
 *  5  platitelj: adresa
 *  6  platitelj: grad
 *  7  primatelj: naziv/ime
 *  8  primatelj: adresa
 *  9  primatelj: grad
 * 10  IBAN primatelja (bez razmaka, velika slova)
 * 11  model (HR00 … HR99)
 * 12  poziv na broj primatelja
 * 13  šifra namjene (npr. COST) — smije biti prazna
 * 14  opis plaćanja
 */

import { isValidIban } from './public/iban.js';

const HEADER = 'HRVHUB30';

/**
 * Dužine polja iz službene upute HUB-a (v6, Tablica 1 "Nazivi i duljine polja
 * u 2D barkodu"). Platitelj i primatelj nemaju iste limite — zato su odvojeni.
 * Prekoračenje se odbija, a ne skraćuje: tiho rezanje bi promijenilo podatke
 * uplatnice, a korisnik ne bi znao što je otišlo u barkod.
 */
const LIMITS = {
  payerName: 30,
  payerAddress: 27,
  payerCity: 27,
  payeeName: 25,
  payeeAddress: 25,
  payeeCity: 27,
  reference: 22,
  description: 35,
};

const MAX_CENTS = 999_999_999_999_999; // polje u barkodu ima točno 15 znamenki

/**
 * Tekst pripremljen za barkod: velika slova i samo dozvoljeni znakovi.
 *
 * Uputa HUB-a (v6): dozvoljeni su 0–9, 27 slova hrvatske abecede (uključivo
 * Č Ć Đ Š Ž), Q W X Y, razmak, te , . : - + ? ' / ( ). Ostalo nije dozvoljeno
 * i zamjenjuje se razmakom. Kodna stranica je UTF-8, pa se dijakritika NE
 * prevodi u ASCII — bankovna aplikacija tada pokaže isto ime kao na uplatnici.
 */
const NEDOZVOLJENO = /[^0-9A-ZČĆĐŠŽQWXY .,:\-+?'\/()]/g;

export function zaBarkod(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(NEDOZVOLJENO, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/** 70,00 -> 7000. Baca grešku na neispravan unos; nikad ne vraća float. */
export function parseAmount(text) {
  const s = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Neispravan iznos: "${text}"`);
  }
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** 7000 -> "70,00" */
export function formatAmount(cents) {
  const n = Number(cents);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Neispravan iznos u centima: ${cents}`);
  return `${Math.floor(n / 100)},${String(n % 100).padStart(2, '0')}`;
}

/** 7000 -> "000000000007000" */
export function formatAmountField(cents) {
  const n = Number(cents);
  if (!Number.isInteger(n) || n <= 0 || n > MAX_CENTS) {
    throw new Error(`Iznos mora biti cijeli broj centi između 1 i ${MAX_CENTS}, dobiveno: ${cents}`);
  }
  return String(n).padStart(15, '0');
}

const TEXT_FIELDS = [
  ['payerName', 'Ime platitelja', LIMITS.payerName],
  ['payerAddress', 'Adresa platitelja', LIMITS.payerAddress],
  ['payerCity', 'Grad platitelja', LIMITS.payerCity],
  ['payeeName', 'Naziv primatelja', LIMITS.payeeName],
  ['payeeAddress', 'Adresa primatelja', LIMITS.payeeAddress],
  ['payeeCity', 'Grad primatelja', LIMITS.payeeCity],
];

/**
 * Validira i normalizira uplatnicu.
 * @returns {{ ok: boolean, errors: {field: string, message: string}[], fields: object|null }}
 */
export function validate(input) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const fields = {};

  for (const [key, label, max] of TEXT_FIELDS) {
    const value = zaBarkod(input?.[key]);
    if (!value) add(key, `${label} je obavezan.`);
    else if (value.length > max) add(key, `${label} može imati najviše ${max} znakova.`);
    fields[key] = value;
  }

  // Iznos
  let amountCents = input?.amountCents;
  if (typeof amountCents === 'string') {
    try {
      amountCents = parseAmount(amountCents);
    } catch (e) {
      add('amountCents', e.message);
      amountCents = null;
    }
  }
  if (amountCents != null) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) add('amountCents', 'Iznos mora biti veći od 0.');
    else if (amountCents > MAX_CENTS) add('amountCents', 'Iznos je prevelik.');
  }
  fields.amountCents = amountCents;

  // Valuta
  const currency = String(input?.currency ?? 'EUR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) add('currency', 'Valuta mora biti troslovna oznaka (npr. EUR).');
  fields.currency = currency;

  // IBAN
  const iban = String(input?.iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (!isValidIban(iban)) add('iban', 'IBAN nije ispravan (provjera mod-97 nije prošla).');
  fields.iban = iban;

  // Model je hrvatski pojam: obavezan za domaći IBAN, za strani nema smisla.
  const model = String(input?.model ?? '').trim().toUpperCase();
  if (iban.startsWith('HR')) {
    if (!/^HR\d{2}$/.test(model)) add('model', 'Model je obavezan za hrvatski IBAN (HR00–HR99).');
  } else if (model && !/^HR\d{2}$/.test(model)) {
    add('model', 'Model mora biti oblika HR00–HR99 ili prazan za strani IBAN.');
  }
  fields.model = model;

  // Poziv na broj
  const reference = String(input?.reference ?? '').replace(/\s+/g, '').toUpperCase();
  if (reference && !/^[0-9\-]+$/.test(reference)) {
    add('reference', 'Poziv na broj smije sadržavati samo znamenke i crtice.');
  } else if (reference.length > LIMITS.reference) {
    add('reference', `Poziv na broj može imati najviše ${LIMITS.reference} znakova.`);
  }
  fields.reference = reference;

  // Šifra namjene (opcionalno)
  const purposeCode = String(input?.purposeCode ?? '').trim().toUpperCase();
  if (purposeCode && !/^[A-Z]{4}$/.test(purposeCode)) {
    add('purposeCode', 'Šifra namjene mora biti 4 slova (npr. COST) ili prazna.');
  }
  fields.purposeCode = purposeCode;

  // Opis (opcionalno)
  const description = zaBarkod(input?.description);
  if (description.length > LIMITS.description) {
    add('description', `Opis može imati najviše ${LIMITS.description} znakova.`);
  }
  fields.description = description;

  return { ok: errors.length === 0, errors, fields: errors.length === 0 ? fields : null };
}

/** Gradi PDF417 payload. Baca grešku s popisom problema ako uplatnica nije ispravna. */
export function buildPayload(input) {
  const { ok, errors, fields } = validate(input);
  if (!ok) {
    const detail = errors.map((e) => `- ${e.message}`).join('\n');
    throw new Error(`Uplatnica nije ispravna:\n${detail}`);
  }

  const lines = [
    HEADER,
    fields.currency,
    formatAmountField(fields.amountCents),
    fields.payerName,
    fields.payerAddress,
    fields.payerCity,
    fields.payeeName,
    fields.payeeAddress,
    fields.payeeCity,
    fields.iban,
    fields.model,
    fields.reference,
    fields.purposeCode,
    fields.description,
  ];

  // Završni "\n" je dio formata koji su banke navikle čitati.
  return `${lines.join('\n')}\n`;
}

export { LIMITS, isValidIban };
