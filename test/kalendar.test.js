import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generirajKalendar, icsTekst, savij } from '../kalendar.js';

const UPLATNICA = {
  id: 1,
  label: 'Struja',
  prim_name: 'HEP d.o.o.',
  iban: 'HR6710010051738712003',
  poziv_na_broj: '1511-111',
  iznos_cents: 7000,
  next_due: '2026-12-05',
  interval_unit: 'mjesec',
  interval_count: 1,
};

test('ics: escapaju se zarez, točka-zarez, backslash i novi red', () => {
  assert.equal(icsTekst('a,b;c\\d'), 'a\\,b\\;c\\\\d');
  assert.equal(icsTekst('prvi\ndrugi'), 'prvi\\ndrugi');
});

test('ics: dugačak redak se prelama na 75 okteta', () => {
  const kratak = 'KRATKO';
  assert.equal(savij(kratak), kratak);

  const dug = 'Č'.repeat(100); // svaki znak je 2 okteta
  const savijeno = savij(dug);
  for (const red of savijeno.split('\r\n')) {
    assert.ok(Buffer.byteLength(red, 'utf8') <= 75, `redak predugačak: ${red.length}`);
  }
  assert.equal(savijeno.replace(/\r\n /g, ''), dug, 'sadržaj se ne smije izgubiti');
});

test('ics: ponavljajuća uplatnica daje tri događaja', () => {
  const ics = generirajKalendar([UPLATNICA], { sada: new Date('2026-11-05T00:00:00Z') });

  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(ics, /DTSTART;VALUE=DATE:20261205/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270105/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270205/);
  // zarez se u ICS-u escapira, pa u datoteci piše 70\,00
  assert.match(ics, /SUMMARY:Struja — 70\\,00 EUR/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('ics: preskače uplatnice bez ponavljanja i bez dospijeća', () => {
  const jednokratna = { ...UPLATNICA, id: 2, interval_unit: null };
  const bezDatuma = { ...UPLATNICA, id: 3, next_due: null };
  const ics = generirajKalendar([jednokratna, bezDatuma]);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 0);
  assert.match(ics, /BEGIN:VCALENDAR/);
});

test('ics: događaji su sortirani po datumu', () => {
  const kasnija = { ...UPLATNICA, id: 9, label: 'Kasnija', next_due: '2027-03-01' };
  const ranija = { ...UPLATNICA, id: 8, label: 'Ranija', next_due: '2026-12-01' };
  const ics = generirajKalendar([kasnija, ranija]);
  assert.ok(ics.indexOf('Ranija') < ics.indexOf('Kasnija'));
});
