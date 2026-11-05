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
const UZORAK = /\{(MM|M|YYYY|YY)\}/g;

const vrijednost = {
  M: (datum) => String(datum.getMonth() + 1),
  MM: (datum) => String(datum.getMonth() + 1).padStart(2, '0'),
  YY: (datum) => String(datum.getFullYear()).slice(-2),
  YYYY: (datum) => String(datum.getFullYear()),
};

/** Popis oznaka za napomenu u formi. */
export const OZNAKE = [
  ['{MM}', 'mjesec s vodećom nulom (01–12)'],
  ['{M}', 'mjesec bez nule (1–12)'],
  ['{YYYY}', 'godina, 4 znamenke'],
  ['{YY}', 'godina, 2 znamenke'],
];

/** Ima li tekst ijednu oznaku? */
export const imaOznake = (tekst) => new RegExp(UZORAK.source).test(String(tekst ?? ''));

/**
 * Zamijeni oznake datumom. Ako datuma nema ili nije ispravan, tekst se vraća
 * nepromijenjen — bolje vidljivo `{MM}` u barkodu nego izmišljen mjesec.
 */
export function razrijesiPredlozak(tekst, datumIso) {
  const izvorno = String(tekst ?? '');
  if (!izvorno || !datumIso) return izvorno;

  const datum = parseIso(datumIso);
  if (Number.isNaN(datum.getTime())) return izvorno;

  return izvorno.replace(UZORAK, (_, oznaka) => vrijednost[oznaka](datum));
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
    poziv_na_broj: razrijesiPredlozak(uplatnica.poziv_na_broj, uplatnica.next_due),
  };
}
