const { chromium } = require('C:/Users/home/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:5920/plugin/6399152', { waitUntil: 'networkidle' });
  console.log('tag count after networkidle nav:', await page.locator('a[href^="/tags/"]').count());

  // Now simulate client-side nav like clicking a link from another page
  await page.goto('http://localhost:5920/', { waitUntil: 'networkidle' });
  await page.locator('.view-tab', { hasText: 'New Releases' }).click();
  await page.waitForTimeout(300);
  await page.locator('a[href^="/plugin/"]').first().click();
  await page.waitForLoadState('networkidle');
  console.log('tag count after client nav + networkidle:', await page.locator('a[href^="/tags/"]').count());
  await page.waitForTimeout(1000);
  console.log('tag count after extra 1s wait:', await page.locator('a[href^="/tags/"]').count());
  await browser.close();
})();
