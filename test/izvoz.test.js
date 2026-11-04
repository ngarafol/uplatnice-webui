import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportFile, jsonToBody, parseExportFile, uplatnicaToJson } from '../izvoz.js';

const REDAK = {
  label: 'Struja',
  prim_name: 'HEP d.o.o.',
  prim_address: 'Ulica grada Vukovara 37',
  prim_city: 'Zagreb',
  iban: 'HR6710010051738712003',
  model: 'HR68',
  poziv_na_broj: '1511-111',
  iznos_cents: 7000,
  sifra_namjene: '',
  opis: 'Uplata za 11. mjesec',
  interval_unit: 'mjesec',
  interval_count: 1,
  next_due: '2026-11-05',
};

test('izvoz: redak iz baze pretvara se u zapis s hrvatskim imenima polja', () => {
  const z = uplatnicaToJson(REDAK);
  assert.equal(z.oznaka, 'Struja');
  assert.equal(z.primatelj.naziv, 'HEP d.o.o.');
  assert.equal(z.primatelj.grad, 'Zagreb');
  assert.equal(z.iznos_cents, 7000);
  assert.deepEqual(z.ponavljanje, { jedinica: 'mjesec', svakih: 1, sljedece: '2026-11-05' });
});

test('izvoz: jednokratna uplatnica ima ponavljanje null', () => {
  const z = uplatnicaToJson({ ...REDAK, interval_unit: null });
  assert.equal(z.ponavljanje, null);
});

test('round-trip: izvoz pa uvoz daje ista polja', () => {
  const datoteka = exportFile([REDAK], '2026-11-05T00:00:00.000Z');
  const procitano = parseExportFile(JSON.stringify(datoteka));
  assert.ok(procitano.ok);
  const tijelo = procitano.tijela[0];
  assert.equal(tijelo.label, REDAK.label);
  assert.equal(tijelo.prim_name, REDAK.prim_name);
  assert.equal(tijelo.prim_address, REDAK.prim_address);
  assert.equal(tijelo.iban, REDAK.iban);
  assert.equal(tijelo.model, REDAK.model);
  assert.equal(tijelo.poziv_na_broj, REDAK.poziv_na_broj);
  assert.equal(tijelo.iznos, '70'); // 7000 centi -> "70"
  assert.equal(tijelo.opis, REDAK.opis);
  assert.equal(tijelo.interval_unit, 'mjesec');
  assert.equal(tijelo.interval_count, 1);
  assert.equal(tijelo.next_due, '2026-11-05');
});

test('uvoz: prihvaća i golu listu (ručno sastavljena datoteka)', () => {
  const procitano = parseExportFile(JSON.stringify([uplatnicaToJson(REDAK)]));
  assert.ok(procitano.ok);
  assert.equal(procitano.tijela.length, 1);
});

test('uvoz: iznos se može dati i kao tekst umjesto centi', () => {
  const tijelo = jsonToBody({ oznaka: 'X', iznos: '70,00' });
  assert.equal(tijelo.iznos, '70,00');
});

test('uvoz: odbija neispravan JSON, krivi format i prazan popis', () => {
  assert.equal(parseExportFile('nije json').ok, false);
  assert.match(parseExportFile('nije json').greska, /nije ispravan JSON/);

  const krivi = parseExportFile(JSON.stringify({ format: 'drugi', uplatnice: [] }));
  assert.equal(krivi.ok, false);
  assert.match(krivi.greska, /Nepoznat format/);

  const prazan = parseExportFile(JSON.stringify({ format: 'uplatnice-webui', uplatnice: [] }));
  assert.equal(prazan.ok, false);
  assert.match(prazan.greska, /ne sadrži nijednu/);

  const bezPopisa = parseExportFile(JSON.stringify({ format: 'uplatnice-webui' }));
  assert.equal(bezPopisa.ok, false);
});
