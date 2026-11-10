/**
 * Svaka stranica se mora moći iscrtati bez ReferenceErrora. Ovaj test bi uhvatio
 * slučaj u kojem je polje dodano u pogrešan predložak — greška se inače vidi tek
 * kad korisnik otvori tu stranicu.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detaljPage,
  formaPage,
  listaPage,
  platiPage,
  postavkePage,
  povijestPage,
  prijavaPage,
  registracijaPage,
  uvozPage,
} from '../views.js';

const KORISNIK = { id: 1, email: 'a@b.hr', name: 'A B', address: 'Ulica 1', city: '10000 Grad' };
const UPLATNICA = {
  id: 1,
  owner_id: 1,
  is_owner: 1,
  label: 'Struja',
  prim_name: 'HEP',
  prim_address: 'Ulica 2',
  prim_city: '10000 Grad',
  iban: 'HR6723600001102219379',
  model: 'HR68',
  poziv_na_broj: '1-2',
  iznos_cents: 7000,
  sifra_namjene: '',
  opis: 'Test',
  interval_unit: 'mjesec',
  interval_count: 1,
  next_due: '2026-11-20',
  archived: 0,
  created_at: '2026-01-01',
};

const iscrtaj = (stranica, marker) => {
  const html = String(stranica);
  assert.ok(html.includes(marker), `nedostaje "${marker}"`);
  assert.ok(!html.includes('undefined'), 'u HTML-u se pojavljuje "undefined"');
};

test('stranice se renderiraju bez greške', () => {
  iscrtaj(prijavaPage(), 'Prijava');
  iscrtaj(registracijaPage(), 'Registracija');
  iscrtaj(registracijaPage({ traziKod: true }), 'Kod za registraciju');
  iscrtaj(postavkePage({ values: KORISNIK, user: KORISNIK }), 'Lozinka');
  iscrtaj(uvozPage({ user: KORISNIK }), 'Sa slike barkoda');
  iscrtaj(
    listaPage({
      uplatnice: [UPLATNICA],
      user: KORISNIK,
      sazetak: { placeno: { broj: 0, ukupno: 0 }, otvoreno: { broj: 1, ukupno: 7000, kasni: 0 } },
      mjesec: '2026-11',
    }),
    'Struja',
  );
  iscrtaj(formaPage({ mode: 'nova', values: {}, user: KORISNIK }), 'Nova uplatnica');
  iscrtaj(detaljPage({ uplatnica: UPLATNICA, payments: [], user: KORISNIK }), 'Struja');
  iscrtaj(platiPage({ uplatnica: UPLATNICA, user: KORISNIK, nacini: [] }), 'Označi kao plaćeno');
  iscrtaj(povijestPage({ mjeseci: [], user: KORISNIK }), 'Povijest');
});

test('prijava ne traži kod za registraciju', () => {
  const html = String(prijavaPage());
  assert.ok(!html.includes('Kod za registraciju'), 'kod ne smije biti na prijavi');
});
