/**
 * Markup shared by every page: the Gunnie logo symbol and the footer. The site-files plugin in vite.config.ts puts
 * them in place of the `<!-- %LOGO_SYMBOL% -->` and `<!-- %FOOTER% -->` comments, so each exists once.
 */

import { escapeHtml } from './files.ts';

const LOGO_PATH =
  'M103.39 116V106.12H120.01Q124.21 106.12 126.29 104.13Q128.37 102.14 128.37 98.27V93.44L128.57 83.22H126.02L128.52 80.84Q128.52 87.32 124.56 91.02Q120.61 94.72 113.86 94.72Q105.45 94.72 100.51 89.06Q95.56 83.4 95.56 73.78V62.89Q95.56 53.31 100.51 47.65Q105.45 42 113.86 42Q120.61 42 124.56 45.7Q128.52 49.4 128.52 55.89L126.02 53.5H128.52L128.3 43H139.89V98.5Q139.89 106.6 134.64 111.3Q129.38 116 120.17 116ZM117.76 84.62Q122.69 84.62 125.49 81.63Q128.3 78.64 128.3 73.28V63.44Q128.3 58.08 125.49 55.09Q122.69 52.1 117.76 52.1Q112.72 52.1 109.97 55.04Q107.22 57.97 107.22 63.44V73.28Q107.22 78.75 109.97 81.68Q112.72 84.62 117.76 84.62ZM173.94 99Q163.74 99 157.79 93.2Q151.85 87.39 151.85 77.38V43H163.5V77.34Q163.5 82.83 166.26 85.84Q169.02 88.84 173.94 88.84Q178.88 88.84 181.69 85.84Q184.5 82.83 184.5 77.34V43H196.15V77.38Q196.15 87.43 190.13 93.22Q184.11 99 173.94 99ZM208.05 98V43H219.48V53.5H222.49L219.48 56.22Q219.48 49.5 223.43 45.75Q227.37 42 234.23 42Q242.39 42 247.27 47.32Q252.15 52.64 252.15 61.66V98H240.5V62.89Q240.5 57.69 237.74 54.9Q234.99 52.1 230.17 52.1Q225.28 52.1 222.49 55.04Q219.7 57.97 219.7 63.44V98ZM264.05 98V43H275.48V53.5H278.49L275.48 56.22Q275.48 49.5 279.43 45.75Q283.37 42 290.23 42Q298.39 42 303.27 47.32Q308.15 52.64 308.15 61.66V98H296.5V62.89Q296.5 57.69 293.74 54.9Q290.99 52.1 286.17 52.1Q281.28 52.1 278.49 55.04Q275.7 57.97 275.7 63.44V98ZM319.84 98V87.41H339.11V53.55H322.34V43H350.33V87.41H367.72V98ZM343.72 33.63Q340.07 33.63 337.92 31.75Q335.78 29.87 335.78 26.67Q335.78 23.4 337.92 21.5Q340.07 19.59 343.72 19.59Q347.38 19.59 349.52 21.5Q351.66 23.4 351.66 26.67Q351.66 29.87 349.52 31.75Q347.38 33.63 343.72 33.63ZM398.04 99Q391.19 99 386.07 96.33Q380.96 93.67 378.18 88.83Q375.39 83.99 375.39 77.56V63.44Q375.39 56.95 378.18 52.14Q380.96 47.33 386.07 44.67Q391.19 42 398.04 42Q404.9 42 409.97 44.67Q415.04 47.33 417.82 52.14Q420.61 56.95 420.61 63.44V73.28H386.63V77.56Q386.63 83.48 389.57 86.58Q392.52 89.67 398.13 89.67Q402.58 89.67 405.32 88.11Q408.05 86.55 408.75 83.56H420.27Q418.98 90.59 412.9 94.8Q406.83 99 398.04 99ZM409.37 66.52V63.35Q409.37 57.47 406.52 54.33Q403.67 51.18 398.04 51.18Q392.48 51.18 389.55 54.37Q386.63 57.56 386.63 63.44V65.72L410.21 65.63Z';

/**
 * The logo, defined once per page and drawn with `<use href="#gunnie-logo">`. The symbol carries the real crop;
 * referencing elements use `viewBox="0 0 493 97"`, and repeating the crop on them clips the logo.
 */
export function logoSymbol(): string {
  return (
    '<svg width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false">' +
    '<symbol id="gunnie-logo" viewBox="3 19 493 97">' +
    '<polyline points="14,36 56,66 14,96" fill="none" stroke-width="16" stroke-linecap="square" ' +
    'style="stroke: var(--gunnie-accent)"/>' +
    `<path d="${LOGO_PATH}" style="fill: var(--gunnie-ink)"/>` +
    '<rect x="442" y="84" width="54" height="14" style="fill: var(--gunnie-accent)"/>' +
    '</symbol></svg>'
  );
}

/** An outside link: opens in a new tab and says so to screen readers (see the `newTab` element in the footer). */
function outside(href: string, text: string): string {
  return `<a href="${href}" target="_blank" rel="noopener" aria-describedby="newTab">${text}</a>`;
}

/** The fair-play rule, the credits and the Gunnie byline. */
export function footerHtml(appName: string): string {
  const name = escapeHtml(appName);
  return `<footer>
  <nav class="footer-nav" aria-label="Pages">
    <a href="./">Play</a>
    <a href="./how-to-play">How to play</a>
    ${outside('https://github.com/gunnie-agency/gunnies-gambit', 'Source code')}
  </nav>
  <p>
    ${name} is for practice, games against computer bots and reviewing your own games. Using engine help in any online
    game against a human, rated or casual, or in an over-the-board tournament is against the rules and gets accounts
    banned on Chess.com and Lichess.
  </p>
  <p>
    Analysis runs entirely in your browser with ${outside('https://stockfishchess.org/', 'Stockfish')}
    (${outside('stockfish/COPYING.txt', 'GPLv3')}). Your games never leave your browser; only an anonymous, cookieless
    visit count goes to Cloudflare Web Analytics. Pieces by Colin M.L. Burnett, via
    ${outside('https://github.com/lichess-org/chessground', 'Chessground')}
    (${outside('https://github.com/lichess-org/chessground/blob/master/LICENSE', 'GPL')}).
  </p>
  <p class="made-by">
    ${outside('https://gunnie.nl', 'Created by <svg class="gunnie-logo" viewBox="0 0 493 97" role="img" aria-label="Gunnie"><use href="#gunnie-logo" /></svg>')}
  </p>
  <span id="newTab" hidden>Opens in a new tab</span>
</footer>`;
}
