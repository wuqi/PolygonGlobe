import { chromium } from 'playwright';
import { renderNet } from '../src/print/sheet.js';
import { SOLIDS } from '../src/print/solids.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('temp/work/diag', { recursive: true });

const key = process.argv[2] || 'dodeca';
const style = process.argv[3] || 'color';

const s = SOLIDS.find((x) => x.key === key);
const { svg, W, H } = renderNet({ solid: s, page: 'A4', style });
writeFileSync(`temp/work/diag/png-${key}.svg`, svg);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 });
const scaled = svg.replace(/width="[^"]*"/, 'width="960"').replace(/height="[^"]*"/, 'height="1358"');
await page.setContent(`<body style="margin:0;background:#fff">${scaled}</body>`);
await page.screenshot({ path: `temp/work/diag/png-${key}.png`, clip: { x: 0, y: 0, width: 960, height: 1358 } });
await browser.close();

console.log(`png-${key}.png  page=${W}x${H}mm  svg=${(svg.length / 1024).toFixed(0)}KB`);
console.log('svg at temp/work/diag/png-' + key + '.svg');