import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { napraviKopiju, nazivKopije, rotiraj } from '../backup.js';
import { openDb } from '../db.js';

const mapa = () => mkdtempSync(join(tmpdir(), 'uplatnice-backup-'));

test('kopija: ime nosi datum', () => {
  assert.equal(nazivKopije(new Date('2026-11-07T10:00:00Z')), 'uplatnice-2026-11-07.db');
});

test('kopija: VACUUM INTO daje čitljivu bazu s istim podacima', () => {
  const dir = mapa();
  const db = openDb(join(dir, 'izvor.db'));
  db.prepare("INSERT INTO user (email, pass_hash, name, address, city, created_at) VALUES ('a@b.hr','x','A','B','C','2026-01-01')").run();

  const { putanja, nova } = napraviKopiju(db, join(dir, 'kopije'), new Date('2026-11-07T10:00:00Z'));
  assert.ok(nova);
  assert.match(putanja, /uplatnice-2026-11-07\.db$/);

  const kopija = openDb(putanja);
  assert.equal(kopija.prepare('SELECT COUNT(*) c FROM user').get().c, 1);
  assert.equal(kopija.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

  // drugi poziv istog dana ne pravi novu datoteku
  assert.equal(napraviKopiju(db, join(dir, 'kopije'), new Date('2026-11-07T18:00:00Z')).nova, false);
  // otvaranje kopije stvori i -wal/-shm, pa brojimo samo .db datoteke
  const dbKopije = readdirSync(join(dir, 'kopije')).filter((f) => f.endsWith('.db'));
  assert.equal(dbKopije.length, 1);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('kopija: rotacija čuva zadnjih N', () => {
  const dir = mapa();
  for (const dan of ['01', '02', '03', '04', '05']) {
    writeFileSync(join(dir, `uplatnice-2026-11-${dan}.db`), 'x');
  }
  assert.equal(rotiraj(dir, 3), 2);
  assert.deepEqual(readdirSync(dir).sort(), [
    'uplatnice-2026-11-03.db',
    'uplatnice-2026-11-04.db',
    'uplatnice-2026-11-05.db',
  ]);
  rmSync(dir, { recursive: true, force: true });
});
