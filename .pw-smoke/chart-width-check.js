const { chromium } = require('C:/Users/home/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, 'screens');

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });

  await page.goto(BASE + '/plugin/900003819', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 7D
  await page.getByRole('radio', { name: '7D' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '7d.png') });
  const svg7 = page.locator('.ppc-plotwrap svg').first();
  const box7 = await svg7.boundingBox();
  const wrap7 = await page.locator('.ppc-plotwrap').first().boundingBox();
  console.log('7D svg box:', box7, 'wrap box:', wrap7);

  // 24h
  await page.getByRole('radio', { name: '24h' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '24h.png') });
  const svg24 = page.locator('.ppc-plotwrap svg').first();
  const box24 = await svg24.boundingBox();
  const wrap24 = await page.locator('.ppc-plotwrap').first().boundingBox();
  console.log('24h svg box:', box24, 'wrap box:', wrap24);

  // Today
  await page.getByRole('radio', { name: 'Today' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'today.png') });
  const svgT = page.locator('.ppc-plotwrap svg').first();
  const boxT = await svgT.boundingBox();
  const wrapT = await page.locator('.ppc-plotwrap').first().boundingBox();
  console.log('Today svg box:', boxT, 'wrap box:', wrapT);

  await browser.close();
})();
