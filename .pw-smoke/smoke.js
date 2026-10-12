const { chromium } = require('C:/Users/home/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const path = require('path');

const BASE = 'http://localhost:5920';
const results = [];
const consoleErrors = [];

function log(section, status, note) {
  results.push({ section, status, note });
  console.log(`[${section}] ${status}: ${note}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[page console] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });

  // ---------- TEST 1 ----------
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const tabTexts = await page.locator('[role="tab"], button, a').allInnerTexts();
    const needed = ['Top Plugins', 'Top Authors', 'Fastest Growing', 'New Releases'];
    const foundTabs = needed.filter(n => tabTexts.some(t => t.trim() === n));
    if (foundTabs.length !== 4) {
      log('1-tabs', 'FAIL', `Only found tabs: ${foundTabs.join(', ')} out of ${needed.join(', ')}`);
    } else {
      log('1-tabs', 'PASS', 'All 4 tabs present: ' + needed.join(', '));
    }

    // Click New Releases
    await page.getByText('New Releases', { exact: true }).first().click();
    await page.waitForTimeout(800);

    const bodyText = await page.locator('body').innerText();
    const hasHash = bodyText.includes('#');
    const hasAdded = /Added/i.test(bodyText);
    // Try to find a table/list header row
    log('1-newreleases-columns', (hasAdded ? 'PASS' : 'FAIL'), `Added column present: ${hasAdded}. (# present: ${hasHash})`);

    // Try typing in search box
    const searchBox = page.locator('input[type="text"], input[placeholder*="earch" i]').first();
    let searchNote = 'no search box found';
    let searchStatus = 'FAIL';
    if (await searchBox.count() > 0) {
      await searchBox.fill('a');
      await page.waitForTimeout(500);
      searchStatus = 'PASS';
      searchNote = 'typed "a" in search box, no crash';
    }
    log('1-search', searchStatus, searchNote);
  } catch (e) {
    log('1-overall', 'FAIL', 'Exception: ' + e.message);
  }

  // ---------- TEST 2 ----------
  let pluginUrl = null;
  try {
    // find a plugin link on the New Releases tab
    const pluginLinks = page.locator('a[href^="/plugin/"]');
    const count = await pluginLinks.count();
    if (count === 0) {
      log('2-navigate', 'FAIL', 'No plugin links found on New Releases tab');
    } else {
      await pluginLinks.first().click();
      await page.waitForLoadState('networkidle');
      pluginUrl = page.url();
      log('2-navigate', 'PASS', 'Navigated to ' + pluginUrl);

      // (a) tags clickable with hover state
      const tagLinks = page.locator('a[href^="/tags/"]');
      const tagCount = await tagLinks.count();
      if (tagCount === 0) {
        log('2a-tags', 'FAIL', 'No tag links (a[href^="/tags/"]) found on plugin page');
      } else {
        const firstTag = tagLinks.first();
        await firstTag.scrollIntoViewIfNeeded();
        const cursorBefore = await firstTag.evaluate(el => getComputedStyle(el).cursor);
        await firstTag.hover();
        const cursorAfter = await firstTag.evaluate(el => getComputedStyle(el).cursor);
        log('2a-tags', 'PASS', `${tagCount} tag link(s) found; cursor=${cursorAfter} (expect pointer)`);

        // (b) click tag -> /tags/slug page
        const tagHref = await firstTag.getAttribute('href');
        const tagText = (await firstTag.innerText()).trim();
        await firstTag.click();
        await page.waitForLoadState('networkidle');
        const newUrl = page.url();
        const bodyText2 = await page.locator('body').innerText();
        const titleHasTag = bodyText2.toLowerCase().includes(tagText.toLowerCase());
        const listPresent = (await page.locator('a[href^="/plugin/"]').count()) > 0;
        if (newUrl.includes('/tags/') && titleHasTag && listPresent) {
          log('2b-tagpage', 'PASS', `Navigated to ${newUrl}, title contains "${tagText}", plugin list present`);
        } else {
          log('2b-tagpage', 'FAIL', `url=${newUrl} titleHasTag=${titleHasTag} listPresent=${listPresent}`);
        }

        // go back to plugin page
        await page.goto(pluginUrl, { waitUntil: 'networkidle' });
      }

      // (c) Similar plugins card
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(500);
      const bodyText3 = await page.locator('body').innerText();
      const hasSimilar = /Similar plugins/i.test(bodyText3);
      log('2c-similar', hasSimilar ? 'PASS' : 'FAIL', hasSimilar ? 'Similar plugins card found' : '"Similar plugins" text not found on page');

      // (d) Export CSV / Export JSON buttons trigger downloads
      const csvBtn = page.getByText('Export CSV', { exact: false }).first();
      const jsonBtn = page.getByText('Export JSON', { exact: false }).first();
      let csvNote, jsonNote, csvStatus, jsonStatus;
      if (await csvBtn.count() > 0) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            csvBtn.click(),
          ]);
          csvStatus = 'PASS';
          csvNote = 'download event fired: ' + download.suggestedFilename();
        } catch (e) {
          csvStatus = 'FAIL';
          csvNote = 'no download event: ' + e.message;
        }
      } else {
        csvStatus = 'FAIL';
        csvNote = 'Export CSV button not found';
      }
      log('2d-exportcsv', csvStatus, csvNote);

      if (await jsonBtn.count() > 0) {
        try {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 5000 }),
            jsonBtn.click(),
          ]);
          jsonStatus = 'PASS';
          jsonNote = 'download event fired: ' + download.suggestedFilename();
        } catch (e) {
          jsonStatus = 'FAIL';
          jsonNote = 'no download event: ' + e.message;
        }
      } else {
        jsonStatus = 'FAIL';
        jsonNote = 'Export JSON button not found';
      }
      log('2d-exportjson', jsonStatus, jsonNote);
    }
  } catch (e) {
    log('2-overall', 'FAIL', 'Exception: ' + e.message);
  }

  // ---------- TEST 3 ----------
  try {
    await page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();
    const needed = ['Plugins tracked', 'Authors', 'Total downloads', 'Total subscribers'];
    const missingLabels = needed.filter(n => !bodyText.includes(n));
    const stillLoading = bodyText.includes('…') || /\.\.\.(\s|$)/.test(bodyText);
    if (missingLabels.length === 0 && !stillLoading) {
      log('3-stats', 'PASS', 'All 4 stat labels present with no ellipsis placeholder visible');
    } else {
      log('3-stats', 'FAIL', `missing=${missingLabels.join(',')} stillLoadingEllipsis=${stillLoading}`);
    }
  } catch (e) {
    log('3-overall', 'FAIL', 'Exception: ' + e.message);
  }

  // ---------- TEST 4 ----------
  try {
    await page.goto(BASE + '/compare', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const bodyText = await page.locator('body').innerText();
    const pluginLabelCount = (bodyText.match(/Plugin/g) || []).length;
    // find selects/comboboxes
    const selects = page.locator('select, [role="combobox"], input[placeholder*="lugin" i]');
    const selectCount = await selects.count();
    log('4-slots', selectCount >= 3 ? 'PASS' : 'FAIL', `Found ${selectCount} picker-like controls (expect >=3)`);

    // check first slot auto-selected something (non-empty)
    let autoSelected = false;
    if (selectCount > 0) {
      const first = selects.first();
      const tag = await first.evaluate(el => el.tagName.toLowerCase());
      if (tag === 'select') {
        const val = await first.inputValue();
        autoSelected = !!val;
      } else {
        const val = await first.inputValue().catch(() => '');
        autoSelected = !!val;
      }
    }
    log('4-autoselect', autoSelected ? 'PASS' : 'FAIL', `slot1 auto-selected value present: ${autoSelected}`);

    // pick second plugin in slot 2
    if (selectCount >= 2) {
      const second = selects.nth(1);
      const tag2 = await second.evaluate(el => el.tagName.toLowerCase());
      if (tag2 === 'select') {
        const options = await second.locator('option').allTextContents();
        const nonEmptyOptions = options.filter(o => o.trim() && !/select/i.test(o));
        if (nonEmptyOptions.length > 0) {
          await second.selectOption({ label: nonEmptyOptions[0] });
        }
      } else {
        await second.click();
        await page.waitForTimeout(300);
        const option = page.locator('[role="option"], li').first();
        if (await option.count() > 0) {
          await option.click();
        }
      }
      await page.waitForTimeout(1000);
    }

    // check chart renders (svg or canvas)
    const chartEl = page.locator('svg, canvas').first();
    const chartPresent = await chartEl.count() > 0;
    log('4-chart', chartPresent ? 'PASS' : 'FAIL', `chart element present: ${chartPresent}`);

    // legend with clickable plugin name links below chart
    const legendLinks = page.locator('a[href^="/plugin/"]');
    const legendCount = await legendLinks.count();
    log('4-legend', legendCount > 0 ? 'PASS' : 'FAIL', `${legendCount} plugin link(s) found in legend/list area`);

    // hover over chart, check tooltip
    if (chartPresent) {
      const box = await chartEl.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
        await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
        await page.waitForTimeout(500);
        const tooltipVisible = await page.locator('.recharts-tooltip-wrapper, [role="tooltip"], .tooltip').count();
        const bodyTextTT = await page.locator('body').innerText();
        log('4-tooltip', tooltipVisible > 0 ? 'PASS' : 'FAIL', `tooltip element count on hover: ${tooltipVisible}`);
      }
    }
  } catch (e) {
    log('4-overall', 'FAIL', 'Exception: ' + e.message);
  }

  // ---------- TEST 5 ----------
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const nav = page.locator('nav, header');
    const navText = await nav.first().innerText();
    const hasCompare = /Compare/.test(navText);
    const hasStats = /Stats/.test(navText);
    log('5-navlinks-present', (hasCompare && hasStats) ? 'PASS' : 'FAIL', `Compare present: ${hasCompare}, Stats present: ${hasStats}`);

    // click Compare, check active highlight + url
    const compareLink = page.locator('a', { hasText: 'Compare' }).first();
    await compareLink.click();
    await page.waitForLoadState('networkidle');
    const urlAfterCompare = page.url();
    const compareClass = await compareLink.getAttribute('class');
    log('5-compare-nav', urlAfterCompare.includes('/compare') ? 'PASS' : 'FAIL', `url=${urlAfterCompare} class="${compareClass}"`);

    const statsLink = page.locator('a', { hasText: 'Stats' }).first();
    await statsLink.click();
    await page.waitForLoadState('networkidle');
    const urlAfterStats = page.url();
    const statsClass = await statsLink.getAttribute('class');
    log('5-stats-nav', urlAfterStats.includes('/stats') ? 'PASS' : 'FAIL', `url=${urlAfterStats} class="${statsClass}"`);
  } catch (e) {
    log('5-overall', 'FAIL', 'Exception: ' + e.message);
  }

  await browser.close();

  console.log('\n===== CONSOLE ERRORS =====');
  if (consoleErrors.length === 0) {
    console.log('None');
  } else {
    consoleErrors.forEach(e => console.log(e));
  }

  console.log('\n===== RESULTS JSON =====');
  console.log(JSON.stringify(results, null, 2));
})();
