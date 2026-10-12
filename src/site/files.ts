/**
 * The files that tell search engines, browsers and AI crawlers what the site is: structured data for the page head,
 * robots.txt, sitemap.xml, the web app manifest and llms.txt. They are generated at build time (see vite.config.ts)
 * so the app name and public URL come from `.env` only. No imports: vite.config.ts loads this file directly.
 */

export interface Site {
  /** Display name, from VITE_APP_NAME. */
  name: string;
  /** Public URL without a trailing slash, from VITE_SITE_URL. */
  url: string;
  /** Full Stockfish version, as in the engine file names. */
  stockfishVersion: string;
  /** Date of the last change (YYYY-MM-DD), for the sitemap. */
  lastmod?: string;
}

export const SUMMARY =
  'Play chess against the computer at your level, from beginner to full strength, ask for hints and analyse any ' +
  'position. Free, no account, and it runs entirely in your browser.';

const SOURCE_URL = 'https://github.com/gunnie-agency/gunnies-gambit';
const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';
const BACKGROUND = '#0b0d11';

// The same entities gunnie.nl describes, so search engines connect the app to its maker.
const GUNNIE = 'https://gunnie.nl/#organization';
const JEROEN = 'https://gunnie.nl/#jeroen';

const FEATURES = [
  'Play against the computer, from beginner to full strength',
  'Hints on request; evaluation and best move can each be switched on',
  'Analysis board with best move, evaluation, top three lines and arrows',
  'Move entry by tapping or typing SAN or UCI',
  'FEN and PGN import and export',
  'Dark and light theme, keyboard accessible',
];

/** The last word of the app name: the header's accent word and the manifest's short name. */
export function shortName(name: string): string {
  const trimmed = name.trim();
  return trimmed.slice(trimmed.lastIndexOf(' ') + 1);
}

export function structuredData(site: Site): object {
  const home = `${site.url}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        url: home,
        name: site.name,
        description: SUMMARY,
        inLanguage: 'en',
        publisher: { '@id': GUNNIE },
      },
      {
        '@type': 'WebApplication',
        '@id': `${home}#app`,
        name: site.name,
        url: home,
        description: SUMMARY,
        applicationCategory: 'GameApplication',
        applicationSubCategory: 'Chess',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and WebAssembly',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: FEATURES,
        screenshot: { '@type': 'ImageObject', url: `${site.url}/og.png`, width: 1200, height: 630 },
        inLanguage: 'en',
        license: LICENSE_URL,
        isPartOf: { '@id': `${home}#website` },
        author: { '@id': JEROEN },
        publisher: { '@id': GUNNIE },
      },
      { '@type': 'Organization', '@id': GUNNIE, name: 'Gunnie', url: 'https://gunnie.nl/' },
      {
        '@type': 'Person',
        '@id': JEROEN,
        name: 'Jeroen Gunneweg',
        url: 'https://gunnie.nl/en/about',
        worksFor: { '@id': GUNNIE },
      },
    ],
  };
}

/** JSON-LD for a `<script type="application/ld+json">`; `<` is escaped so no string can close the script. */
export function structuredDataScript(site: Site): string {
  return JSON.stringify(structuredData(site)).replaceAll('<', '\\u003c');
}

export function robotsTxt(site: Site): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

export function sitemapXml(site: Site): string {
  const lastmod = site.lastmod ? `<lastmod>${site.lastmod}</lastmod>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `  <url><loc>${site.url}/</loc>${lastmod}</url>\n` +
    '</urlset>\n'
  );
}

/** Relative URLs, so the manifest keeps working when the build is served from a sub-path. */
export function webManifest(site: Site): string {
  const manifest = {
    name: site.name,
    short_name: shortName(site.name),
    description: SUMMARY,
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    lang: 'en',
    categories: ['games', 'education'],
    icons: [
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function llmsTxt(site: Site): string {
  // One line per paragraph or list item: the values filled in would make hard wraps ragged.
  return (
    [
      `# ${site.name}`,
      `> ${SUMMARY}`,
      `${site.name} (${site.url}/) is a free, open-source chess practice app on a single page with two modes:`,
      [
        `- Play: a game against the computer at a chosen strength, from Beginner and Novice through Elo 1400 to 2400 up to full strength. Hints on request; the evaluation and ` +
          'the best move can each be switched on.',
        '- Analyse: an analysis board. Enter moves for both sides by tapping or typing SAN or UCI, and see the best ' +
          'move, the evaluation and the top three lines. Positions load from FEN, games from PGN.',
      ].join('\n'),
      `The engine is Stockfish ${site.stockfishVersion}, compiled to WebAssembly and run in the browser. There is no ` +
        'backend and no account: games and settings stay in the browser. Visits are counted with cookieless ' +
        'Cloudflare Web Analytics.',
      '## Fair play',
      `${site.name} is for practice, games against computer bots and reviewing your own games. Using engine help in ` +
        'any online game against a human, rated or casual, or in an over-the-board tournament is against the rules ' +
        'and gets accounts banned on Chess.com and Lichess. It has no features for reading moves from other sites.',
      '## Links',
      [
        `- [Source code](${SOURCE_URL}): GPL-3.0-or-later`,
        '- [Gunnie](https://gunnie.nl/): the Dutch Magento and e-commerce agency that made it',
      ].join('\n'),
    ].join('\n\n') + '\n'
  );
}
