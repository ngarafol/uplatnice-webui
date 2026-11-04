/**
 * Izvoz i uvoz uplatnica u JSON-u.
 *
 * Format je vlastit i dokumentiran; nije binarno kompatibilan s drugim
 * generatorima uplatnica. Služi za prijenos između instanci i za ručnu izradu
 * datoteke — zato su imena polja hrvatska i iznos je cijeli broj centi.
 *
 * Uvoz ne validira sam: pretvara JSON u "body" kakav šalje forma, pa ga
 * propušta kroz readUplatnicaForm(). Tako uvoz i ručni unos dijele ista pravila
 * (IBAN mod-97, dužine polja, model, interval) i ne mogu se razići.
 */

export const IZVOZ_FORMAT = 'uplatnice-webui';
export const IZVOZ_VERSION = 1;

/** Redak iz baze -> jedan zapis u datoteci. */
export function uplatnicaToJson(uplatnica) {
  return {
    oznaka: uplatnica.label,
    primatelj: {
      naziv: uplatnica.prim_name,
      adresa: uplatnica.prim_address,
      grad: uplatnica.prim_city,
    },
    iban: uplatnica.iban,
    model: uplatnica.model,
    poziv_na_broj: uplatnica.poziv_na_broj,
    iznos_cents: uplatnica.iznos_cents,
    sifra_namjene: uplatnica.sifra_namjene,
    opis: uplatnica.opis,
    ponavljanje: uplatnica.interval_unit
      ? {
          jedinica: uplatnica.interval_unit,
          svakih: uplatnica.interval_count,
          sljedece: uplatnica.next_due,
        }
      : null,
  };
}

/** Cijela datoteka za izvoz. */
export function exportFile(uplatnice, izvezeno = new Date().toISOString()) {
  return {
    format: IZVOZ_FORMAT,
    version: IZVOZ_VERSION,
    izvezeno,
    uplatnice: uplatnice.map(uplatnicaToJson),
  };
}

const text = (value) => (value === null || value === undefined ? '' : String(value).trim());

/**
 * Jedan zapis iz datoteke -> "body" kakav šalje forma.
 * Prihvaća `iznos_cents` (kako izvoz piše) ili `iznos` kao tekst za ručni unos.
 */
export function jsonToBody(zapis) {
  const primatelj = zapis?.primatelj ?? {};
  const ponavljanje = zapis?.ponavljanje ?? null;
  const iznos =
    zapis?.iznos_cents !== undefined && zapis?.iznos_cents !== null
      ? Number(zapis.iznos_cents) / 100
      : text(zapis?.iznos);

  return {
    label: text(zapis?.oznaka),
    prim_name: text(primatelj.naziv),
    prim_address: text(primatelj.adresa),
    prim_city: text(primatelj.grad),
    iban: text(zapis?.iban),
    model: text(zapis?.model),
    poziv_na_broj: text(zapis?.poziv_na_broj),
    sifra_namjene: text(zapis?.sifra_namjene),
    opis: text(zapis?.opis),
    // Number -> parseAmount očekuje tekst s decimalom; točka je prihvaćena.
    iznos: iznos === '' ? '' : String(iznos),
    interval_unit: text(ponavljanje?.jedinica),
    interval_count: ponavljanje?.svakih ?? 1,
    next_due: text(ponavljanje?.sljedece),
  };
}

/**
 * uplatime.com sprema JEDNU uplatnicu kao ravan objekt s poljima spojenim
 * dvostrukom donjom crtom (platitelj__ime, primatelj__iban, ...). Prepoznajemo
 * ga po tim ključevima, da se ne mora ručno prepisivati.
 */
export function isUplatimeCom(zapis) {
  return (
    zapis !== null &&
    typeof zapis === 'object' &&
    !Array.isArray(zapis) &&
    ('primatelj__iban' in zapis || 'primatelj__pozivNaBroj' in zapis || 'platitelj__ime' in zapis)
  );
}

/** Zapis iz uplatime.com -> "body" kakav šalje naša forma. */
export function uplatimeComToBody(zapis) {
  return {
    // "naziv" je oznaka koju je korisnik dao uplatnici; ako je nema, uzmi
    // naziv primatelja da oznaka ne bude prazna.
    label: text(zapis.naziv) || text(zapis.primatelj__ime),
    prim_name: text(zapis.primatelj__ime),
    prim_address: text(zapis.primatelj__adresa),
    prim_city: text(zapis.primatelj__gradMjesto),
    iban: text(zapis.primatelj__iban),
    model: text(zapis.primatelj__model),
    poziv_na_broj: text(zapis.primatelj__pozivNaBroj),
    sifra_namjene: text(zapis.sifra__namjene),
    opis: text(zapis.opis_placanja),
    iznos: text(zapis.iznos),
    interval_unit: '',
    interval_count: 1,
    next_due: '',
  };
}

/**
 * Pročita datoteku i vrati popis "body" objekata.
 * @returns {{ ok: true, tijela: object[] } | { ok: false, greska: string }}
 */
export function parseExportFile(tekst) {
  let podaci;
  try {
    podaci = JSON.parse(String(tekst ?? ''));
  } catch {
    return { ok: false, greska: 'Datoteka nije ispravan JSON.' };
  }

  // uplatime.com: jedan zapis s ravnim poljima.
  if (isUplatimeCom(podaci)) {
    return { ok: true, tijela: [uplatimeComToBody(podaci)] };
  }

  // Prihvaćamo i golu listu, za ručno sastavljene datoteke.
  const lista = Array.isArray(podaci) ? podaci : podaci?.uplatnice;

  if (!Array.isArray(lista)) {
    return { ok: false, greska: 'U datoteci nema popisa uplatnica („uplatnice“).' };
  }
  if (!Array.isArray(podaci) && podaci.format !== IZVOZ_FORMAT) {
    return { ok: false, greska: `Nepoznat format datoteke (očekivano „${IZVOZ_FORMAT}“).` };
  }
  if (!lista.length) {
    return { ok: false, greska: 'Datoteka ne sadrži nijednu uplatnicu.' };
  }

  if (lista.every(isUplatimeCom)) {
    return { ok: true, tijela: lista.map(uplatimeComToBody) };
  }

  return { ok: true, tijela: lista.map(jsonToBody) };
}
