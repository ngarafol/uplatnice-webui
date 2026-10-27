/**
 * Minimalni HTML templating: html`...` automatski escapea svaku interpolaciju,
 * pa zaboravljen escape ne može postati XSS.
 *
 * Ugniježđeni html`...` se ne escapea ponovno jer je Html instanca.
 * `false`/`null`/`undefined` se preskaču, pa radi `${uvjet && html`...`}`.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

class Html {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** Označi već siguran HTML (npr. SVG barkod koji generiramo sami). */
export const raw = (value) => new Html(String(value ?? ''));

function renderPart(value) {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(renderPart).join('');
  if (value === false || value === null || value === undefined) return '';
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += renderPart(values[i]) + strings[i + 1];
  }
  return new Html(out);
}
