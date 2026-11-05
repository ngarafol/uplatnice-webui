/**
 * Pretplata na kalendar (ICS) za ponavljajuće uplatnice.
 *
 * Kalendarske aplikacije ne šalju kolačiće ni prijavu, pa se feed dohvaća preko
 * tajne adrese (`?token=`). Feed ne sadrži ništa što korisnik već ne zna — samo
 * njegove uplatnice — ali token se ipak ponaša kao lozinka i ne smije u logove.
 */
import { formatAmount } from './hub3.js';
import { addInterval } from './recurring.js';

/** Koliko uzastopnih dospijeća ide u kalendar (kalendar se osvježava rijetko). */
const KOLIKO = 3;

const datum = (iso) => iso.replace(/-/g, '');

const pecat = (d) =>
  `${d.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;

/** Tekst u ICS-u: backslash, točka-zarez, zarez i novi red moraju se escapati. */
export function icsTekst(vrijednost) {
  return String(vrijednost ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * ICS dopušta najviše 75 okteta po retku; dalje se prelama s početnim razmakom.
 * Prelama se po znakovima, jer hrvatski znakovi zauzimaju 2 okteta.
 */
export function savij(linija) {
  if (Buffer.byteLength(linija, 'utf8') <= 75) return linija;

  const dijelovi = [];
  let trenutni = '';
  let octeti = 0;
  for (const znak of linija) {
    const velicina = Buffer.byteLength(znak, 'utf8');
    if (octeti + velicina > 73) {
      dijelovi.push(trenutni);
      trenutni = '';
      octeti = 0;
    }
    trenutni += znak;
    octeti += velicina;
  }
  if (trenutni) dijelovi.push(trenutni);
  return dijelovi.join('\r\n ');
}

function opisDogadjaja(uplatnica) {
  const dijelovi = [uplatnica.prim_name, uplatnica.iban];
  if (uplatnica.poziv_na_broj) dijelovi.push(`Poziv: ${uplatnica.poziv_na_broj}`);
  return dijelovi.filter(Boolean).join('\n');
}

/**
 * @param {object[]} uplatnice ponavljajuće uplatnice, sortirane po dospijeću
 * @returns {string} sadržaj .ics datoteke
 */
export function generirajKalendar(uplatnice, { sada = new Date() } = {}) {
  const dogadjaji = [];

  for (const u of uplatnice) {
    if (!u.next_due || !u.interval_unit || !u.interval_count) continue;

    let dan = u.next_due;
    for (let i = 0; i < KOLIKO; i += 1) {
      dogadjaji.push({
        dan,
        linije: [
          'BEGIN:VEVENT',
          `UID:uplatnica-${u.id}-${dan}@uplatnice`,
          `DTSTAMP:${pecat(sada)}`,
          `DTSTART;VALUE=DATE:${datum(dan)}`,
          `SUMMARY:${icsTekst(`${u.label} — ${formatAmount(u.iznos_cents)} EUR`)}`,
          `DESCRIPTION:${icsTekst(opisDogadjaja(u))}`,
          'TRANSP:TRANSPARENT',
          'BEGIN:VALARM',
          'TRIGGER:-P1D',
          'ACTION:DISPLAY',
          `DESCRIPTION:${icsTekst(`Sutra dospijeva: ${u.label}`)}`,
          'END:VALARM',
          'END:VEVENT',
        ],
      });
      dan = addInterval(dan, u.interval_unit, u.interval_count);
    }
  }

  dogadjaji.sort((a, b) => (a.dan < b.dan ? -1 : a.dan > b.dan ? 1 : 0));

  const linije = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Uplatnice//HUB 3A//HR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Uplatnice',
    'X-WR-CALDESC:Dospijeća ponavljajućih uplatnica',
    ...dogadjaji.flatMap((d) => d.linije),
    'END:VCALENDAR',
  ];

  return `${linije.map(savij).join('\r\n')}\r\n`;
}
