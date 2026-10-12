import { describe, expect, it } from 'vitest';
import {
  faq,
  faqHtml,
  indexNowKeyFile,
  llmsTxt,
  robotsTxt,
  shortName,
  sitemapXml,
  structuredDataScript,
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

describe('structuredDataScript', () => {
  it('describes the app as a free web application published by Gunnie', () => {
    const data = JSON.parse(structuredDataScript(site)) as { '@graph': Record<string, unknown>[] };
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
    const graph = (JSON.parse(structuredDataScript(site)) as { '@graph': Record<string, unknown>[] })['@graph'];
    const app = graph.find((node) => node['@type'] === 'WebApplication');
    expect(app?.disambiguatingDescription).toContain('not a chess opening');
    const faqPage = graph.find((node) => node['@type'] === 'FAQPage') as { mainEntity: { name: string }[] };
    expect(faqPage.mainEntity.map((q) => q.name)).toEqual(faq(site).map((q) => q.question));
  });

  it('cannot close its script element', () => {
    const script = structuredDataScript({ ...site, name: '</script><script>alert(1)</script>' });
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
