import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../engine/levels';
import { LESSONS } from '../learn/lessons';
import {
  PUZZLE_COUNT,
  faq,
  faqHtml,
  howToPlayStructuredData,
  indexNowKeyFile,
  llmsTxt,
  robotsTxt,
  shortName,
  sitemapXml,
  jsonLdScript,
  structuredData,
  webManifest,
  type Site,
} from './files';

const site: Site = {
  name: "Gunnie's Gambit",
  url: 'https://chess.example',
  stockfishVersion: '19.0.1',
  lastmod: '2026-10-12',
};

describe('shortName', () => {
  it('is the last word of the name', () => {
    expect(shortName("Gunnie's Gambit")).toBe('Gambit');
    expect(shortName('  Solo ')).toBe('Solo');
  });
});

describe('structured data', () => {
  it('describes the app as a free web application published by Gunnie', () => {
    const data = JSON.parse(jsonLdScript(structuredData(site))) as { '@graph': Record<string, unknown>[] };
    const app = data['@graph'].find((node) => node['@type'] === 'WebApplication');
    expect(app).toMatchObject({
      name: "Gunnie's Gambit",
      url: 'https://chess.example/',
      applicationCategory: 'GameApplication',
      offers: { price: '0' },
      publisher: { '@id': 'https://gunnie.nl/#organization' },
    });
  });

  it('says the app is not a chess opening and carries the FAQ', () => {
    const graph = (JSON.parse(jsonLdScript(structuredData(site))) as { '@graph': Record<string, unknown>[] })['@graph'];
    const app = graph.find((node) => node['@type'] === 'WebApplication');
    expect(app?.disambiguatingDescription).toContain('not a chess opening');
    const faqPage = graph.find((node) => node['@type'] === 'FAQPage') as { mainEntity: { name: string }[] };
    expect(faqPage.mainEntity.map((q) => q.name)).toEqual(faq(site).map((q) => q.question));
  });

  it('dates both pages from the last change, and leaves the date out when it is unknown', () => {
    const graph = (data: object) => (data as { '@graph': Record<string, unknown>[] })['@graph'];
    const app = graph(structuredData(site)).find((node) => node['@type'] === 'WebApplication');
    const page = graph(howToPlayStructuredData(site)).find(
      (node) => node['@id'] === 'https://chess.example/how-to-play#page',
    );
    expect(app?.dateModified).toBe('2026-10-12');
    expect(page?.dateModified).toBe('2026-10-12');
    const undated = { ...site, lastmod: undefined };
    expect(JSON.stringify([structuredData(undated), howToPlayStructuredData(undated)])).not.toContain('dateModified');
  });

  it('cannot close its script element', () => {
    const script = jsonLdScript(structuredData({ ...site, name: '</script><script>alert(1)</script>' }));
    expect(script).not.toContain('<');
    expect(JSON.stringify(JSON.parse(script))).toContain('</script>');
  });
});

describe('robotsTxt', () => {
  it('allows everything and points to the sitemap', () => {
    expect(robotsTxt(site)).toBe('User-agent: *\nAllow: /\n\nSitemap: https://chess.example/sitemap.xml\n');
  });
});

describe('sitemapXml', () => {
  it('lists the home page with its last change', () => {
    expect(sitemapXml(site)).toContain('<url><loc>https://chess.example/</loc><lastmod>2026-10-12</lastmod></url>');
  });

  it('leaves out lastmod when the date is unknown', () => {
    expect(sitemapXml({ ...site, lastmod: undefined })).not.toContain('lastmod');
  });
});

describe('webManifest', () => {
  it('uses relative URLs and includes a maskable icon', () => {
    const manifest = JSON.parse(webManifest(site)) as Record<string, unknown> & { icons: { purpose?: string }[] };
    expect(manifest).toMatchObject({ name: "Gunnie's Gambit", short_name: 'Gambit', start_url: './', scope: './' });
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
});

describe('llmsTxt', () => {
  it('names the app, the engine version and the fair-play rule', () => {
    const text = llmsTxt(site);
    expect(text.startsWith("# Gunnie's Gambit\n")).toBe(true);
    expect(text).toContain('Stockfish 19.0.1');
    expect(text).toContain('## Fair play');
    expect(text).toContain('not a chess opening');
    expect(text).toContain(`### ${faq(site)[0]?.question}`);
  });
});

describe('llmsTxt rules in brief', () => {
  it('links every rule to a section that exists on the How to play page', () => {
    const page = readFileSync(new URL('../../how-to-play.html', import.meta.url), 'utf8');
    const section = llmsTxt(site).split('## Rules in brief\n\n')[1]?.split('\n\n')[0] ?? '';
    const anchors = [...section.matchAll(/\(https:\/\/chess\.example\/how-to-play#([\w-]+)\)/g)].map((m) => m[1]);
    expect(anchors).toEqual(['goal', 'pieces', 'check', 'special', 'draws']);
    for (const anchor of anchors) expect(page).toContain(`id="${anchor}"`);
  });
});

describe('faqHtml', () => {
  it('renders every question as a disclosure, escaped', () => {
    const html = faqHtml({ ...site, name: 'A <b>"bold"</b> & Co' });
    expect(html.match(/<details>/g)).toHaveLength(faq(site).length);
    expect(html).toContain('Is A &lt;b&gt;&quot;bold&quot;&lt;/b&gt; &amp; Co a chess opening?');
    expect(html).not.toContain('<b>');
  });
});

describe('indexNowKeyFile', () => {
  it('names the file after the key and contains only the key', () => {
    expect(indexNowKeyFile('b2e14306057b13d62d5aebdd230864b1')).toEqual({
      fileName: 'b2e14306057b13d62d5aebdd230864b1.txt',
      body: 'b2e14306057b13d62d5aebdd230864b1',
    });
  });

  it('rejects keys IndexNow would not accept', () => {
    expect(() => indexNowKeyFile('short')).toThrow();
    expect(() => indexNowKeyFile('../../etc/passwd')).toThrow();
  });
});

describe('the How to play page', () => {
  it('is in the sitemap next to the home page', () => {
    expect(sitemapXml(site)).toContain(
      '<url><loc>https://chess.example/how-to-play</loc><lastmod>2026-10-12</lastmod></url>',
    );
  });

  it('is described as a beginner tutorial on the same website, with a breadcrumb back home', () => {
    const graph = (howToPlayStructuredData(site) as { '@graph': Array<Record<string, unknown>> })['@graph'];
    const page = graph.find((node) => node['@id'] === 'https://chess.example/how-to-play#page');
    expect(page?.['@type']).toEqual(['WebPage', 'LearningResource']);
    expect(page?.isPartOf).toMatchObject({ '@id': 'https://chess.example/#website' });
    expect(graph.some((node) => node['@type'] === 'BreadcrumbList')).toBe(true);
  });

  it('is linked from llms.txt and the FAQ', () => {
    expect(llmsTxt(site)).toContain('https://chess.example/how-to-play');
    expect(faq(site).some((q) => q.answer.includes('https://chess.example/how-to-play'))).toBe(true);
  });
});

describe('what the texts claim', () => {
  const answer = (question: string) => faq(site).find((q) => q.question === question)?.answer ?? '';

  it('counts the puzzles the How to play page has', () => {
    expect(PUZZLE_COUNT).toBe(LESSONS.filter((lesson) => lesson.mode === 'puzzle').length);
    expect(answer('Are there puzzles?')).toContain(`${PUZZLE_COUNT} tactics puzzles`);
  });

  it('describes every Elo level the way the level picker does', () => {
    const strength = answer('How strong is the computer?');
    for (const { label } of LEVELS.filter((level) => level.id.startsWith('elo'))) {
      const [, elo, who] = /^Elo (\d+) · (.+)$/.exec(label) ?? [];
      expect(strength).toMatch(new RegExp(`${elo} \\(an? ${who}\\)`));
    }
  });
});
