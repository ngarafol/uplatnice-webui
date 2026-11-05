import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  imaOznake,
  mod11ini,
  razrijesiPozivNaBroj,
  razrijesiPredlozak,
  razrijesiUplatnicu,
} from '../predlozak.js';

test('predložak: mjesec i godina iz datuma dospijeća', () => {
  assert.equal(razrijesiPredlozak('clanarina {MM}/{YY}', '2025-12-05'), 'clanarina 12/25');
  assert.equal(razrijesiPredlozak('{MM}{YYYY}-1328', '2025-12-05'), '122025-1328');
  assert.equal(razrijesiPredlozak('{M}/{YYYY}', '2026-01-15'), '1/2026');
  assert.equal(razrijesiPredlozak('{MM}/{YY}', '2026-01-15'), '01/26');
});

test('predložak: bez oznaka, bez datuma i nepoznate oznake ostaju kako jesu', () => {
  assert.equal(razrijesiPredlozak('običan opis', '2025-12-05'), 'običan opis');
  assert.equal(razrijesiPredlozak('{MM}/{YY}', null), '{MM}/{YY}');
  assert.equal(razrijesiPredlozak('{MM}/{YY}', 'nije-datum'), '{MM}/{YY}');
  assert.equal(razrijesiPredlozak('{XYZ} {MM}', '2025-12-05'), '{XYZ} 12');
  assert.equal(razrijesiPredlozak('', '2025-12-05'), '');
});

test('predložak: prepoznavanje oznaka', () => {
  assert.ok(imaOznake('{MM}'));
  assert.ok(imaOznake('{YYYY}'));
  assert.ok(!imaOznake('običan tekst'));
  assert.ok(!imaOznake('{xyz}'));
});

test('predložak: razrješava i opis i poziv na broj', () => {
  const u = razrijesiUplatnicu({
    opis: 'clanarina {MM}/{YY}',
    poziv_na_broj: '{MM}{YYYY}-1328',
    next_due: '2025-12-05',
    label: 'tts',
  });
  assert.equal(u.opis, 'clanarina 12/25');
  assert.equal(u.poziv_na_broj, '122025-1328');
  assert.equal(u.label, 'tts', 'ostala polja se ne diraju');
});

test('predložak: jednokratna uplatnica (bez datuma) vraća predložak nepromijenjen', () => {
  const u = razrijesiUplatnicu({ opis: 'x {MM}', poziv_na_broj: '{YY}-1', next_due: null });
  assert.equal(u.opis, 'x {MM}');
  assert.equal(u.poziv_na_broj, '{YY}-1');
});

test('kontrolni broj: MOD11INI na službenom primjeru i stvarnim uplatnicama', () => {
  assert.equal(mod11ini('2026789'), 4); // službeni primjer (2026-789-4)
  assert.equal(mod11ini('1887102601'), 2); // listopad 2026, iz barkoda
  assert.equal(mod11ini('1887112601'), 7); // studeni 2026, iz barkoda
  assert.equal(mod11ini('123456789012'), mod11ini('1234-5678-9012'), 'crtice se ignoriraju');
  assert.equal(mod11ini(''), null);
});

test('kontrolni broj: {KB} u predlošku poziva na broj', () => {
  assert.equal(razrijesiPozivNaBroj('1887{MM}2601-{KB}', '2026-10-15'), '1887102601-2');
  assert.equal(razrijesiPozivNaBroj('1887{MM}2601-{KB}', '2026-11-15'), '1887112601-7');
  assert.equal(razrijesiPozivNaBroj('18872601-{KB}', null), '18872601-2', 'KB ne treba datum');
  assert.equal(razrijesiPozivNaBroj('{KB}', '2026-10-15'), '{KB}', 'bez znamenki ostaje vidljivo');
  assert.equal(razrijesiPozivNaBroj('1234-5678', '2026-10-15'), '1234-5678');
});

test('kontrolni broj: razrijesiUplatnicu računa KB samo u pozivu', () => {
  const u = razrijesiUplatnicu({
    opis: 'clanarina {MM}/{YY}',
    poziv_na_broj: '1887{MM}2601-{KB}',
    next_due: '2026-11-20',
  });
  assert.equal(u.poziv_na_broj, '1887112601-7');
  assert.equal(u.opis, 'clanarina 11/26', 'u opisu nema računanja');
});
