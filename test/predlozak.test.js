import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imaOznake, razrijesiPredlozak, razrijesiUplatnicu } from '../predlozak.js';

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
