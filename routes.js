/**
 * Sve rute. Server-rendered: POST → redirect → GET (PRG), nema JSON API-ja
 * jer nitko ga još ne zove.
 */
import express from 'express';
import { buildPayload, formatAmount, LIMITS, parseAmount, validate } from './hub3.js';
import { pdf417svg } from './barcode.js';
import { MIN_PASSWORD_LENGTH, clearSession, hashPassword, issueSession, requireLogin, verifyPassword } from './auth.js';
import {
  INTERVAL_UNITS,
  addInterval,
  advanceNextDue,
  lastDayOfMonth,
  monthKey,
  todayIso,
} from './recurring.js';
import {
  arhivirajNacin,
  dodajNacin,
  naciniKorisnika,
  povijestPoMjesecima,
  sazetakMjeseca,
  sharesZaUplatnicu,
  uplatnicaZaKorisnika,
  uplatniceZaKorisnika,
} from './db.js';
import { ispisPage } from './views-ispis.js';
import {
  detaljPage,
  dashboardPage,
  errorPage,
  formaPage,
  listaPage,
  notFoundPage,
  platiPage,
  postavkePage,
  povijestPage,
  prijavaPage,
  registracijaPage,
} from './views.js';

/** validate() imena polja -> imena polja u formi (i u bazi). */
const FORM_FIELD = {
  payeeName: 'prim_name',
  payeeAddress: 'prim_address',
  payeeCity: 'prim_city',
  amountCents: 'iznos',
  reference: 'poziv_na_broj',
  purposeCode: 'sifra_namjene',
  description: 'opis',
};

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));

/**
 * Kamо vratiti nakon akcije iz popisa. Prihvaća samo interni put —
 * inače bi se preko skrivenog polja moglo napraviti open redirect.
 */
function backTo(value, fallback) {
  const path = String(value ?? '');
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (path.includes('\\') || /[\s\r\n]/.test(path)) return fallback;
  return path;
}

/** Odakle se korisnik vratio, iz Referer zaglavlja (isto podrijetlo). */
function backFrom(req, fallback) {
  const referer = req.get('referer');
  if (!referer) return fallback;
  try {
    const url = new URL(referer);
    // Samo s naše domene — inače bi "natrag" vodio na proizvoljnu putanju.
    if (url.host !== req.get('host')) return fallback;
    return backTo(url.pathname + url.search, fallback);
  } catch {
    return fallback;
  }
}

/** Kolone koje dolaze iz forme. Jedan popis za INSERT i UPDATE da se ne raziđu. */
const UPLATNICA_KOLONE = [
  'label',
  'prim_name',
  'prim_address',
  'prim_city',
  'iban',
  'model',
  'poziv_na_broj',
  'iznos_cents',
  'sifra_namjene',
  'opis',
  'interval_unit',
  'interval_count',
  'next_due',
];
const UPLATNICA_PITANJA = UPLATNICA_KOLONE.map(() => '?').join(', ');
const uplatnicaVrijednosti = (record) => UPLATNICA_KOLONE.map((kolona) => record[kolona]);

const isIsoDate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));

/** Sastavlja ulaz za hub3.validate() iz retka uplatnice + profila platitelja. */
function payloadInput(user, uplatnica) {
  return {
    payerName: user.name,
    payerAddress: user.address,
    payerCity: user.city,
    payeeName: uplatnica.prim_name,
    payeeAddress: uplatnica.prim_address,
    payeeCity: uplatnica.prim_city,
    iban: uplatnica.iban,
    model: uplatnica.model,
    reference: uplatnica.poziv_na_broj,
    amountCents: uplatnica.iznos_cents,
    currency: 'EUR',
    purposeCode: uplatnica.sifra_namjene,
    description: uplatnica.opis,
  };
}

/**
 * Iz forme u zapis za bazu. Vraća { values, errors, record }.
 * Greške se vežu na imena polja iz forme da ih predložak može prikazati.
 */
function readUplatnicaForm(body, user) {
  const values = {
    label: String(body.label ?? '').trim(),
    prim_name: String(body.prim_name ?? '').trim(),
    prim_address: String(body.prim_address ?? '').trim(),
    prim_city: String(body.prim_city ?? '').trim(),
    iban: String(body.iban ?? '').trim(),
    model: String(body.model ?? '').trim().toUpperCase(),
    poziv_na_broj: String(body.poziv_na_broj ?? '').trim(),
    sifra_namjene: String(body.sifra_namjene ?? '').trim().toUpperCase(),
    opis: String(body.opis ?? '').trim(),
    interval_unit: String(body.interval_unit ?? '').trim(),
    interval_count: Number(body.interval_count ?? 1),
    next_due: String(body.next_due ?? '').trim(),
  };

  const errors = {};

  let amountCents;
  try {
    amountCents = parseAmount(body.iznos);
  } catch (e) {
    errors.iznos = 'Iznos upiši kao broj, npr. 70,00.';
  }
  values.iznos = String(body.iznos ?? '').trim();

  const recurring = INTERVAL_UNITS.includes(values.interval_unit);
  if (recurring) {
    if (!Number.isInteger(values.interval_count) || values.interval_count < 1 || values.interval_count > 60) {
      errors.interval_count = 'Broj mora biti između 1 i 60.';
    }
    const due = values.next_due || todayIso();
    if (!isIsoDate(due)) errors.next_due = 'Datum nije ispravan.';
    values.next_due = due;
  } else {
    values.interval_unit = null;
    values.interval_count = null;
    values.next_due = '';
  }

  if (!values.label) errors.label = 'Oznaka je obavezna.';

  // Ista imena polja kao u bazi: payloadInput() je jedino mjesto koje zna kako
  // se zapis prevodi u barkod, pa se ovdje ne smiju koristiti imena iz validate().
  const candidate = {
    prim_name: values.prim_name,
    prim_address: values.prim_address,
    prim_city: values.prim_city,
    iban: values.iban,
    model: values.model,
    poziv_na_broj: values.poziv_na_broj,
    iznos_cents: amountCents ?? 0,
    sifra_namjene: values.sifra_namjene,
    opis: values.opis,
  };
  const checked = validate(payloadInput(user, candidate));
  for (const error of checked.errors) {
    if (error.field === 'payerName' || error.field === 'payerAddress' || error.field === 'payerCity') {
      errors._ = 'Podaci o platitelju u profilu nisu ispravni — ispravi ih na stranici Profil.';
      continue;
    }
    if (error.field === 'currency') continue; // valuta je fiksna (EUR)
    const key = FORM_FIELD[error.field] ?? error.field;
    errors[key] ??= error.message;
  }

  if (Object.keys(errors).length) return { values, errors, record: null };

  return {
    values,
    errors: {},
    record: {
      ...values,
      iznos_cents: amountCents,
      interval_unit: values.interval_unit,
      interval_count: values.interval_count,
      next_due: values.interval_unit ? values.next_due : null,
    },
  };
}

export function createRouter(db) {
  const router = express.Router();

  const findUserByEmail = db.prepare('SELECT * FROM user WHERE email = ?');

  /**
   * Podaci platitelja iz forme. Ime, adresa i grad idu u barkod, pa moraju
   * stati u dopuštenu dužinu. `currentUserId` isključuje korisnika iz provjere
   * e-maila kad uređuje vlastiti profil.
   */
  const readProfilForm = (body, currentUserId = null) => {
    const values = {
      name: String(body.name ?? '').trim(),
      address: String(body.address ?? '').trim(),
      city: String(body.city ?? '').trim(),
      email: String(body.email ?? '').trim().toLowerCase(),
    };
    const errors = {};

    for (const key of ['name', 'address', 'city']) {
      if (!values[key]) errors[key] = 'Obavezno polje.';
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
      errors.email = 'E-mail nije ispravan.';
    } else {
      const other = findUserByEmail.get(values.email);
      if (other && other.id !== currentUserId) errors.email = 'Taj e-mail je već registriran.';
    }

    if (!errors.name && values.name.length > LIMITS.payerName) {
      errors.name = `Najviše ${LIMITS.payerName} znakova.`;
    }
    if (!errors.address && values.address.length > LIMITS.payerAddress) {
      errors.address = `Najviše ${LIMITS.payerAddress} znakova.`;
    }
    if (!errors.city && values.city.length > LIMITS.payerCity) {
      errors.city = `Najviše ${LIMITS.payerCity} znakova.`;
    }

    return { values, errors };
  };

  // ---------- Autentikacija ----------

  router.get('/prijava', (req, res) => {
    if (req.user) return res.redirect('/');
    send(res, prijavaPage());
  });

  router.post('/prijava', (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');
    const user = findUserByEmail.get(email);

    if (!user || !verifyPassword(password, user.pass_hash)) {
      return send(res, prijavaPage({ values: { email }, error: 'Pogrešan e-mail ili lozinka.' }), 401);
    }
    issueSession(res, user.id);
    res.redirect(303, '/');
  });

  router.get('/registracija', (req, res) => {
    if (req.user) return res.redirect('/');
    send(res, registracijaPage());
  });

  router.post('/registracija', (req, res) => {
    const { values, errors } = readProfilForm(req.body);
    const password = String(req.body.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Lozinka mora imati barem ${MIN_PASSWORD_LENGTH} znakova.`;
    }

    if (Object.keys(errors).length) return send(res, registracijaPage({ values, errors }), 400);

    const result = db
      .prepare('INSERT INTO user (email, pass_hash, name, address, city, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(values.email, hashPassword(password), values.name, values.address, values.city, new Date().toISOString());

    issueSession(res, Number(result.lastInsertRowid));
    res.redirect(303, '/');
  });

  router.post('/odjava', (req, res) => {
    clearSession(res);
    res.redirect(303, '/prijava');
  });

  // ---------- Postavke ----------

  // Stari linkovi na /profil ne smiju pasti.
  router.get('/profil', requireLogin, (req, res) => res.redirect(303, '/postavke'));

  const postavkeStranica = (req, extra = {}) =>
    postavkePage({
      values: req.user,
      user: req.user,
      nacini: naciniKorisnika(db, req.user.id),
      ...extra,
    });

  router.get('/postavke', requireLogin, (req, res) => {
    send(res, postavkeStranica(req, { poruka: req.query.spremljeno ? 'Podaci su spremljeni.' : '' }));
  });

  router.post('/postavke', requireLogin, (req, res) => {
    const { values, errors } = readProfilForm(req.body, req.user.id);

    if (Object.keys(errors).length) {
      return send(res, postavkePage({ values, user: req.user, errors, nacini: naciniKorisnika(db, req.user.id) }), 400);
    }

    db.prepare('UPDATE user SET name = ?, address = ?, city = ?, email = ? WHERE id = ?')
      .run(values.name, values.address, values.city, values.email, req.user.id);
    res.redirect(303, '/postavke?spremljeno=1');
  });

  router.post('/postavke/nacini', requireLogin, (req, res) => {
    const naziv = String(req.body.naziv ?? '').trim();
    if (!naziv) return res.redirect(303, '/postavke');
    if (naziv.length > 40) {
      return send(res, postavkeStranica(req, { greska: 'Naziv može imati najviše 40 znakova.' }), 400);
    }
    const existing = db
      .prepare('SELECT id FROM nacin_placanja WHERE user_id = ? AND naziv = ?')
      .get(req.user.id, naziv);
    if (existing) {
      return send(res, postavkeStranica(req, { greska: `Način „${naziv}“ već postoji.` }), 400);
    }
    dodajNacin(db, req.user.id, naziv);
    res.redirect(303, '/postavke');
  });

  router.post('/postavke/nacini/:id/obrisi', requireLogin, (req, res) => {
    arhivirajNacin(db, req.user.id, Number(req.params.id));
    res.redirect(303, '/postavke');
  });

  // ---------- Uplatnice ----------

  // Sažetak tekućeg mjeseca dijeli dashboard i popis.
  const sazetakZa = (req) => {
    const danas = todayIso();
    const mjesec = monthKey(danas);
    return { mjesec, sazetak: sazetakMjeseca(db, req.user.id, mjesec, lastDayOfMonth(mjesec), danas) };
  };

  router.get('/', requireLogin, (req, res) => {
    send(
      res,
      dashboardPage({
        uplatnice: uplatniceZaKorisnika(db, req.user.id),
        user: req.user,
        ...sazetakZa(req),
      }),
    );
  });

  router.get('/uplatnice', requireLogin, (req, res) => {
    send(
      res,
      listaPage({
        uplatnice: uplatniceZaKorisnika(db, req.user.id),
        user: req.user,
        ...sazetakZa(req),
      }),
    );
  });

  router.get('/povijest', requireLogin, (req, res) => {
    send(res, povijestPage({ mjeseci: povijestPoMjesecima(db, req.user.id), user: req.user }));
  });

  // Mora ići prije /uplatnice/:id da ga ne pokupi kao id.
  router.get('/uplatnice/nova', requireLogin, (req, res) => {
    let values = { model: 'HR00', interval_unit: '', interval_count: 1 };
    const sourceId = Number(req.query.od);
    if (sourceId) {
      const source = uplatnicaZaKorisnika(db, sourceId, req.user.id);
      if (source) {
        values = {
          ...source,
          id: undefined,
          label: `${source.label} (kopija)`.slice(0, 40),
          iznos: formatAmount(source.iznos_cents),
        };
      }
    }
    send(res, formaPage({ mode: 'nova', values, user: req.user }));
  });

  router.post('/uplatnice', requireLogin, (req, res) => {
    const { values, errors, record } = readUplatnicaForm(req.body, req.user);
    if (!record) return send(res, formaPage({ mode: 'nova', values, user: req.user, errors }), 400);

    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO uplatnica (owner_id, ${UPLATNICA_KOLONE.join(', ')}, archived, created_at, updated_at)
         VALUES (?, ${UPLATNICA_PITANJA}, 0, ?, ?)`,
      )
      .run(req.user.id, ...uplatnicaVrijednosti(record), now, now);

    res.redirect(303, `/uplatnice/${result.lastInsertRowid}`);
  });

  const loadUplatnica = (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return send(res, notFoundPage({ user: req.user }), 404);
    const uplatnica = uplatnicaZaKorisnika(db, id, req.user.id);
    if (!uplatnica) return send(res, notFoundPage({ user: req.user }), 404);
    req.uplatnica = uplatnica;
    next();
  };

  const ownerOnly = (req, res, next) => {
    if (!req.uplatnica.is_owner) return send(res, notFoundPage({ user: req.user }), 403);
    next();
  };

  router.get('/uplatnice/:id', requireLogin, loadUplatnica, (req, res) => {
    const payments = db
      .prepare(
        `SELECT p.*, n.naziv AS nacin
           FROM placanje p
           LEFT JOIN nacin_placanja n ON n.id = p.nacin_id
          WHERE p.uplatnica_id = ?
          ORDER BY p.paid_at DESC, p.id DESC`,
      )
      .all(req.uplatnica.id);
    let barcodeSvg = '';
    let barcodeError = '';
    try {
      barcodeSvg = pdf417svg(buildPayload(payloadInput(req.user, req.uplatnica)));
    } catch (e) {
      barcodeError = e.message;
    }
    if (barcodeError) {
      return send(
        res,
        errorPage({
          user: req.user,
          title: 'Barkod se ne može generirati',
          message: barcodeError,
        }),
        500,
      );
    }
    send(
      res,
      detaljPage({
        uplatnica: req.uplatnica,
        payments,
        user: req.user,
        natrag: backFrom(req, '/uplatnice'),
        barcodeSvg,
        shares: sharesZaUplatnicu(db, req.uplatnica.id),
        shareError: String(req.query.greska ?? ''),
      }),
    );
  });

  router.get('/uplatnice/:id/barkod.svg', requireLogin, loadUplatnica, (req, res) => {
    try {
      const payload = buildPayload(payloadInput(req.user, req.uplatnica));
      res.type('image/svg+xml').send(pdf417svg(payload));
    } catch (e) {
      res.status(500).type('text/plain').send(e.message);
    }
  });

  router.get('/uplatnice/:id/ispis', requireLogin, loadUplatnica, (req, res) => {
    try {
      const payload = buildPayload(payloadInput(req.user, req.uplatnica));
      send(
        res,
        ispisPage({ uplatnica: req.uplatnica, user: req.user, barcodeSvg: pdf417svg(payload) }),
      );
    } catch (e) {
      send(res, errorPage({ user: req.user, title: 'Ispis nije moguć', message: e.message }), 500);
    }
  });

  router.get('/uplatnice/:id/uredi', requireLogin, loadUplatnica, ownerOnly, (req, res) => {
    const values = { ...req.uplatnica, iznos: formatAmount(req.uplatnica.iznos_cents) };
    send(res, formaPage({ mode: 'uredi', values, user: req.user }));
  });

  router.post('/uplatnice/:id', requireLogin, loadUplatnica, ownerOnly, (req, res) => {
    const { values, errors, record } = readUplatnicaForm(req.body, req.user);
    if (!record) {
      values.id = req.uplatnica.id;
      return send(
        res,
        formaPage({ mode: 'uredi', values, user: req.user, errors }),
        400,
      );
    }

    db.prepare(
      `UPDATE uplatnica SET ${UPLATNICA_KOLONE.map((kolona) => `${kolona} = ?`).join(', ')},
         updated_at = ?
       WHERE id = ?`,
    ).run(...uplatnicaVrijednosti(record), new Date().toISOString(), req.uplatnica.id);

    res.redirect(303, `/uplatnice/${req.uplatnica.id}`);
  });

  router.get('/uplatnice/:id/plati', requireLogin, loadUplatnica, (req, res) => {
    send(
      res,
      platiPage({
        uplatnica: req.uplatnica,
        user: req.user,
        nacini: naciniKorisnika(db, req.user.id),
        povratak: backTo(req.query.povratak, `/uplatnice/${req.uplatnica.id}`),
      }),
    );
  });

  router.post('/uplatnice/:id/plati', requireLogin, loadUplatnica, (req, res) => {
    const uplatnica = req.uplatnica;
    const now = new Date().toISOString();

    // Tuđi ili nepostojeći način se ne prihvaća — uplata se ipak bilježi.
    const trazeniNacin = Number(req.body.nacin_id);
    const nacin = trazeniNacin
      ? db
          .prepare('SELECT id FROM nacin_placanja WHERE id = ? AND user_id = ? AND archived = 0')
          .get(trazeniNacin, req.user.id)
      : null;

    db.prepare(
      `INSERT INTO placanje (uplatnica_id, paid_at, iznos_cents, poziv_na_broj, nacin_id, prethodni_due)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      uplatnica.id,
      now,
      uplatnica.iznos_cents,
      uplatnica.poziv_na_broj,
      nacin?.id ?? null,
      uplatnica.next_due,
    );

    if (uplatnica.interval_unit && uplatnica.interval_count) {
      const nextDue = uplatnica.next_due
        ? advanceNextDue(uplatnica.next_due, uplatnica.interval_unit, uplatnica.interval_count)
        : null;
      db.prepare('UPDATE uplatnica SET next_due = ?, updated_at = ? WHERE id = ?')
        .run(nextDue, now, uplatnica.id);
    }

    res.redirect(303, backTo(req.body?.povratak, `/uplatnice/${uplatnica.id}`));
  });

  /**
   * Poništava zadnju uplatu i vraća dospijeće na staro mjesto.
   * Samo zadnja: za starije ne znamo kakav je raspored bio prije njih.
   */
  router.post('/uplatnice/:id/ponisti-uplatu', requireLogin, loadUplatnica, (req, res) => {
    const zadnja = db
      .prepare('SELECT * FROM placanje WHERE uplatnica_id = ? ORDER BY paid_at DESC, id DESC LIMIT 1')
      .get(req.uplatnica.id);

    if (zadnja) {
      db.prepare('DELETE FROM placanje WHERE id = ?').run(zadnja.id);

      if (req.uplatnica.interval_unit && req.uplatnica.interval_count) {
        // Starije uplate nemaju zapamćeno prethodno dospijeće, pa se vraća
        // jedan interval unazad — približno, ali bolje nego ništa.
        const vrati = zadnja.prethodni_due
          ?? addInterval(req.uplatnica.next_due, req.uplatnica.interval_unit, -req.uplatnica.interval_count);
        db.prepare('UPDATE uplatnica SET next_due = ?, updated_at = ? WHERE id = ?')
          .run(vrati, new Date().toISOString(), req.uplatnica.id);
      }
    }

    res.redirect(303, `/uplatnice/${req.uplatnica.id}`);
  });

  router.post('/uplatnice/:id/arhiviraj', requireLogin, loadUplatnica, ownerOnly, (req, res) => {
    db.prepare('UPDATE uplatnica SET archived = 1 - archived, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), req.uplatnica.id);
    res.redirect(303, backTo(req.body?.povratak, `/uplatnice/${req.uplatnica.id}`));
  });

  // Dijeljenje: greške idu kroz query parametar da ostane PRG (bez ponovnog POST-a).
  router.post('/uplatnice/:id/podijeli', requireLogin, loadUplatnica, ownerOnly, (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const back = (code) =>
      res.redirect(303, `/uplatnice/${req.uplatnica.id}${code ? `?greska=${code}` : ''}`);

    const target = findUserByEmail.get(email);
    if (!target) return back('nema-korisnika');
    if (target.id === req.user.id) return back('sebe');

    const already = db
      .prepare('SELECT 1 FROM share WHERE uplatnica_id = ? AND user_id = ?')
      .get(req.uplatnica.id, target.id);
    if (already) return back('vec');

    db.prepare('INSERT INTO share (uplatnica_id, user_id) VALUES (?, ?)').run(req.uplatnica.id, target.id);
    back('');
  });

  router.post('/uplatnice/:id/ukloni-dijeljenje', requireLogin, loadUplatnica, ownerOnly, (req, res) => {
    db.prepare('DELETE FROM share WHERE uplatnica_id = ? AND user_id = ?')
      .run(req.uplatnica.id, Number(req.body.user_id));
    res.redirect(303, `/uplatnice/${req.uplatnica.id}`);
  });

  // ---------- 404 ----------

  router.use((req, res) => send(res, notFoundPage({ user: req.user }), 404));

  return router;
}
