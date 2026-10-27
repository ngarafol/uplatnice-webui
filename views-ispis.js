/**
 * Samostalna A4 stranica za ispis uplatnice (HUB 3A nalog).
 *
 * Ne koristi layout() iz views.js: ispis ne smije imati navigaciju, a stilovi
 * su u public/print.css. Stranica je namijenjena browserovom "Print to PDF".
 */
import { html, raw } from './html.js';
import { formatAmount } from './hub3.js';

const clean = (value) => (value === null || value === undefined ? '' : String(value).trim());

/** Prazno polje na obrascu ostaje vidljivo kao "–", da se ne čini da je ispis pokvaren. */
const val = (value) => clean(value) || '–';

/** Adresa i grad se ispisuju samo ako postoje, da prazan blok ne bude tri crtice. */
const partyLines = (...values) =>
  values
    .map(clean)
    .filter((line) => line !== '')
    .map((line) => html`<p class="party-line">${line}</p>`);

export function ispisPage({ uplatnica, user, barcodeSvg }) {
  const amount = formatAmount(uplatnica.iznos_cents);
  // Dug iznos (do 15 znamenki) mora ostati unutar okvira "Valuta i iznos".
  const amountSize = amount.length > 12 ? ' amount-value-xs' : amount.length > 9 ? ' amount-value-sm' : '';
  return html`<!doctype html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${uplatnica.label} · Ispis uplatnice</title>
  <link rel="stylesheet" href="/static/print.css">
</head>
<body>
  <div class="print-bar">
    <span>Pregled ispisa — u dijalogu za ispis odaberi "Spremi kao PDF" ili pisač.</span>
    <button type="button" class="print-button" onclick="window.print()">Ispis / PDF</button>
  </div>

  <article class="sheet">
    <header class="sheet-head">
      <p class="form-code">Obrazac HUB 3A</p>
      <h1 class="sheet-title">NALOG ZA NACIONALNA PLAĆANJA</h1>
    </header>

    <div class="sheet-grid">
      <section class="box party payer" aria-label="Platitelj">
        <p class="box-label">Platitelj (naziv/ime i adresa)</p>
        <p class="party-name">${val(user?.name)}</p>
        ${partyLines(user?.address, user?.city)}
      </section>

      <section class="box amount" aria-label="Valuta i iznos">
        <p class="box-label">Valuta i iznos</p>
        <p class="amount-value${amountSize}"><span class="currency">EUR</span> ${amount}</p>
      </section>

      <section class="box party payee" aria-label="Primatelj">
        <p class="box-label">Primatelj (naziv/ime i adresa)</p>
        <p class="party-name">${val(uplatnica.prim_name)}</p>
        ${partyLines(uplatnica.prim_address, uplatnica.prim_city)}
      </section>

      <section class="fields" aria-label="Podaci plaćanja">
        <div class="field iban-field">
          <p class="box-label">IBAN primatelja</p>
          <p class="field-value iban">${val(uplatnica.iban)}</p>
        </div>
        <div class="field-row">
          <div class="field model-field">
            <p class="box-label">Model</p>
            <p class="field-value">${val(uplatnica.model)}</p>
          </div>
          <div class="field reference-field">
            <p class="box-label">Poziv na broj</p>
            <p class="field-value">${val(uplatnica.poziv_na_broj)}</p>
          </div>
        </div>
        <div class="field-row">
          <div class="field purpose-field">
            <p class="box-label">Šifra namjene</p>
            <p class="field-value">${val(uplatnica.sifra_namjene)}</p>
          </div>
          <div class="field description-field">
            <p class="box-label">Opis plaćanja</p>
            <p class="field-value">${val(uplatnica.opis)}</p>
          </div>
        </div>
      </section>

      <section class="barcode" aria-label="Barkod">
        <p class="box-label">Barkod</p>
        <div class="barcode-svg">${raw(barcodeSvg)}</div>
      </section>

      <section class="stamps" aria-label="Pečat i potpis">
        <div class="stamp-box"><p class="box-label">Pečat korisnika PU</p></div>
        <div class="stamp-box"><p class="box-label">Potpis korisnika PU</p></div>
      </section>
    </div>
  </article>
</body>
</html>`;
}
