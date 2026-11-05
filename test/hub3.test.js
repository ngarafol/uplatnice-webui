import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  zaBarkod,
  buildPayload,
  formatAmount,
  formatAmountField,
  isValidIban,
  parseAmount,
  validate,
  parsePayload,
} from '../hub3.js';
import {
  arhivirajNacin,
  dodajNacin,
  naciniKorisnika,
  openDb,
  uplatnicaZaKorisnika,
} from '../db.js';

const SAMPLE = {
  payerName: 'nikola hujko',
  payerAddress: 'kh21',
  payerCity: 'vzd',
  payeeName: 'drug tito',
  payeeAddress: 'bb',
  payeeCity: 'zgb',
  iban: 'HR6710010051738712003',
  model: 'HR68',
  reference: '1511-111',
  amountCents: 7000,
  currency: 'EUR',
  purposeCode: '',
  description: 'prijenos',
};

test('payload ima točno 14 pozicija, prazna šifra namjene ostaje prazan red', () => {
  const lines = buildPayload(SAMPLE).split('\n');
  assert.equal(lines.at(-1), '', 'payload završava s \\n');
  assert.equal(lines.length - 1, 14);
  assert.equal(lines[0], 'HRVHUB30');
  assert.equal(lines[12], '', 'šifra namjene je prazna, ali pozicija postoji');
  assert.equal(lines[13], 'PRIJENOS');
});

test('snapshot payloada za uplatnicu s priloga', () => {
  assert.equal(
    buildPayload(SAMPLE),
    [
      'HRVHUB30',
      'EUR',
      '000000000007000',
      'NIKOLA HUJKO',
      'KH21',
      'VZD',
      'DRUG TITO',
      'BB',
      'ZGB',
      'HR6710010051738712003',
      'HR68',
      '1511-111',
      '',
      'PRIJENOS',
      '',
    ].join('\n'),
  );
});

test('IBAN mod-97 prihvaća valjane i odbija nevaljane', () => {
  assert.ok(isValidIban('HR6710010051738712003'));
  assert.ok(isValidIban('GB82WEST12345698765432'));
  assert.ok(isValidIban('DE89 3704 0044 0532 0130 00'));
  assert.ok(!isValidIban('HR6710010051738712004'), 'promijenjena znamenka mora pasti');
  assert.ok(!isValidIban('HR5041240000000000000'), 'kontrolni IBAN nije valjan');
  assert.ok(!isValidIban('HR67'), 'prekratak');
});

test('iznos: centi su integer, format je 15 znamenki', () => {
  assert.equal(parseAmount('70,00'), 7000);
  assert.equal(parseAmount('1235.5'), 123550);
  assert.equal(formatAmount(7000), '70,00');
  assert.equal(formatAmountField(7000), '000000000007000');
  assert.throws(() => parseAmount('70,005'), /Neispravan iznos/);
  assert.throws(() => parseAmount('-5'), /Neispravan iznos/);
  assert.throws(() => formatAmountField(0), /Iznos/);
});

test('gornja granica iznosa odgovara 15 znamenki u barkodu', () => {
  // 9.999.999.999.999,99 EUR = 999999999999999 centi = 15 znamenki
  assert.equal(formatAmountField(999_999_999_999_999), '999999999999999');
  assert.equal(parseAmount('9999999999999,99'), 999_999_999_999_999);
  assert.throws(() => formatAmountField(1_000_000_000_000_000), /Iznos/);
  assert.throws(() => parseAmount('99999999999999,99'), /Neispravan iznos/);
});

test('barkod čuva hrvatsku dijakritiku, a odbacuje nedozvoljene znakove', () => {
  assert.equal(zaBarkod('Šećer i kolači'), 'ŠEĆER I KOLAČI');
  assert.equal(zaBarkod('Đuro Đaković d.o.o.'), 'ĐURO ĐAKOVIĆ D.O.O.');
  assert.equal(zaBarkod('  više   razmaka  '), 'VIŠE RAZMAKA');
  // dozvoljeno po uputi: , . : - + ? ' / ( )
  assert.equal(zaBarkod("A+B?C:D-E/F(G) 'x', y."), "A+B?C:D-E/F(G) 'X', Y.");
  // nedozvoljeno se zamjenjuje razmakom
  assert.equal(zaBarkod('račun & plaćeno; 100%'), 'RAČUN PLAĆENO 100');
});

test('validacija odbija neispravne uplatnice umjesto da ih tiho skrati', () => {
  assert.ok(!validate({ ...SAMPLE, iban: 'HR0000000000000000000' }).ok);
  assert.ok(!validate({ ...SAMPLE, amountCents: 0 }).ok);
  assert.ok(!validate({ ...SAMPLE, model: 'X99' }).ok);
  assert.ok(!validate({ ...SAMPLE, payeeName: 'x'.repeat(36) }).ok, 'predugo ime se odbija');
  assert.ok(!validate({ ...SAMPLE, reference: '1511-ABC' }).ok, 'slova u pozivu na broj');
  assert.equal(
    validate({ ...SAMPLE, reference: '1511 111' }).fields.reference,
    '1511111',
    'razmaci se uklanjaju, a ne odbijaju',
  );
  assert.ok(validate({ ...SAMPLE, purposeCode: 'COST' }).ok);
});

test('vlasnik vidi svoju uplatnicu, drugi korisnik tek nakon dijeljenja', () => {
  const db = openDb(':memory:');
  const now = new Date().toISOString();
  const addUser = db.prepare(
    'INSERT INTO user (email, pass_hash, name, address, city, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const ana = Number(addUser.run('ana@example.com', 'x', 'Ana', 'Ulica 1', 'Zagreb', now).lastInsertRowid);
  const boris = Number(addUser.run('boris@example.com', 'x', 'Boris', 'Ulica 2', 'Split', now).lastInsertRowid);

  const uplatnicaId = Number(
    db
      .prepare(
        `INSERT INTO uplatnica (owner_id, label, prim_name, prim_address, prim_city, iban, model,
           poziv_na_broj, iznos_cents, sifra_namjene, opis, created_at, updated_at)
         VALUES (?, 'Struja', 'HEP', 'Ulica 3', 'Zagreb', 'HR6710010051738712003', 'HR68',
           '1511-111', 7000, '', 'prijenos', ?, ?)`,
      )
      .run(ana, now, now).lastInsertRowid,
  );

  assert.ok(uplatnicaZaKorisnika(db, uplatnicaId, ana), 'vlasnik vidi');
  assert.equal(uplatnicaZaKorisnika(db, uplatnicaId, boris), undefined, 'nepozvan ne vidi');

  db.prepare('INSERT INTO share (uplatnica_id, user_id) VALUES (?, ?)').run(uplatnicaId, boris);
  const shared = uplatnicaZaKorisnika(db, uplatnicaId, boris);
  assert.ok(shared, 'nakon dijeljenja vidi');
  assert.equal(shared.is_owner, 0, 'nije vlasnik');

  db.close();
});

test('načini plaćanja: duplikat se odbija, a arhiviranje čuva naziv u povijesti', () => {
  const db = openDb(':memory:');
  const now = new Date().toISOString();
  const uid = Number(
    db
      .prepare('INSERT INTO user (email, pass_hash, name, address, city, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('n@example.com', 'h', 'N', 'A', 'B', now).lastInsertRowid,
  );

  dodajNacin(db, uid, 'Gotovina');
  assert.throws(() => dodajNacin(db, uid, 'gotovina'), /UNIQUE/, 'isti naziv u drugoj veličini slova');

  const [nacin] = naciniKorisnika(db, uid);
  assert.equal(nacin.naziv, 'Gotovina');

  arhivirajNacin(db, uid, nacin.id);
  assert.equal(naciniKorisnika(db, uid).length, 0, 'arhivirani se više ne nudi');

  const uplatnicaId = Number(
    db
      .prepare(
        `INSERT INTO uplatnica (owner_id, label, prim_name, prim_address, prim_city, iban, model,
           poziv_na_broj, iznos_cents, sifra_namjene, opis, created_at, updated_at)
         VALUES (?, 'T', 'P', 'A', 'B', 'HR6710010051738712003', 'HR68', '1', 100, '', '', ?, ?)`,
      )
      .run(uid, now, now).lastInsertRowid,
  );
  db.prepare('INSERT INTO placanje (uplatnica_id, paid_at, iznos_cents, poziv_na_broj, nacin_id) VALUES (?, ?, ?, ?, ?)')
    .run(uplatnicaId, now, 100, '1', nacin.id);

  const povijest = db
    .prepare('SELECT n.naziv FROM placanje p LEFT JOIN nacin_placanja n ON n.id = p.nacin_id')
    .get();
  assert.equal(povijest.naziv, 'Gotovina', 'stara uplata zadržava naziv načina');

  db.close();
});

test('dužine polja po službenoj uputi (HUB v6, tablica 1)', () => {
  assert.ok(validate({ ...SAMPLE, payerName: 'x'.repeat(30) }).ok, 'platitelj 30');
  assert.ok(!validate({ ...SAMPLE, payerName: 'x'.repeat(31) }).ok);
  assert.ok(validate({ ...SAMPLE, payerAddress: 'x'.repeat(27) }).ok);
  assert.ok(!validate({ ...SAMPLE, payerAddress: 'x'.repeat(28) }).ok);
  // Namjerno iznad specifikacije (25): stvarne uplatnice prelaze taj limit, a
  // banke ih prihvaćaju. Vidi komentar uz LIMITS.
  assert.ok(validate({ ...SAMPLE, payeeName: 'x'.repeat(35) }).ok, 'primatelj 35');
  assert.ok(!validate({ ...SAMPLE, payeeName: 'x'.repeat(36) }).ok);
  assert.ok(validate({ ...SAMPLE, payeeAddress: 'x'.repeat(35) }).ok);
  assert.ok(!validate({ ...SAMPLE, payeeAddress: 'x'.repeat(36) }).ok);
  assert.ok(validate({ ...SAMPLE, payeeCity: 'x'.repeat(27) }).ok);
  assert.ok(!validate({ ...SAMPLE, payeeCity: 'x'.repeat(28) }).ok);
  assert.ok(validate({ ...SAMPLE, reference: '1'.repeat(22) }).ok);
  assert.ok(!validate({ ...SAMPLE, reference: '1'.repeat(23) }).ok);
  assert.ok(validate({ ...SAMPLE, description: 'x'.repeat(35) }).ok);
  assert.ok(!validate({ ...SAMPLE, description: 'x'.repeat(36) }).ok);
});

test('payload: buildPayload pa parsePayload vraća ista polja', () => {
  const ulaz = {
    payerName: 'Ivan Ivić',
    payerAddress: 'Ilica 10',
    payerCity: 'Zagreb',
    payeeName: 'Sportska abeceda',
    payeeAddress: 'bb',
    payeeCity: 'vzd',
    iban: 'HR6723600001102219379',
    model: 'HR00',
    reference: '122025-1328',
    amountCents: 4000,
    currency: 'EUR',
    purposeCode: '',
    description: 'clanarina 12/25',
  };
  const natrag = parsePayload(buildPayload(ulaz));
  assert.equal(natrag.amountCents, 4000);
  assert.equal(natrag.iban, 'HR6723600001102219379');
  assert.equal(natrag.model, 'HR00');
  assert.equal(natrag.reference, '122025-1328');
  // Barkod normalizira tekst u velika slova, pa se imena uspoređuju tako.
  assert.equal(natrag.payeeName, 'SPORTSKA ABECEDA');
  assert.equal(natrag.description, 'CLANARINA 12/25');
});

test('payload: parsePayload odbija ono što nije HUB 3A barkod', () => {
  assert.throws(() => parsePayload('nije barkod'), /nije HUB 3A/);
  assert.throws(() => parsePayload('HRVHUB30\nEUR'), /nema svih 14 polja/);
  assert.throws(
    () => parsePayload('HRVHUB30\nEUR\n000000000000000\na\nb\nc\nd\ne\nf\nHR1\nHR00\n1\n\nopis'),
    /Iznos .* nije ispravan/,
  );
});

test('payload: parsePayload trpi CRLF i završni novi red', () => {
  const payload = buildPayload({
    payerName: 'A B', payerAddress: 'C 1', payerCity: 'D',
    payeeName: 'E F', payeeAddress: 'G 2', payeeCity: 'H',
    iban: 'HR6723600001102219379', model: 'HR00', reference: '1-2',
    amountCents: 12345, currency: 'EUR', purposeCode: '', description: 'x',
  });
  const natrag = parsePayload(payload.replace(/\n/g, '\r\n'));
  assert.equal(natrag.amountCents, 12345);
  assert.equal(natrag.description, 'X');
});
