/**
 * PDF417 barkod za HUB3A uplatnicu, renderiran kao SVG.
 *
 * SVG a ne PNG: oštar je na svakoj veličini i u ispisu, a bwip-js ga generira
 * bez ikakvog native builda (nema canvas, nema ImageMagicka).
 */
import bwipjs from 'bwip-js';

const DEFAULT_OPTIONS = {
  bcid: 'pdf417',
  eclevel: 4, // korekcija greške; 4 je uobičajeno za HUB3 i podnosi oštećenje/odsjaj
  scale: 3,
  // ponytail: 4 modula tišine je minimum za pouzdano skeniranje; povećati ako
  // se barkod teško čita sa zaslona ili s papira.
  paddingwidth: 4,
  paddingheight: 4,
};

/** @returns {string} SVG markup s PDF417 barkodom za zadani payload. */
export function pdf417svg(payload, options = {}) {
  if (typeof payload !== 'string' || !payload.startsWith('HRVHUB30')) {
    throw new Error('Payload ne izgleda kao HUB3 barkod (mora počinjati s HRVHUB30).');
  }
  return bwipjs.toSVG({ ...DEFAULT_OPTIONS, ...options, text: payload });
}

