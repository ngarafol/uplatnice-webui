/**
 * Autentikacija: scrypt za lozinke, potpisani stateless cookie za sesiju.
 *
 * Nema server-side session storea — cookie nosi `id.expiry.potpis`, a potpis
 * čini podatak nepromjenjivim. Sesija tako preživi restart servera.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'sid';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  if (!expected.length) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET mora biti postavljen u produkciji.');
    }
    return 'razvojni-tajni-kljuc-promijeni-me';
  }
  return secret;
}

const sign = (payload) => createHmac('sha256', sessionSecret()).update(payload).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * SECURE_COOKIES=true -> cookie samo preko HTTPS.
 * Bez izričite postavke odlučuje NODE_ENV, pa kontejner u produkciji podrazumijeva
 * HTTPS; za lokalni/LAN HTTP se mora postaviti na false, inače se ne može prijaviti.
 */
function secureCookies() {
  const override = process.env.SECURE_COOKIES;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export function issueSession(res, userId) {
  const expiry = Date.now() + SESSION_MAX_AGE_MS;
  const payload = `${userId}.${expiry}`;
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    secure: secureCookies(),
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

/** Postavlja req.user ako je cookie valjan, inače ga ostavlja null. */
export function sessionMiddleware(db) {
  const findUser = db.prepare('SELECT id, email, name, address, city FROM user WHERE id = ?');

  return (req, res, next) => {
    req.user = null;
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];

    if (token) {
      const [uid, expiry, signature] = token.split('.');
      const payload = `${uid}.${expiry}`;
      const expected = sign(payload);
      const valid =
        uid &&
        expiry &&
        signature &&
        Number(expiry) > Date.now() &&
        signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

      if (valid) req.user = findUser.get(Number(uid)) ?? null;
      if (!req.user) res.clearCookie(COOKIE_NAME);
    }

    next();
  };
}

export function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/prijava');
  next();
}
