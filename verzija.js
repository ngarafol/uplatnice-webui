import { readFileSync } from 'node:fs';

/**
 * Verzija iz package.json — jedini izvor istine. `make release` ga ažurira prije
 * tagiranja, pa objavljena slika i izvorni kod uvijek pokazuju isti broj.
 */
export const VERZIJA = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;
