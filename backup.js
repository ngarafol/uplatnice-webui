/**
 * Dnevna kopija baze, bez vanjskih alata.
 *
 * Kopija se radi `VACUUM INTO`, a ne običnim kopiranjem datoteke: baza je u WAL
 * modu, pa kopija datoteke može uhvatiti nedovršenu transakciju.
 *
 * Kopije se drže `KEEP` dana pa se rotiraju. Podrazumijevano idu u mapu uz bazu
 * (u kontejneru je to volumen); `BACKUP_DIR` ih može preusmjeriti na drugi disk.
 */
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'uplatnice-';
const PRODUZETAK = '.db';

/** `uplatnice-2026-11-07.db` — ime po datumu, pa je sortiranje ujedno i vrijeme. */
export const nazivKopije = (datum = new Date()) => `${PREFIX}${datum.toISOString().slice(0, 10)}${PRODUZETAK}`;

/** Napravi kopiju za danas; ako već postoji, ne dira je. */
export function napraviKopiju(db, direktorij, sada = new Date()) {
  mkdirSync(direktorij, { recursive: true });
  const putanja = join(direktorij, nazivKopije(sada));

  try {
    statSync(putanja);
    return { putanja, nova: false };
  } catch {
    // nema kopije za danas — pravi se
  }

  db.prepare('VACUUM INTO ?').run(putanja);
  return { putanja, nova: true };
}

/** Zadrži najnovijih `koliko` kopija, ostale obriši. Vraća broj obrisanih. */
export function rotiraj(direktorij, koliko = 14) {
  let datoteke;
  try {
    datoteke = readdirSync(direktorij).filter((f) => f.startsWith(PREFIX) && f.endsWith(PRODUZETAK));
  } catch {
    return 0;
  }

  const viska = datoteke.sort().slice(0, Math.max(0, datoteke.length - koliko));
  for (const f of viska) unlinkSync(join(direktorij, f));
  return viska.length;
}

/**
 * Pokrene dnevnu kopiju odmah (ako je danas nema) i zatim svakih `intervalMs`.
 * Timer je `unref`, pa ne drži proces na životu pri gašenju.
 */
export function pokreniKopije(db, { direktorij, koliko = 14, intervalMs = 6 * 60 * 60 * 1000, sada = () => new Date() }) {
  const jednom = () => {
    try {
      napraviKopiju(db, direktorij, sada());
      rotiraj(direktorij, koliko);
    } catch (greska) {
      // Kopija ne smije srušiti aplikaciju; greška ide u log.
      console.error('Kopija baze nije uspjela:', greska.message);
    }
  };

  jednom();
  setInterval(jednom, intervalMs).unref?.();
}
