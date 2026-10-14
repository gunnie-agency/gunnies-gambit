// Tells IndexNow (Bing, Yandex, Seznam, Naver and others) that the site changed, so it is recrawled soon after a
// deploy. Bing's index also feeds ChatGPT search and Copilot. CI runs this after `wrangler deploy`:
//
//   node --env-file=.env scripts/indexnow.mjs
//
// It submits every URL in the built sitemap, so a new page is announced without changing this script. It waits until
// the key file is live, because IndexNow fetches it to check the site is ours. A failed ping is a warning, not an
// error: the deploy itself has already succeeded.

import { readFileSync } from 'node:fs';

const site = process.env.VITE_SITE_URL;
const key = process.env.INDEXNOW_KEY;

if (!site || !key) {
  console.log('indexnow: VITE_SITE_URL or INDEXNOW_KEY is not set, skipping');
  process.exit(0);
}

const keyLocation = `${site}/${key}.txt`;

/** The pages of the deployed build, from dist/sitemap.xml; the home page alone if there is no build to read. */
function sitemapUrls() {
  try {
    const urls = [...readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (urls.length) return urls;
  } catch {
    // No build here, e.g. a manual run from a fresh checkout.
  }
  return [`${site}/`];
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function keyFileIsLive() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(keyLocation, { cache: 'no-store' }).catch(() => null);
    if (res?.ok && (await res.text()).trim() === key) return true;
    await sleep(5000);
  }
  return false;
}

if (!(await keyFileIsLive())) {
  console.log(`::warning::IndexNow skipped: ${keyLocation} did not serve the key within a minute`);
  process.exit(0);
}

const urlList = sitemapUrls();
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation, urlList }),
});

if (res.ok) console.log(`indexnow: ${res.status}, submitted ${urlList.join(', ')}`);
else console.log(`::warning::IndexNow answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
