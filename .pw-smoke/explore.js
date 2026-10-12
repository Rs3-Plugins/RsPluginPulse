const { chromium } = require('C:/Users/home/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto('http://localhost:5920/', { waitUntil: 'networkidle' });
  await page.locator('.view-tab', { hasText: 'New Releases' }).click();
  await page.waitForTimeout(500);
  await page.locator('.search-input').fill('quest');
  await page.waitForTimeout(500);
  console.log('=== AFTER SEARCH "quest" ===');
  console.log(await page.locator('.desc-row').innerText());
  console.log(await page.locator('.row-list').innerText());

  await page.goto('http://localhost:5920/plugin/6399152', { waitUntil: 'networkidle' });
  console.log('=== PLUGIN PAGE HTML (full) ===');
  console.log(await page.locator('body').innerHTML());

  await browser.close();
})();
