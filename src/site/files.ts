/**
 * The files that tell search engines, browsers and AI crawlers what the site is: structured data for the page head,
 * the FAQ section, robots.txt, sitemap.xml, the web app manifest, llms.txt and the IndexNow key file. They are
 * generated at build time (see vite.config.ts) so the app name and public URL come from `.env` only, and each text
 * (the FAQ above all) is written once for both the page and the machine-readable copies. No imports: vite.config.ts
 * loads this file directly.
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

export interface Faq {
  question: string;
  answer: string;
}

export const SUMMARY =
  'Play chess against the computer at your level, from beginner to full strength, ask for hints, review your games ' +
  'for mistakes and analyse any position. Free, no account, and it runs entirely in your browser.';

/** The name sounds like a chess opening; search engines and AI answers need telling that it is an app. */
const NOT_AN_OPENING = 'A web app for practising and analysing chess, not a chess opening.';

const SOURCE_URL = 'https://github.com/gunnie-agency/gunnies-gambit';
const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';
const BACKGROUND = '#0b0d11';

// The same entities gunnie.nl describes, so search engines connect the app to its maker.
const GUNNIE = 'https://gunnie.nl/#organization';
const JEROEN = 'https://gunnie.nl/#jeroen';

/** The How to play page, served without `.html` (Cloudflare and GitHub Pages both map the clean URL to the file). */
export const HOW_TO_PLAY_PATH = '/how-to-play';
const HOW_TO_PLAY_TITLE = 'How to play chess';
const HOW_TO_PLAY_SUMMARY =
  'The rules of chess for beginners: how each piece moves, check, checkmate, stalemate, castling, en passant and ' +
  'promotion, with a practice board for each. Then first tactics puzzles, the basic endgames, and how to use the ' +
  'app to play, get hints and review your games.';

/** How many tactics puzzles the How to play page has; a test checks it against the lessons. */
export const PUZZLE_COUNT = 12;

const GUNNIE_NODE = { '@type': 'Organization', '@id': GUNNIE, name: 'Gunnie', url: 'https://gunnie.nl/' };
const JEROEN_NODE = {
  '@type': 'Person',
  '@id': JEROEN,
  name: 'Jeroen Gunneweg',
  url: 'https://gunnie.nl/en/about',
  worksFor: { '@id': GUNNIE },
};

const FEATURES = [
  'Play against the computer, from beginner to full strength',
  'Hints on request; evaluation and best move can each be switched on',
  'Analysis board with best move, evaluation, top three lines and arrows',
  'Game review that marks inaccuracies, mistakes and blunders, shows the better move and an accuracy per side',
  'Practise your own mistakes from a reviewed game',
  'Review your finished games from Lichess or Chess.com by username',
  'Opening names in the move list and the review',
  'Move entry by tapping or typing SAN or UCI',
  'FEN and PGN import and export; download or share the game as PGN',
  'Works offline after the first visit',
  'Dark and light theme, keyboard accessible',
  'A How to play page with the rules, a practice board for every piece and special move, tactics puzzles and basic ' +
    'endgames',
];

export function faq(site: Site): Faq[] {
  return [
    {
      question: `Is ${site.name} a chess opening?`,
      answer:
        `No. Despite the name, ${site.name} is a free web app for practising chess against the computer and ` +
        "analysing positions. The name is a play on chess gambits such as the Queen's Gambit.",
    },
    {
      question: 'I do not know the rules yet. Where do I start?',
      answer:
        `Start with How to play (${site.url}${HOW_TO_PLAY_PATH}). It explains how every piece moves, check, ` +
        'checkmate, stalemate and the special moves, each with a small board to try it on. Then play the Beginner ' +
        'level with a hint whenever you are stuck, and review the game when it ends.',
    },
    {
      question: 'Is it free, and do I need an account?',
      answer: 'It is free and open source, with no account, no sign-up and no ads.',
    },
    {
      question: 'How strong is the computer?',
      answer:
        'There are seven levels. Beginner and Novice play weak moves on purpose and miss simple tactics. The Elo ' +
        'levels play at roughly 1400 (a casual player), 1700 (a club player), 2000 (an expert) and 2400 (a master), ' +
        'and Full strength is the complete engine, stronger than any human player.',
    },
    {
      question: 'Can I analyse my own games?',
      answer:
        'Yes. Switch to Analyse, then paste a PGN or a FEN position under "Position & PGN", or enter the moves on ' +
        'the board. You see the best move, the evaluation, the top three lines and the name of the opening. ' +
        'Review game then goes through the whole game and marks the mistakes.',
    },
    {
      question: 'Can I review my games from Lichess or Chess.com?',
      answer:
        'Yes. Open "Your games", pick the site and type your username. You get your most recent finished games; ' +
        'pick one to open it in Analyse and review it. Only the username is sent, straight from your browser to ' +
        'the site you picked, without cookies. No password or account link is needed.',
    },
    {
      question: 'How does the game review work?',
      answer:
        'When a game against the computer ends, or for any game in Analyse, choose Review game. The engine ' +
        'evaluates every position and marks a move as an inaccuracy (?!), mistake (?) or blunder (??) by how much ' +
        'of your winning chances it gave away, with the better move shown on the board. The thresholds and the ' +
        'accuracy percentage follow the Lichess method, so the figures are close to Lichess’s but not identical. ' +
        'Computers with more cores run up to three engines side by side: a 40-move game takes about 15 to 40 ' +
        'seconds on a recent laptop or desktop, and longer on a phone.',
    },
    {
      question: 'How do I learn from my mistakes?',
      answer:
        'After a review, choose Practise my mistakes. It takes you back to the position before each of your ' +
        'mistakes and blunders, and you look for a better move. The engine’s choice counts, and so does any move ' +
        'the review would not have marked. Your opponent’s mistakes are left out.',
    },
    {
      question: 'Are there puzzles?',
      answer:
        `How to play has ${PUZZLE_COUNT} tactics puzzles, grouped by theme: double attacks, attacks along a line, ` +
        'removing the defender and mating patterns. It also has the basic endgames: mate with king and queen, and ' +
        'with king and rook, against a lone king that the page moves for you, and king and pawn against king. Your ' +
        'browser remembers which ones you solved.',
    },
    {
      question: 'Do my games leave my device?',
      answer:
        'No. The engine runs in your browser and your games, settings and puzzle progress are stored there too. ' +
        'Apart from an anonymous, cookieless visit count, the only thing sent anywhere is the username you type ' +
        'under "Your games", to the site you pick.',
    },
    {
      question: 'Does it work on my phone?',
      answer:
        'Yes. It works in any modern browser on a phone, tablet or computer, and you can add it to your home screen.',
    },
    {
      question: 'Does it work offline?',
      answer:
        'Yes, after the first visit. The pages and the engine are then stored in your browser, so you can play, ' +
        'analyse, review and solve puzzles without a connection. Only fetching your games from Lichess or ' +
        'Chess.com needs the internet.',
    },
    {
      question: 'Can I use it during an online game?',
      answer:
        'Only against computer bots, where the site allows it. Using engine help in any online game against a ' +
        'human, rated or casual, or in an over-the-board tournament is against the rules and gets accounts banned ' +
        'on Chess.com and Lichess.',
    },
  ];
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** The FAQ as disclosure widgets, for the page. */
export function faqHtml(site: Site): string {
  return faq(site)
    .map(
      ({ question, answer }) =>
        `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`,
    )
    .join('\n');
}

/** schema.org's dateModified from the date of the last change, when it is known. */
function modified(site: Site): { dateModified?: string } {
  return site.lastmod ? { dateModified: site.lastmod } : {};
}

/** The rules in one line each, linked to the How to play section that explains them (ids in how-to-play.html). */
const RULES: ReadonlyArray<{ anchor: string; title: string; text: string }> = [
  {
    anchor: 'goal',
    title: 'The goal',
    text:
      "checkmate the opponent's king, attacking it so that it cannot escape. White moves first, then the players take " +
      'turns; nobody can pass.',
  },
  {
    anchor: 'pieces',
    title: 'How the pieces move',
    text:
      'the king one square in any direction; the queen any distance in a straight line or diagonally; the rook any ' +
      'distance in a straight line; the bishop any distance diagonally; the knight in an L shape, jumping over ' +
      'pieces; the pawn one square forward (two from its starting square), capturing one square diagonally ' +
      'forward.',
  },
  {
    anchor: 'check',
    title: 'Check, checkmate and stalemate',
    text:
      'a king under attack is in check and must get out of it at once. A player in check with no way out is ' +
      'checkmated and loses; a player not in check but without a legal move is stalemated, and the game is a draw.',
  },
  {
    anchor: 'special',
    title: 'Three special moves',
    text:
      'castling (the king moves two squares towards a rook, which jumps to its other side), en passant (a pawn ' +
      'captures an enemy pawn that has just moved two squares past it) and promotion (a pawn reaching the far side ' +
      'becomes a queen, rook, bishop or knight).',
  },
  {
    anchor: 'draws',
    title: 'Other ways to draw',
    text:
      'by agreement, by threefold repetition, by the 50-move rule, or when neither side has enough pieces left to ' +
      'checkmate.',
  },
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
        alternateName: `${site.name} chess app`,
        url: home,
        description: SUMMARY,
        disambiguatingDescription: NOT_AN_OPENING,
        sameAs: [SOURCE_URL],
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
        ...modified(site),
      },
      {
        '@type': 'FAQPage',
        '@id': `${home}#faq`,
        url: home,
        isPartOf: { '@id': `${home}#website` },
        about: { '@id': `${home}#app` },
        mainEntity: faq(site).map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
      GUNNIE_NODE,
      JEROEN_NODE,
    ],
  };
}

/** The How to play page: a beginner's tutorial that is part of the same website, by the same people. */
export function howToPlayStructuredData(site: Site): object {
  const home = `${site.url}/`;
  const page = `${site.url}${HOW_TO_PLAY_PATH}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['WebPage', 'LearningResource'],
        '@id': `${page}#page`,
        url: page,
        name: HOW_TO_PLAY_TITLE,
        description: HOW_TO_PLAY_SUMMARY,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', '@id': `${home}#website`, url: home, name: site.name },
        about: { '@type': 'Thing', name: 'Chess', sameAs: 'https://en.wikipedia.org/wiki/Chess' },
        learningResourceType: 'Tutorial',
        educationalLevel: 'Beginner',
        teaches: [
          'How the chess pieces move',
          'Check, checkmate and stalemate',
          'Castling, en passant and promotion',
          'How a chess game can end in a draw',
          'First tactics: forks, pins, skewers and mating patterns',
          'Basic endgames: mate with queen or rook, and king and pawn against king',
        ],
        isAccessibleForFree: true,
        breadcrumb: { '@id': `${page}#breadcrumb` },
        author: { '@id': JEROEN },
        publisher: { '@id': GUNNIE },
        ...modified(site),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${page}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.name, item: home },
          { '@type': 'ListItem', position: 2, name: HOW_TO_PLAY_TITLE, item: page },
        ],
      },
      GUNNIE_NODE,
      JEROEN_NODE,
    ],
  };
}

/** JSON-LD for a `<script type="application/ld+json">`; `<` is escaped so no string can close the script. */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replaceAll('<', String.raw`\u003c`);
}

export function robotsTxt(site: Site): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`;
}

export function sitemapXml(site: Site): string {
  const lastmod = site.lastmod ? `<lastmod>${site.lastmod}</lastmod>` : '';
  const urls = [`${site.url}/`, `${site.url}${HOW_TO_PLAY_PATH}`].map(
    (loc) => `  <url><loc>${loc}</loc>${lastmod}</url>\n`,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('') +
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
  const rules = RULES.map(
    ({ anchor, title, text }) => `- [${title}](${site.url}${HOW_TO_PLAY_PATH}#${anchor}): ${text}`,
  );
  // One line per paragraph or list item: the values filled in would make hard wraps ragged.
  return (
    [
      `# ${site.name}`,
      `> ${SUMMARY}`,
      `${site.name} (${site.url}/) is a free, open-source chess practice app that runs in the browser. ` +
        'Despite the name, it is not a chess opening. It has two modes, a game review and a page for learning:',
      [
        '- Play: a game against the computer at a chosen strength, from Beginner and Novice through Elo 1400 to ' +
          '2400 up to full strength. Hints on request; the evaluation and the best move can each be switched on.',
        '- Analyse: an analysis board. Enter moves for both sides by tapping or typing SAN or UCI, and see the best ' +
          'move, the evaluation, the top three lines and the name of the opening. Positions load from FEN, games ' +
          'from PGN, and the game downloads as PGN.',
        '- Review: after a game against the computer, or for any game in Analyse, the engine evaluates every ' +
          'position and marks inaccuracies, mistakes and blunders by lost winning chances, with the better move ' +
          'and an accuracy percentage per side. Practise my mistakes then goes back to the position before each of ' +
          'your own mistakes and blunders, to find a better move.',
        '- Your games: your recent finished games on Lichess or Chess.com, found by username, to open and review.',
        `- How to play: the rules with a practice board for each, ${PUZZLE_COUNT} tactics puzzles by theme and the ` +
          'basic endgames.',
      ].join('\n'),
      `The engine is Stockfish ${site.stockfishVersion}, compiled to WebAssembly and run in the browser. There is no ` +
        'backend and no account: games, settings and puzzle progress stay in the browser, and after the first ' +
        'visit the app works offline. Only Your games contacts another site: the browser sends the username to ' +
        'Lichess or Chess.com, whichever you pick. Visits are counted with cookieless Cloudflare Web Analytics.',
      '## Fair play',
      `${site.name} is for practice, games against computer bots and reviewing your own games. Using engine help in ` +
        'any online game against a human, rated or casual, or in an over-the-board tournament is against the rules ' +
        'and gets accounts banned on Chess.com and Lichess. It has no features for reading moves from other sites.',
      '## Rules in brief',
      rules.join('\n'),
      '## Questions',
      ...faq(site).map(({ question, answer }) => `### ${question}\n\n${answer}`),
      '## Links',
      [
        `- [How to play](${site.url}${HOW_TO_PLAY_PATH}): the rules for beginners, with a practice board for each piece and special move, tactics puzzles and basic endgames`,
        `- [Source code](${SOURCE_URL}): GPL-3.0-or-later`,
        '- [Gunnie](https://gunnie.nl/): the Dutch Magento and e-commerce agency that made it',
      ].join('\n'),
    ].join('\n\n') + '\n'
  );
}

/** IndexNow proves ownership with a text file named after the key that contains only the key. */
export function indexNowKeyFile(key: string): { fileName: string; body: string } {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('IndexNow key must be 8-128 letters, digits or dashes');
  return { fileName: `${key}.txt`, body: key };
}
