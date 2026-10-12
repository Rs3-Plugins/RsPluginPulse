const { chromium } = require('C:\\Users\\home\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright');

const results = [];
const consoleErrors = [];

function log(step, status, detail) {
  results.push({ step, status, detail });
  console.log(`[${status}] ${step}: ${detail}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setViewportSize({ width: 1280, height: 900 });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push('pageerror: ' + err.message);
  });

  const base = 'http://localhost:5912';

  // Step 1
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  let url = new URL(page.url());
  const topPluginsActive = await page.locator('text=Top Plugins').first().isVisible();
  const allTimeActive = await page.locator('text=All-time').first().isVisible();
  log('Step1 bare root', (url.pathname === '/' && url.search === '') ? 'PASS' : 'FAIL',
    `url=${page.url()} path=${url.pathname} search="${url.search}"`);

  // dump some DOM for tabs to inspect active states
  const tabsHtml1 = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="tab"], a'));
    return btns.filter(b => /top plugins|top authors|fastest growing|all-time|hot now|this week|monthly/i.test(b.textContent || '')).map(b => ({
      text: b.textContent.trim(),
      class: b.className,
      ariaSelected: b.getAttribute('aria-selected'),
      dataState: b.getAttribute('data-state'),
    }));
  });
  console.log('Step1 tab states:', JSON.stringify(tabsHtml1, null, 2));

  // Step 2: click Top Authors, then Hot now
  const topAuthorsBtn = page.locator('button.view-tab, [role="tab"], a').filter({ hasText: /^Top Authors/i }).first();
  await topAuthorsBtn.click();
  await page.waitForTimeout(300);
  const hotNowBtn = page.locator('button.period-btn, [role="tab"], a').filter({ hasText: /^Hot now/i }).first();
  await hotNowBtn.click();
  await page.waitForTimeout(300);
  url = new URL(page.url());
  const step2Pass = url.searchParams.get('tab') === 'authors' && url.searchParams.get('period') === 'hot';
  log('Step2 click Top Authors + Hot now', step2Pass ? 'PASS' : 'FAIL', `url=${page.url()}`);
  await page.screenshot({ path: 'D:\\Rs3 Plugins\\rspluginpulse\\step2-authors-hot.png' });

  // Step 3: reload at that exact URL directly
  const step2Url = page.url();
  await page.goto(step2Url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const tabsHtml3 = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="tab"], a'));
    return btns.filter(b => /top plugins|top authors|fastest growing|all-time|hot now|this week|monthly/i.test(b.textContent || '')).map(b => ({
      text: b.textContent.trim(),
      class: b.className,
      ariaSelected: b.getAttribute('aria-selected'),
      dataState: b.getAttribute('data-state'),
    }));
  });
  console.log('Step3 tab states after reload:', JSON.stringify(tabsHtml3, null, 2));
  url = new URL(page.url());
  log('Step3 reload at /?tab=authors&period=hot', 'CHECK-MANUAL', `url=${page.url()} - see tab state dump above`);

  // Step 4: click Fastest Growing, then Authors sub-view, then window dropdown -> 30 days
  const fastestGrowingBtn = page.locator('button.view-tab, [role="tab"], a').filter({ hasText: /Fastest Growing/i }).first();
  await fastestGrowingBtn.click();
  await page.waitForTimeout(300);

  // dump DOM to understand sub-view buttons/dropdown
  const growthControls = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="tab"], a, select, [role="combobox"]'));
    return els.map(b => ({
      tag: b.tagName,
      text: (b.textContent || '').trim().slice(0, 40),
      role: b.getAttribute('role'),
      ariaSelected: b.getAttribute('aria-selected'),
    })).filter(x => x.text);
  });
  console.log('Growth tab controls:', JSON.stringify(growthControls, null, 2));

  const authorsViewBtn = page.locator('button').filter({ hasText: /^Authors/i }).first();
  await authorsViewBtn.click();
  await page.waitForTimeout(300);

  // Try to find/open the window dropdown
  const dropdownTrigger = page.locator('button').filter({ hasText: /^7 days$/i }).first();
  const dtClass = await dropdownTrigger.getAttribute('class');
  console.log('Window dropdown trigger class:', dtClass);
  await dropdownTrigger.click();
  await page.waitForTimeout(300);

  const optionsDump = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[role="option"], option, li, button'));
    return els.map(b => (b.textContent || '').trim()).filter(Boolean).slice(0, 50);
  });
  console.log('Dropdown options:', JSON.stringify(optionsDump, null, 2));

  const option30 = page.locator('[role="option"], option, li, button').filter({ hasText: /^30 days/i }).first();
  await option30.click();
  await page.waitForTimeout(300);

  url = new URL(page.url());
  const step4Pass = url.searchParams.get('tab') === 'growth' && url.searchParams.get('view') === 'authors' && url.searchParams.get('window') === '30';
  log('Step4 Fastest Growing + Authors + 30 days', step4Pass ? 'PASS' : 'FAIL', `url=${page.url()}`);
  await page.screenshot({ path: 'D:\\Rs3 Plugins\\rspluginpulse\\step4-growth-authors-30.png' });

  // Step 5: navigate back to plain /
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  url = new URL(page.url());
  const tabsHtml5 = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="tab"], a'));
    return btns.filter(b => /top plugins|top authors|fastest growing|all-time|hot now|this week|monthly/i.test(b.textContent || '')).map(b => ({
      text: b.textContent.trim(),
      class: b.className,
      ariaSelected: b.getAttribute('aria-selected'),
      dataState: b.getAttribute('data-state'),
    }));
  });
  console.log('Step5 tab states:', JSON.stringify(tabsHtml5, null, 2));
  log('Step5 back to bare root', (url.pathname === '/' && url.search === '') ? 'PASS' : 'FAIL', `url=${page.url()}`);

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(JSON.stringify(consoleErrors, null, 2));

  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
})();
