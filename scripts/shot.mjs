import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
  delete process.env[k];
}
process.env.NO_PROXY = '*';
process.env.no_proxy = '*';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'temp/work/shots/page.png';
const poly = process.argv[4];

mkdirSync(out.replace(/[/\\][^/\\]+$/, ''), { recursive: true });

const browser = await chromium.launch({
  args: ['--proxy-server=direct://', '--proxy-bypass-list=*', '--no-proxy-server'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

if (poly) {
  const btn = page.locator(`button[data-key="${poly}"]`);
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(500);
  } else {
    errors.push(`no button for poly: ${poly}`);
  }
}

await page.screenshot({ path: out });
console.log('saved:', out);
if (errors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of errors) console.log(' -', e);
  process.exitCode = 2;
} else {
  console.log('no console errors');
}
await browser.close();
