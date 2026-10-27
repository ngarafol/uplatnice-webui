import express from 'express';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { sessionMiddleware } from './auth.js';
import { createRouter } from './routes.js';

const db = openDb();
const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.urlencoded({ extended: false, limit: '32kb' }));

// HTML se ne smije cachirati: inače preglednik nakon promjene pokazuje staru uplatnicu.
app.use((req, res, next) => {
  if (!req.path.startsWith('/static/')) res.set('Cache-Control', 'no-store');
  next();
});

// Bez dugog cachea: promjena CSS-a se mora vidjeti odmah, a ETag i dalje daje 304
// kad se datoteka nije promijenila.
app.use('/static', express.static(fileURLToPath(new URL('public', import.meta.url)), { etag: true, maxAge: 0 }));
app.use(sessionMiddleware(db));
app.use(createRouter(db));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type('text/plain').send('Greška na serveru.');
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Uplatnice: http://localhost:${port}`);
});
