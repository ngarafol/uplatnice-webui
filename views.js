/**
 * Sve stranice kao html`...` predlošci. Nema template enginea ni build stepa —
 * html.js escapea svaku interpolaciju, a `raw()` je rezerviran za SVG koji
 * generiramo sami.
 */
import { html, raw } from './html.js';
import { formatAmount } from './hub3.js';
import {
  DASHBOARD_WINDOW_DAYS,
  dueLabel,
  isDueSoon,
  isOverdue,
  monthLabel,
  monthLabelIn,
  parseIso,
  todayIso,
  UNIT_LABEL,
} from './recurring.js';

const money = (cents) => `${formatAmount(cents)} EUR`;

function formatDate(iso) {
  if (!iso) return '—';
  const d = parseIso(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}.`;
}

const NAV = [
  ['/', 'Početna'],
  ['/uplatnice', 'Uplatnice'],
  ['/povijest', 'Povijest'],
  ['/postavke', 'Postavke'],
];

const ICON_MOON = raw(
  '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>',
);
const ICON_SUN = raw(
  '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4' +
    'M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
);

const ICON_TRASH = raw(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
);
const ICON_RESTORE = raw(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 9v5h5"/><path d="M20 12a8 8 0 1 1-2.2-5.5"/></svg>',
);

export function layout({ title, user, body }) {
  return html`<!doctype html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Uplatnice</title>
  <script>
    // Tema se postavlja prije prvog iscrtavanja, inače bljesne pogrešna pozadina.
    (() => {
      try {
        const saved = localStorage.getItem('tema');
        const dark = saved
          ? saved === 'tamna'
          : matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = dark ? 'tamna' : 'svjetla';
      } catch {
        document.documentElement.dataset.theme = 'svjetla';
      }
    })();
  </script>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">Uplatnice</a>
    ${user
      ? html`<nav>
            ${NAV.map(
              ([href, label]) => html`<a href="${href}">${label}</a>`,
            )}
          </nav>`
      : ''}
    <div class="topbar-end">
      <button type="button" class="theme-toggle" data-theme-toggle
              aria-label="Prebaci na tamni način" title="Prebaci na tamni način">
        ${ICON_MOON}${ICON_SUN}
      </button>
      ${user
        ? html`<div class="who">
              <span>${user.name}</span>
              <form method="post" action="/odjava"><button class="link">Odjava</button></form>
            </div>`
        : ''}
    </div>
  </header>
  <main class="wrap">
    ${body}
  </main>
  <script>
    for (const form of document.querySelectorAll('form[data-confirm]')) {
      form.addEventListener('submit', (event) => {
        if (!confirm(form.dataset.confirm)) event.preventDefault();
      });
    }

    // Lozinka se otkriva dok je tipka pritisnuta (miš, dodir ili Space/Enter).
    for (const button of document.querySelectorAll('[data-reveal]')) {
      const input = button.parentElement.querySelector('input');
      const show = () => {
        input.type = 'text';
        button.classList.add('is-active');
        button.setAttribute('aria-label', 'Pusti za skrivanje lozinke');
      };
      const hide = () => {
        input.type = 'password';
        button.classList.remove('is-active');
        button.setAttribute('aria-label', 'Drži pritisnuto za prikaz lozinke');
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        show();
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
        button.addEventListener(type, hide);
      }
      button.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          show();
        }
      });
      button.addEventListener('keyup', hide);
      window.addEventListener('pointerup', hide);
    }

    // Prebacivanje teme; odabir se pamti, a bez njega vrijedi OS postavka.
    const themeToggle = document.querySelector('[data-theme-toggle]');
    if (themeToggle) {
      const label = (dark) => (dark ? 'Prebaci na svijetli način' : 'Prebaci na tamni način');
      const sync = () => {
        const text = label(document.documentElement.dataset.theme === 'tamna');
        themeToggle.setAttribute('aria-label', text);
        themeToggle.setAttribute('title', text);
      };
      sync();
      themeToggle.addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme === 'tamna';
        document.documentElement.dataset.theme = dark ? 'svjetla' : 'tamna';
        try {
          localStorage.setItem('tema', dark ? 'svjetla' : 'tamna');
        } catch {
          /* privatni način: odabir vrijedi samo za ovu stranicu */
        }
        sync();
      });
    }
  </script>

  <script type="module">
    import { formatIban, ibanExpectedLength, isValidIban, normalizeIban } from '/static/iban.js';

    // IBAN se provjerava dok se tipka; server i dalje odlučuje pri snimanju.
    const ibanInput = document.querySelector('input[name="iban"]');
    if (ibanInput) {
      const status = document.createElement('span');
      status.className = 'field-hint iban-status';
      ibanInput.after(status);

      // Gumb za snimanje je zaključan dok IBAN nije ispravan. Bez JS-a ostaje
      // otključan i tada odlučuje server — provjera na klijentu je samo pomoć.
      const submitButton = ibanInput.form
        ? ibanInput.form.querySelector('button[type="submit"]')
        : null;

      const render = () => {
        const iban = normalizeIban(ibanInput.value);
        status.className = 'field-hint iban-status';
        ibanInput.classList.remove('is-invalid');

        const ispravan = isValidIban(iban);
        if (submitButton) submitButton.disabled = !ispravan;

        if (!iban) {
          status.textContent = 'Hrvatski ili strani IBAN.';
          return;
        }
        // Model je obavezan samo za hrvatski IBAN.
        if (modelInput) modelInput.required = iban.startsWith('HR');

        const ocekivano = ibanExpectedLength(iban);
        if (ocekivano !== null && iban.length < ocekivano) {
          status.textContent = 'Upisano ' + iban.length + ' od ' + ocekivano + ' znaka.';
          return;
        }
        if (ocekivano === null && iban.length < 15) {
          status.textContent = 'Hrvatski ili strani IBAN.';
          return;
        }
        if (ispravan) {
          status.textContent = 'IBAN je ispravan.';
          status.classList.add('ok');
        } else {
          status.textContent = 'IBAN nije ispravan — provjeri znamenke.';
          status.classList.add('bad');
          ibanInput.classList.add('is-invalid');
        }
      };

      const modelInput = ibanInput.form
        ? ibanInput.form.querySelector('input[name="model"]')
        : null;

      ibanInput.addEventListener('input', render);
      ibanInput.addEventListener('blur', () => {
        ibanInput.value = formatIban(ibanInput.value);
        render();
      });
      render();
    }
  </script>
</body>
</html>`;
}

const feedback = (message, kind = 'error') =>
  message ? html`<p class="feedback ${kind}">${message}</p>` : '';

const REVEAL_ICON = raw(
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/>' +
    '<circle cx="12" cy="12" r="2.6"/></svg>',
);

const field = ({
  name,
  label,
  value = '',
  type = 'text',
  required = false,
  error,
  hint,
  attrs = '',
  reveal = false,
}) => html`<label class="field">
    <span class="field-label">${label}${required ? html` <span class="req">*</span>` : ''}</span>
    ${reveal
      ? html`<span class="input-action">
          <input type="${type}" name="${name}" value="${value}" ${raw(required ? 'required' : '')} ${raw(attrs)}>
          <button type="button" class="reveal" data-reveal
                  aria-label="Drži pritisnuto za prikaz lozinke"
                  title="Drži pritisnuto za prikaz lozinke">${REVEAL_ICON}</button>
        </span>`
      : html`<input type="${type}" name="${name}" value="${value}" ${raw(required ? 'required' : '')} ${raw(attrs)}>`}
    ${error ? html`<span class="field-error">${error}</span>` : ''}
    ${hint ? html`<span class="field-hint">${hint}</span>` : ''}
  </label>`;

const authShell = (title, body) =>
  html`<div class="auth-card">
    <h1>${title}</h1>
    ${body}
  </div>`;

export function prijavaPage({ values = {}, error } = {}) {
  return layout({
    title: 'Prijava',
    user: null,
    body: authShell(
      'Prijava',
      html`
        ${feedback(error)}
        <form method="post" action="/prijava" class="stack">
          ${field({ name: 'email', label: 'E-mail', value: values.email, type: 'email', required: true, attrs: 'autofocus autocomplete=username' })}
          ${field({ name: 'password', label: 'Lozinka', type: 'password', required: true, reveal: true, attrs: 'autocomplete=current-password' })}
          <button class="btn primary" type="submit">Prijavi se</button>
        </form>
        <p class="muted">Nemaš račun? <a href="/registracija">Registriraj se</a>.</p>
      `,
    ),
  });
}

export function registracijaPage({ values = {}, errors = {} } = {}) {
  return layout({
    title: 'Registracija',
    user: null,
    body: authShell(
      'Registracija',
      html`
        <form method="post" action="/registracija" class="stack">
          <fieldset>
            <legend>Podaci o platitelju</legend>
            <div class="stack">
              <p class="field-hint">
                Ime, adresa i grad upisuju se u barkod svake uplatnice kao platitelj.
              </p>
              ${platiteljFields(values, errors)}
            </div>
          </fieldset>
          ${field({ name: 'email', label: 'E-mail', value: values.email, type: 'email', required: true, error: errors.email, attrs: 'autocomplete=username' })}
          ${field({ name: 'password', label: 'Lozinka', type: 'password', required: true, reveal: true, error: errors.password, hint: 'Najmanje 8 znakova.', attrs: 'autocomplete=new-password' })}
          <button class="btn primary" type="submit">Kreiraj račun</button>
        </form>
        <p class="muted">Već imaš račun? <a href="/prijava">Prijavi se</a>.</p>
      `,
    ),
  });
}

/** Hrvatska množina: 1 uplata, 2 uplate, 5 uplata. */
function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** Ime, adresa, grad i e-mail — ista polja u registraciji i u Postavkama. */
const platiteljFields = (values, errors) => [
  field({ name: 'name', label: 'Ime i prezime', value: values.name, required: true, error: errors.name, attrs: 'maxlength=30' }),
  field({ name: 'address', label: 'Adresa', value: values.address, required: true, error: errors.address, attrs: 'maxlength=27' }),
  field({ name: 'city', label: 'Grad', value: values.city, required: true, error: errors.city, attrs: 'maxlength=27' }),
];

/** Sažetak tekućeg mjeseca: plaćeno + što je još otvoreno. */
const statsCard = (sazetak, mjesec) => html`
  <section class="card stats">
    <div class="stat">
      <p class="stat-label">Plaćeno u ${monthLabelIn(mjesec)}</p>
      <p class="stat-value">${money(sazetak.placeno.ukupno)}</p>
      <p class="stat-note">${plural(sazetak.placeno.broj, 'uplata', 'uplate', 'uplata')}</p>
    </div>
    <div class="stat">
      <p class="stat-label">Preostalo za platiti</p>
      <p class="stat-value">${money(sazetak.otvoreno.ukupno)}</p>
      <p class="stat-note">
        ${sazetak.otvoreno.broj === 0
          ? 'sve je plaćeno'
          : html`${plural(sazetak.otvoreno.broj, 'uplatnica', 'uplatnice', 'uplatnica')} do kraja mjeseca${sazetak.otvoreno.kasni
              ? html` · <span class="stat-late">${plural(sazetak.otvoreno.kasni, 'kasni', 'kasne', 'kasni')}</span>`
              : ''}`}
      </p>
    </div>
  </section>`;

const dueBadge = (uplatnica, today) => {
  if (!uplatnica.next_due) return html`<span class="badge">jednokratno</span>`;
  const kind = isOverdue(uplatnica.next_due, today) ? 'danger' : isDueSoon(uplatnica.next_due, today) ? 'warn' : 'neutral';
  return html`<span class="badge ${kind}">${dueLabel(uplatnica.next_due, today)}</span>`;
};

const uplatnicaRow = (uplatnica, today, povratak) => html`
  <tr class="${isOverdue(uplatnica.next_due, today) ? 'overdue' : ''}">
    <td><a class="strong" href="/uplatnice/${uplatnica.id}">${uplatnica.label}</a></td>
    <td>${uplatnica.prim_name}</td>
    <td class="num">${money(uplatnica.iznos_cents)}</td>
    <td class="mono">${uplatnica.poziv_na_broj || '—'}</td>
    <td>${formatDate(uplatnica.next_due)}</td>
    <td>${dueBadge(uplatnica, today)}</td>
    <td class="actions-cell">
      <div class="row-actions">
      ${uplatnica.archived
        ? html`<form method="post" action="/uplatnice/${uplatnica.id}/arhiviraj">
                <input type="hidden" name="povratak" value="${povratak}">
                <button class="icon-btn" type="submit" title="Vrati iz arhive" aria-label="Vrati iz arhive">${ICON_RESTORE}</button>
              </form>`
        : html`
            ${uplatnica.is_owner
              ? html`<a class="btn small" href="/uplatnice/${uplatnica.id}/uredi">Uredi</a>`
              : ''}
            <a class="btn small" href="/uplatnice/${uplatnica.id}#barkod">Kod</a>
            <a class="btn small" href="/uplatnice/${uplatnica.id}/plati?povratak=${encodeURIComponent(povratak)}">Plaćeno</a>
            ${uplatnica.is_owner
              ? html`<form method="post" action="/uplatnice/${uplatnica.id}/arhiviraj"
                            data-confirm="Obrisati uplatnicu „${uplatnica.label}“? Povijest plaćanja ostaje sačuvana.">
                      <input type="hidden" name="povratak" value="${povratak}">
                      <button class="icon-btn danger" type="submit" title="Obriši" aria-label="Obriši">${ICON_TRASH}</button>
                    </form>`
              : ''}
          `}
      </div>
    </td>
  </tr>`;

function uplatnicaTable(rows, today, emptyText, povratak) {
  if (!rows.length) return html`<p class="empty">${emptyText}</p>`;
  return html`<table class="table">
    <thead>
      <tr>
        <th>Oznaka</th><th>Primatelj</th><th class="num">Iznos</th><th>Poziv na broj</th>
        <th>Sljedeće</th><th>Status</th><th><span class="sr-only">Radnje</span></th>
      </tr>
    </thead>
    <tbody>${rows.map((u) => uplatnicaRow(u, today, povratak))}</tbody>
  </table>`;
}

export function dashboardPage({ uplatnice, user, sazetak, mjesec, today = todayIso() }) {
  const active = uplatnice.filter((u) => !u.archived);
  const due = active.filter((u) => isDueSoon(u.next_due, today, DASHBOARD_WINDOW_DAYS));

  return layout({
    title: 'Početna',
    user,
    body: html`
      <div class="page-head">
        <h1>Početna</h1>
        <a class="btn primary" href="/uplatnice/nova">+ Nova uplatnica</a>
      </div>

      ${statsCard(sazetak, mjesec)}

      <section class="card">
        <h2>Dospijeva <span class="count">${due.length}</span></h2>
        ${uplatnicaTable(due, today, 'Ništa ne dospijeva u sljedećih mjesec dana.', '/')}
      </section>

      <section class="card">
        <h2>Sve uplatnice <span class="count">${active.length}</span></h2>
        ${uplatnicaTable(active, today, 'Još nema uplatnica. Dodaj prvu gore desno.', '/')}
      </section>
    `,
  });
}

export function listaPage({ uplatnice, user, sazetak, mjesec, today = todayIso() }) {
  const active = uplatnice.filter((u) => !u.archived);
  const archived = uplatnice.filter((u) => u.archived);

  return layout({
    title: 'Uplatnice',
    user,
    body: html`
      <div class="page-head">
        <h1>Uplatnice</h1>
        <a class="btn primary" href="/uplatnice/nova">+ Nova uplatnica</a>
      </div>

      ${statsCard(sazetak, mjesec)}

      <section class="card">
        ${uplatnicaTable(active, today, 'Nema aktivnih uplatnica.', '/uplatnice')}
      </section>

      ${archived.length
        ? html`<section class="card">
            <h2>Arhiva <span class="count">${archived.length}</span></h2>
            ${uplatnicaTable(archived, today, '', '/uplatnice')}
          </section>`
        : ''}
    `,
  });
}

export function formaPage({ mode, values, user, errors = {}, today = todayIso() }) {
  const editing = mode === 'uredi';
  const models = Array.from({ length: 100 }, (_, i) => `HR${String(i).padStart(2, '0')}`);
  const defaultNextDue = values.next_due || today;

  return layout({
    title: editing ? 'Uredi uplatnicu' : 'Nova uplatnica',
    user,
    body: html`
      <div class="page-head">
        <h1>${editing ? 'Uredi uplatnicu' : 'Nova uplatnica'}</h1>
      </div>

      ${errors._ ? feedback(errors._) : ''}

      <form method="post" action="${editing ? `/uplatnice/${values.id}` : '/uplatnice'}" class="card form-grid">
        <label class="field span-2">
          <span class="field-label">Oznaka <span class="req">*</span></span>
          <input name="label" value="${values.label ?? ''}" required autofocus placeholder="npr. Struja">
          <span class="field-hint">Samo za tebe — kako prepoznaješ uplatnicu u popisu.</span>
          ${errors.label ? html`<span class="field-error">${errors.label}</span>` : ''}
        </label>

        <fieldset class="span-2">
          <legend>Primatelj</legend>
          <div class="form-grid">
            ${field({ name: 'prim_name', label: 'Naziv / ime', value: values.prim_name, required: true, error: errors.prim_name, attrs: 'maxlength=25' })}
            ${field({ name: 'prim_address', label: 'Adresa', value: values.prim_address, required: true, error: errors.prim_address, attrs: 'maxlength=25' })}
            ${field({ name: 'prim_city', label: 'Grad', value: values.prim_city, required: true, error: errors.prim_city, attrs: 'maxlength=27' })}
            ${field({ name: 'iban', label: 'IBAN', value: values.iban, required: true, error: errors.iban, attrs: 'placeholder="HR00 0000 0000 0000 0000 0" spellcheck=false maxlength=34' })}
            ${field({ name: 'model', label: 'Model', value: values.model || 'HR00', error: errors.model, attrs: 'list=modeli size=6' })}
            <datalist id="modeli">${models.map((m) => html`<option value="${m}"></option>`)}</datalist>
            ${field({ name: 'poziv_na_broj', label: 'Poziv na broj', value: values.poziv_na_broj, error: errors.poziv_na_broj, attrs: 'placeholder=1234-5678-901234' })}
          </div>
        </fieldset>

        <fieldset class="span-2">
          <legend>Plaćanje</legend>
          <div class="form-grid">
            ${field({ name: 'iznos', label: 'Iznos (EUR)', value: values.iznos, required: true, error: errors.iznos, attrs: `inputmode=decimal placeholder=70,00` })}
            ${field({ name: 'sifra_namjene', label: 'Šifra namjene', value: values.sifra_namjene, error: errors.sifra_namjene, hint: 'Opcionalno, npr. COST.', attrs: 'maxlength=4 placeholder=COST' })}
            <label class="field span-2">
              <span class="field-label">Opis plaćanja</span>
              <input name="opis" value="${values.opis ?? ''}" maxlength="35" placeholder="npr. Uplata za 11. mjesec">
              ${errors.opis ? html`<span class="field-error">${errors.opis}</span>` : ''}
            </label>
          </div>
        </fieldset>

        <fieldset class="span-2">
          <legend>Ponavljanje</legend>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">Interval</span>
              <select name="interval_unit">
                <option value="">jednokratno</option>
                ${['dan', 'tjedan', 'mjesec'].map(
                  (unit) => html`<option value="${unit}" ${raw(values.interval_unit === unit ? 'selected' : '')}>${UNIT_LABEL[unit]}</option>`,
                )}
              </select>
            </label>
            ${field({ name: 'interval_count', label: 'Svakih', value: values.interval_count ?? 1, type: 'number', error: errors.interval_count, attrs: 'min=1 max=60' })}
            ${field({ name: 'next_due', label: 'Sljedeće dospijeće', value: defaultNextDue, type: 'date', error: errors.next_due, hint: 'Koristi se kad je interval odabran.' })}
          </div>
        </fieldset>

        <div class="span-2 actions">
          <button class="btn primary" type="submit">${editing ? 'Spremi' : 'Dodaj uplatnicu'}</button>
          <a class="btn" href="${editing ? `/uplatnice/${values.id}` : '/uplatnice'}">Odustani</a>
        </div>
      </form>
    `,
  });
}

const SHARE_ERRORS = {
  'nema-korisnika': 'Taj e-mail nije registriran. Korisnik se prvo mora registrirati.',
  sebe: 'Ne možeš podijeliti uplatnicu sam sa sobom.',
  vec: 'Uplatnica je već podijeljena s tim korisnikom.',
};

export function detaljPage({
  uplatnica,
  payments,
  user,
  natrag = '/uplatnice',
  barcodeSvg,
  shares = [],
  shareError = '',
  today = todayIso(),
}) {
  return layout({
    title: uplatnica.label,
    user,
    body: html`
      <a class="back-link" href="${natrag}">← Natrag</a>
      <div class="page-head">
        <h1>${uplatnica.label}</h1>
        ${dueBadge(uplatnica, today)}
      </div>

      <div class="cols">
        <section class="card barcode-card" id="barkod">
          <div class="barcode">${raw(barcodeSvg)}</div>
          <p class="muted">Skeniraj bankovnom aplikacijom — ona popuni nalog sama.</p>
          ${uplatnica.iban.length === 21
            ? ''
            : html`<p class="note-warn">
                Strani IBAN: obrazac HUB 3A predviđa 21 znak, pa bankovna aplikacija
                može odbiti ovaj barkod.
              </p>`}
        </section>

        <section class="card">
          <h2>Podaci</h2>
          <dl class="facts">
            <dt>Primatelj</dt><dd>${uplatnica.prim_name}</dd>
            <dt>Adresa</dt><dd>${uplatnica.prim_address}, ${uplatnica.prim_city}</dd>
            <dt>IBAN</dt><dd class="mono">${uplatnica.iban}</dd>
            <dt>Model</dt><dd class="mono">${uplatnica.model}</dd>
            <dt>Poziv na broj</dt><dd class="mono">${uplatnica.poziv_na_broj || '—'}</dd>
            <dt>Iznos</dt><dd class="strong">${money(uplatnica.iznos_cents)}</dd>
            <dt>Šifra namjene</dt><dd>${uplatnica.sifra_namjene || '—'}</dd>
            <dt>Opis</dt><dd>${uplatnica.opis || '—'}</dd>
            <dt>Ponavljanje</dt>
            <dd>${uplatnica.interval_unit
              ? html`svakih ${uplatnica.interval_count} ${UNIT_LABEL[uplatnica.interval_unit]}`
              : 'jednokratno'}</dd>
            <dt>Sljedeće dospijeće</dt><dd>${formatDate(uplatnica.next_due)}</dd>
            <dt>Zadnje plaćeno</dt><dd>${formatDate(payments[0]?.paid_at?.slice(0, 10))}</dd>
            ${uplatnica.is_owner ? '' : html`<dt>Vlasnik</dt><dd>${uplatnica.owner_name}</dd>`}
          </dl>

          <div class="actions">
            <a class="btn primary" href="/uplatnice/${uplatnica.id}/plati">Označi plaćeno</a>
            ${uplatnica.is_owner
              ? html`<a class="btn" href="/uplatnice/${uplatnica.id}/uredi">Uredi</a>`
              : ''}
            <a class="btn" href="/uplatnice/nova?od=${uplatnica.id}">Kopiraj</a>
            <a class="btn" href="/uplatnice/${uplatnica.id}/ispis">Ispis</a>
            ${uplatnica.is_owner
              ? html`<form method="post" action="/uplatnice/${uplatnica.id}/arhiviraj"
                         data-confirm="Arhivirati uplatnicu „${uplatnica.label}“?">
                    <button class="btn danger" type="submit">Arhiviraj</button>
                  </form>`
              : ''}
          </div>
        </section>
      </div>

      <section class="card">
        <h2>Povijest plaćanja <span class="count">${payments.length}</span></h2>
        ${payments.length
          ? html`<table class="table">
              <thead>
                <tr>
                  <th>Datum</th><th>Način</th><th class="num">Iznos</th><th>Poziv na broj</th>
                  <th><span class="sr-only">Radnje</span></th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(
                  (p, i) => html`<tr>
                    <td>${formatDate(p.paid_at.slice(0, 10))}</td>
                    <td>${p.nacin || '—'}</td>
                    <td class="num">${money(p.iznos_cents)}</td>
                    <td class="mono">${p.poziv_na_broj || '—'}</td>
                    <td class="actions-cell">
                      ${i === 0
                        ? html`<div class="row-actions">
                            <form method="post" action="/uplatnice/${uplatnica.id}/ponisti-uplatu"
                                  data-confirm="Poništiti uplatu od ${formatDate(p.paid_at.slice(0, 10))} na ${money(p.iznos_cents)}? Dospijeće se vraća na prijašnje.">
                              <button class="btn danger small" type="submit">Poništi</button>
                            </form>
                          </div>`
                        : ''}
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="empty">Još nije označena kao plaćena.</p>`}
      </section>
      ${uplatnica.is_owner
        ? html`<section class="card">
            <h2>Dijeljenje <span class="count">${shares.length}</span></h2>
            <p class="muted">
              Dijeljeni korisnici vide uplatnicu i mogu je označiti plaćenom, ali je ne mogu
              uređivati ni arhivirati.
            </p>
            ${shareError ? feedback(SHARE_ERRORS[shareError] ?? 'Dijeljenje nije uspjelo.') : ''}
            ${shares.length
              ? html`<table class="table">
                  <thead><tr><th>Korisnik</th><th>E-mail</th><th></th></tr></thead>
                  <tbody>
                    ${shares.map(
                      (s) => html`<tr>
                        <td>${s.name}</td>
                        <td class="mono">${s.email}</td>
                        <td class="num">
                          <form method="post" action="/uplatnice/${uplatnica.id}/ukloni-dijeljenje">
                            <input type="hidden" name="user_id" value="${s.user_id}">
                            <button class="btn danger small" type="submit">Ukloni</button>
                          </form>
                        </td>
                      </tr>`,
                    )}
                  </tbody>
                </table>`
              : html`<p class="empty">Nije podijeljena ni s kim.</p>`}
            <form method="post" action="/uplatnice/${uplatnica.id}/podijeli" class="inline-form">
              <input type="email" name="email" placeholder="email@primjer.hr" required>
              <button class="btn" type="submit">Podijeli s korisnikom</button>
            </form>
          </section>`
        : ''}
    `,
  });
}
export function postavkePage({ values, user, errors = {}, nacini = [], poruka, greska }) {
  return layout({
    title: 'Postavke',
    user,
    body: html`
      <div class="page-head"><h1>Postavke</h1></div>

      ${poruka ? feedback(poruka, 'ok') : ''}
      ${greska ? feedback(greska) : ''}
      ${errors._ ? feedback(errors._, 'ok') : ''}

      <form method="post" action="/postavke" class="card form-grid">
        <h2 class="span-2">Podaci platitelja</h2>
        <p class="span-2 muted">
          Ime, adresa i grad upisuju se u barkod svake uplatnice kao <strong>platitelj</strong>.
        </p>
        ${platiteljFields(values, errors)}
        ${field({ name: 'email', label: 'E-mail', value: values.email, type: 'email', required: true, error: errors.email })}
        <div class="span-2 actions">
          <button class="btn primary" type="submit">Spremi</button>
        </div>
      </form>

      <section class="card">
        <h2>Načini plaćanja <span class="count">${nacini.length}</span></h2>
        <p class="muted">
          Čime plaćaš — nudi se kad označavaš uplatnicu plaćenom, pa se u povijesti
          vidi kako je svaka uplata izvršena.
        </p>
        ${nacini.length
          ? html`<ul class="method-list">
              ${nacini.map(
                (n) => html`<li>
                  <span>${n.naziv}</span>
                  <form method="post" action="/postavke/nacini/${n.id}/obrisi"
                        data-confirm="Ukloniti način „${n.naziv}“? Postojeće uplate ga zadržavaju u povijesti.">
                    <button class="icon-btn danger" type="submit" title="Ukloni" aria-label="Ukloni">${ICON_TRASH}</button>
                  </form>
                </li>`,
              )}
            </ul>`
          : html`<p class="empty">Još nema načina plaćanja.</p>`}
        <form method="post" action="/postavke/nacini" class="inline-form">
          <input name="naziv" placeholder="npr. Mobilna banka, Gotovina" required maxlength="40">
          <button class="btn" type="submit">Dodaj način</button>
        </form>
      </section>
    `,
  });
}

export function platiPage({ uplatnica, user, nacini = [], povratak }) {
  return layout({
    title: 'Plaćeno',
    user,
    body: html`
      <div class="page-head"><h1>Označi kao plaćeno</h1></div>

      <form method="post" action="/uplatnice/${uplatnica.id}/plati" class="card form-grid">
        <input type="hidden" name="povratak" value="${povratak}">
        <dl class="facts span-2">
          <dt>Uplatnica</dt><dd>${uplatnica.label}</dd>
          <dt>Primatelj</dt><dd>${uplatnica.prim_name}</dd>
          <dt>Poziv na broj</dt><dd class="mono">${uplatnica.poziv_na_broj || '—'}</dd>
          <dt>Iznos</dt><dd class="strong">${money(uplatnica.iznos_cents)}</dd>
          <dt>Sljedeće dospijeće</dt><dd>${formatDate(uplatnica.next_due)}</dd>
        </dl>

        <label class="field span-2">
          <span class="field-label">Način plaćanja</span>
          <select name="nacin_id">
            <option value="">— bez načina —</option>
            ${nacini.map(
              (n, i) => html`<option value="${n.id}" ${raw(i === 0 ? 'selected' : '')}>${n.naziv}</option>`,
            )}
          </select>
          <span class="field-hint">
            ${nacini.length
              ? html`Načine uređuješ u <a href="/postavke">Postavkama</a>.`
              : html`Još nemaš načina plaćanja — dodaj ih u <a href="/postavke">Postavkama</a>.`}
          </span>
        </label>

        <div class="span-2 actions">
          <button class="btn primary" type="submit">Potvrdi plaćanje</button>
          <a class="btn" href="${povratak}">Odustani</a>
        </div>
      </form>
    `,
  });
}

export function notFoundPage({ user }) {
  return layout({
    title: 'Nije pronađeno',
    user,
    body: html`<div class="card"><h1>Nije pronađeno</h1>
      <p class="muted">Tražena uplatnica ne postoji ili nemaš pristup.</p>
      <p><a class="btn" href="/uplatnice">Natrag na uplatnice</a></p></div>`,
  });
}

export function errorPage({ user, title, message }) {
  return layout({
    title,
    user,
    body: html`<div class="card">
      <h1>${title}</h1>
      <p class="muted">${message}</p>
      <p><a class="btn" href="/uplatnice">Natrag na uplatnice</a></p>
    </div>`,
  });
}

export function povijestPage({ mjeseci, user }) {
  return layout({
    title: 'Povijest',
    user,
    body: html`
      <div class="page-head"><h1>Povijest plaćanja</h1></div>

      ${mjeseci.length
        ? mjeseci.map(
            (m) => html`<section class="card">
              <div class="month-head">
                <h2>${monthLabel(m.mjesec)}</h2>
                <span class="month-total">${money(m.ukupno)}</span>
                <span class="count">${plural(m.stavke.length, 'uplata', 'uplate', 'uplata')}</span>
              </div>
              <table class="table">
                <thead>
                  <tr><th>Datum</th><th>Uplatnica</th><th>Način</th><th>Poziv na broj</th><th class="num">Iznos</th></tr>
                </thead>
                <tbody>
                  ${m.stavke.map(
                    (s) => html`<tr>
                      <td>${formatDate(s.paid_at.slice(0, 10))}</td>
                      <td><a href="/uplatnice/${s.uplatnica_id}">${s.label}</a></td>
                      <td>${s.nacin || '—'}</td>
                      <td class="mono">${s.poziv_na_broj || '—'}</td>
                      <td class="num">${money(s.iznos_cents)}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>
            </section>`,
          )
        : html`<section class="card"><p class="empty">Još nema zabilježenih plaćanja.</p></section>`}
    `,
  });
}
