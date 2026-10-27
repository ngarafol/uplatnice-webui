/**
 * SQLite baza preko ugrađenog node:sqlite.
 *
 * Namjerno jedna datoteka i jedno skriptirano pokretanje sheme — za ovakav broj
 * korisnika migracijski framework bi bio više koda nego koristi. CREATE TABLE
 * IF NOT EXISTS je idempotentan, pa se sigurno izvršava na svakom pokretanju.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash   TEXT NOT NULL,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  city        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uplatnica (
  id              INTEGER PRIMARY KEY,
  owner_id        INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  prim_name       TEXT NOT NULL,
  prim_address    TEXT NOT NULL,
  prim_city       TEXT NOT NULL,
  iban            TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT 'HR00',
  poziv_na_broj   TEXT NOT NULL DEFAULT '',
  iznos_cents     INTEGER NOT NULL,
  sifra_namjene   TEXT NOT NULL DEFAULT '',
  opis            TEXT NOT NULL DEFAULT '',
  interval_unit   TEXT CHECK (interval_unit IN ('dan', 'tjedan', 'mjesec')),
  interval_count  INTEGER CHECK (interval_count IS NULL OR interval_count > 0),
  next_due        TEXT,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nacin_placanja (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  naziv      TEXT NOT NULL COLLATE NOCASE,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, naziv)
);

CREATE TABLE IF NOT EXISTS placanje (
  id            INTEGER PRIMARY KEY,
  uplatnica_id  INTEGER NOT NULL REFERENCES uplatnica(id) ON DELETE CASCADE,
  paid_at       TEXT NOT NULL,
  iznos_cents   INTEGER NOT NULL,
  poziv_na_broj TEXT NOT NULL,
  nacin_id      INTEGER REFERENCES nacin_placanja(id) ON DELETE SET NULL,
  -- Dospijeće prije ove uplate; poništavanje vraća raspored na staro mjesto.
  prethodni_due TEXT
);

CREATE TABLE IF NOT EXISTS share (
  uplatnica_id INTEGER NOT NULL REFERENCES uplatnica(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  PRIMARY KEY (uplatnica_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_uplatnica_owner ON uplatnica(owner_id);
CREATE INDEX IF NOT EXISTS idx_placanje_uplatnica ON placanje(uplatnica_id);
CREATE INDEX IF NOT EXISTS idx_share_user ON share(user_id);
CREATE INDEX IF NOT EXISTS idx_nacin_user ON nacin_placanja(user_id);
`;

/**
 * Dodaje stupac ako ga nema. Postojeće baze su nastale prije njega, a
 * CREATE TABLE IF NOT EXISTS ih ne mijenja — bez ovoga bi stari podaci pukli.
 */
function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Otvara bazu i osigurava shemu. */
export function openDb(path = process.env.DB_PATH ?? 'data/uplatnice.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  ensureColumn(db, 'placanje', 'nacin_id', 'INTEGER REFERENCES nacin_placanja(id) ON DELETE SET NULL');
  ensureColumn(db, 'nacin_placanja', 'archived', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'placanje', 'prethodni_due', 'TEXT');
  return db;
}

/**
 * Uvjet "korisnik smije vidjeti uplatnicu": svoja ili dijeljena.
 * Sadrži dva `?` — oba se vežu na userId.
 */
const VIDLJIVO = `(u.owner_id = ? OR EXISTS (
      SELECT 1 FROM share s WHERE s.uplatnica_id = u.id AND s.user_id = ?))`;

/** Svi zapisi uplatnica koje korisnik smije vidjeti (svoje + dijeljene). */
export function uplatniceZaKorisnika(db, userId) {
  return db
    .prepare(
      `SELECT u.*, (u.owner_id = ?) AS is_owner, us.name AS owner_name,
              (SELECT MAX(paid_at) FROM placanje p WHERE p.uplatnica_id = u.id) AS last_paid
         FROM uplatnica u
         JOIN user us ON us.id = u.owner_id
        WHERE ${VIDLJIVO}
        ORDER BY u.archived ASC, COALESCE(u.next_due, '9999-12-31') ASC, u.label ASC`,
    )
    .all(userId, userId, userId);
}

/** Jedna uplatnica, ali samo ako je korisnik smije vidjeti. */
export function uplatnicaZaKorisnika(db, uplatnicaId, userId) {
  return db
    .prepare(
      `SELECT u.*, (u.owner_id = ?) AS is_owner, us.name AS owner_name
         FROM uplatnica u
         JOIN user us ON us.id = u.owner_id
        WHERE u.id = ? AND ${VIDLJIVO}`,
    )
    .get(userId, uplatnicaId, userId, userId);
}

/** Korisnici s kojima je uplatnica podijeljena. */
export function sharesZaUplatnicu(db, uplatnicaId) {
  return db
    .prepare(
      `SELECT s.user_id, u.name, u.email
         FROM share s
         JOIN user u ON u.id = s.user_id
        WHERE s.uplatnica_id = ?
        ORDER BY u.name`,
    )
    .all(uplatnicaId);
}

/**
 * Sažetak tekućeg mjeseca: koliko je plaćeno i što je još otvoreno.
 *
 * "Otvoreno" = aktivne uplatnice kojima dospijeće pada do kraja mjeseca.
 * Kad se uplatnica označi plaćenom, next_due skoči na sljedeći period, pa
 * plaćena uplatnica automatski izlazi iz ovog zbroja.
 */
export function sazetakMjeseca(db, userId, mjesec, doDatuma, danas) {
  const placeno = db
    .prepare(
      `SELECT COUNT(*) AS broj, COALESCE(SUM(p.iznos_cents), 0) AS ukupno
         FROM placanje p
         JOIN uplatnica u ON u.id = p.uplatnica_id
        WHERE substr(p.paid_at, 1, 7) = ? AND ${VIDLJIVO}`,
    )
    .get(mjesec, userId, userId);

  const otvoreno = db
    .prepare(
      `SELECT COUNT(*) AS broj,
              COALESCE(SUM(u.iznos_cents), 0) AS ukupno,
              COALESCE(SUM(CASE WHEN u.next_due < ? THEN 1 ELSE 0 END), 0) AS kasni
         FROM uplatnica u
        WHERE u.archived = 0 AND u.next_due IS NOT NULL AND u.next_due <= ?
          AND ${VIDLJIVO}`,
    )
    .get(danas, doDatuma, userId, userId);

  return { placeno, otvoreno };
}

/** Sva plaćanja korisnika, grupirana po mjesecu (najnoviji prvi). */
export function povijestPoMjesecima(db, userId) {
  const rows = db
    .prepare(
      `SELECT substr(p.paid_at, 1, 7) AS mjesec, p.paid_at, p.iznos_cents,
              p.poziv_na_broj, u.id AS uplatnica_id, u.label, n.naziv AS nacin
         FROM placanje p
         JOIN uplatnica u ON u.id = p.uplatnica_id
         LEFT JOIN nacin_placanja n ON n.id = p.nacin_id
        WHERE ${VIDLJIVO}
        ORDER BY p.paid_at DESC`,
    )
    .all(userId, userId);

  const mjeseci = [];
  const poMjesecu = new Map();
  for (const row of rows) {
    let grupa = poMjesecu.get(row.mjesec);
    if (!grupa) {
      grupa = { mjesec: row.mjesec, ukupno: 0, stavke: [] };
      poMjesecu.set(row.mjesec, grupa);
      mjeseci.push(grupa);
    }
    grupa.ukupno += row.iznos_cents;
    grupa.stavke.push(row);
  }
  return mjeseci;
}

/* ---------- Načini plaćanja ---------- */

export function naciniKorisnika(db, userId) {
  return db
    .prepare('SELECT * FROM nacin_placanja WHERE user_id = ? AND archived = 0 ORDER BY naziv')
    .all(userId);
}

export function dodajNacin(db, userId, naziv) {
  return db
    .prepare('INSERT INTO nacin_placanja (user_id, naziv, created_at) VALUES (?, ?, ?)')
    .run(userId, naziv, new Date().toISOString());
}

/**
 * Način se ne briše nego arhivira: uplate koje ga koriste moraju zadržati
 * naziv u povijesti. Arhivirani se samo ne nudi pri plaćanju.
 */
export function arhivirajNacin(db, userId, id) {
  return db
    .prepare('UPDATE nacin_placanja SET archived = 1 WHERE id = ? AND user_id = ?')
    .run(id, userId);
}
