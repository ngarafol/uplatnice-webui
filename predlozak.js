/**
 * Oznake u tekstu uplatnice koje se popune datumom dospijeća.
 *
 * Za ponavljajuće uplatnice dio teksta se mijenja svaki period (mjesec u opisu
 * i u pozivu na broj), ali nije slobodan tekst — to je funkcija datuma. Zato se
 * u polja upisuje predložak, a vrijednost se izračuna pri svakom prikazu.
 *
 *   opis:          "clanarina Nika Garafolic {MM}/{YY}"
 *   poziv na broj: "{MM}{YYYY}-1328"
 *
 * za dospijeće 2025-12-05 daje "…12/25" i "122025-1328". Kad uplata pomakne
 * dospijeće na siječanj, isti predložak daje "…01/26" i "012026-1328".
 *
 * Nema brojača: ništa se ne pamti, vrijednost ovisi samo o datumu.
 */
import { parseIso } from './recurring.js';

/** Redoslijed je važan: duže oznake prvo, inače `{MM}` pojede `{M}`. */
const UZORAK = /\{(MM|M|YYYY|YY)(?:([+-])(\d{1,2}))?\}/g;
/** Isti uzorak bez `/g` — `.test()` s globalnim regexom pamti `lastIndex`. */
const IMA_UZORAK = /\{(MM|M|YYYY|YY)(?:[+-]\d{1,2})?\}/;

/**
 * Pomak datuma za N mjeseci. Dan se postavlja na 1 prije pomaka: 31. ožujka
 * minus mjesec dana inače skoči na 3. ožujka („31. veljače"), pa bi mjesec bio
 * pogrešan. Za oznake se ionako čita samo mjesec i godina.
 */
function pomakniMjesece(datum, mjeseci) {
  const pomaknut = new Date(datum.getFullYear(), datum.getMonth(), 1);
  pomaknut.setMonth(pomaknut.getMonth() + mjeseci);
  return pomaknut;
}

const vrijednost = {
  M: (datum) => String(datum.getMonth() + 1),
  MM: (datum) => String(datum.getMonth() + 1).padStart(2, '0'),
  YY: (datum) => String(datum.getFullYear()).slice(-2),
  YYYY: (datum) => String(datum.getFullYear()),
};

/**
 * Kontrolni broj po modulu 11 (MOD11INI) — koristi se u modelima HR01–HR08.
 * Znamenke se množe težinama 2, 3, 4… zdesna nalijevo (bez gornje granice),
 * pa je kontrolni broj 11 − (zbroj mod 11); 10 i 11 postaju 0.
 *
 * Provjereno na službenom primjeru (2026789 → 4) i na dvije stvarne uplatnice
 * (1887102601 → 2, 1887112601 → 7).
 */
export function mod11ini(brojke) {
  const znamenke = String(brojke ?? '').replace(/\D/g, '');
  if (!znamenke) return null;

  let zbroj = 0;
  let tezina = 2;
  for (let i = znamenke.length - 1; i >= 0; i -= 1) {
    zbroj += tezina * Number(znamenke[i]);
    tezina += 1;
  }

  const kontrolni = 11 - (zbroj % 11);
  return kontrolni > 9 ? 0 : kontrolni;
}

/** Popis oznaka za napomenu u formi. */
export const OZNAKE = [
  ['{MM}', 'mjesec s vodećom nulom (01–12)'],
  ['{M}', 'mjesec bez nule (1–12)'],
  ['{YYYY}', 'godina, 4 znamenke'],
  ['{YY}', 'godina, 2 znamenke'],
  ['{MM-1}', 'prethodni mjesec (može i {MM+1})'],
];

/** Ima li tekst ijednu oznaku? */
export const imaOznake = (tekst) => IMA_UZORAK.test(String(tekst ?? ''));

/** Treba li poziv na broj izračunati kontrolni broj? */
export const imaKontrolni = (tekst) => String(tekst ?? '').includes('{KB}');

/**
 * Razriješi poziv na broj: datumski dio pa kontrolni broj.
 * Kontrolni broj se računa nad znamenkama ostatka poziva — crtice i samu
 * oznaku `{KB}` pritom ignorira.
 */
export function razrijesiPozivNaBroj(tekst, datumIso) {
  const izvorno = String(tekst ?? '');
  if (!imaKontrolni(izvorno)) return razrijesiPredlozak(izvorno, datumIso);

  const kontrolni = mod11ini(razrijesiPredlozak(izvorno.replace(/\{KB\}/g, ''), datumIso));
  // Bez ijedne znamenke nema što izračunati; oznaka ostaje vidljiva i validacija
  // će ju odbiti, što je bolje od tihe nule.
  if (kontrolni === null) return izvorno;

  return razrijesiPredlozak(izvorno, datumIso).replace(/\{KB\}/g, String(kontrolni));
}

/**
 * Zamijeni oznake datumom. Ako datuma nema ili nije ispravan, tekst se vraća
 * nepromijenjen — bolje vidljivo `{MM}` u barkodu nego izmišljen mjesec.
 */
export function razrijesiPredlozak(tekst, datumIso) {
  const izvorno = String(tekst ?? '');
  if (!izvorno || !datumIso) return izvorno;

  const datum = parseIso(datumIso);
  if (Number.isNaN(datum.getTime())) return izvorno;

  return izvorno.replace(UZORAK, (_, oznaka, znak, broj) => {
    // Pomak vrijedi za CIJELI datum, ne za pojedino polje: {MM-1} i {YYYY-1} u
    // siječnju daju prosinac PREPROŠLE godine, što je ono što se očekuje.
    const mjeseci = znak ? Number(broj) * (znak === '-' ? -1 : 1) : 0;
    return vrijednost[oznaka](mjeseci ? pomakniMjesece(datum, mjeseci) : datum);
  });
}

/**
 * Kopija zapisa s razriješenim opisom i pozivom na broj.
 * Koristi se samo za prikaz i barkod — forma za uređivanje mora vidjeti
 * predložak, inače bi se on prepisao razriješenim tekstom.
 */
export function razrijesiUplatnicu(uplatnica) {
  if (!uplatnica) return uplatnica;
  return {
    ...uplatnica,
    opis: razrijesiPredlozak(uplatnica.opis, uplatnica.next_due),
    poziv_na_broj: razrijesiPozivNaBroj(uplatnica.poziv_na_broj, uplatnica.next_due),
  };
}
