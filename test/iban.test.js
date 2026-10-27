import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatIban,
  ibanExpectedLength,
  isValidIban,
  normalizeIban,
} from '../public/iban.js';

test('IBAN: normalizacija i čitljiv zapis u grupama po četiri', () => {
  assert.equal(normalizeIban(' hr67 1001 0051 7387 12003 '), 'HR6710010051738712003');
  assert.equal(formatIban('HR6710010051738712003'), 'HR67 1001 0051 7387 1200 3');
  assert.equal(formatIban('hr6710010051738712003'), 'HR67 1001 0051 7387 1200 3');
  assert.equal(formatIban(''), '');
});

test('IBAN: kontrolne znamenke (mod-97) za hrvatske i strane račune', () => {
  assert.ok(isValidIban('HR6710010051738712003'));
  assert.ok(isValidIban('DE89370400440532013000'), 'Njemačka');
  assert.ok(isValidIban('AT611904300234573201'), 'Austrija');
  assert.ok(isValidIban('SI56191000000123438'), 'Slovenija');
  assert.ok(isValidIban('NL91ABNA0417164300'), 'Nizozemska');
  assert.ok(isValidIban('FR1420041010050500013M02606'), 'Francuska (slova u BBAN-u)');
  assert.ok(isValidIban('IT60X0542811101000000123456'), 'Italija');
  assert.ok(isValidIban('GB82 WEST 1234 5698 7654 32'), 'razmaci ne smetaju');

  assert.ok(!isValidIban('HR6710010051738712004'), 'promijenjena znamenka');
  assert.ok(!isValidIban('DE89370400440532013001'), 'strana, promijenjena znamenka');
  assert.ok(!isValidIban('HR67100100517387120'), 'prekratak HR IBAN');
  assert.ok(!isValidIban('HR'), 'prekratko');
  assert.ok(!isValidIban(''), 'prazno');
});

test('IBAN: duljina se provjerava po registru država', () => {
  assert.equal(ibanExpectedLength('HR6710010051738712003'), 21);
  assert.equal(ibanExpectedLength('DE89370400440532013000'), 22);
  assert.equal(ibanExpectedLength('AT611904300234573201'), 20);
  assert.equal(ibanExpectedLength('SI56191000000123438'), 19);
  assert.equal(ibanExpectedLength('NL91ABNA0417164300'), 18);
  assert.ok(!isValidIban('DE8937040044053201300'), 'kriva duljina za DE');
});

test('IBAN: država koje nema u registru prolazi generičku provjeru', () => {
  assert.equal(ibanExpectedLength('XX0812345678901'), null, 'nije u registru');
  assert.ok(isValidIban('XX0812345678901'), 'generička provjera i dalje vrijedi');
  assert.ok(!isValidIban('XX0912345678901'), 'ali kontrolne znamenke moraju biti točne');
});
