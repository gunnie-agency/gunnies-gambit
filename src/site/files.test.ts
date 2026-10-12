import { describe, expect, it } from 'vitest';
import { llmsTxt, robotsTxt, shortName, sitemapXml, structuredDataScript, webManifest, type Site } from './files';

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
  });
});
