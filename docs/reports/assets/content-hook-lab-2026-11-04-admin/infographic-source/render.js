/* eslint-disable @typescript-eslint/no-require-imports */
// Renders build.py output (*.html) to PNG with Playwright. Usage: node render.js <name> [...]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const names = process.argv.slice(2);
  const b = await chromium.launch();
  for (const n of names) {
    const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    await p.goto('file://' + path.resolve(n + '.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(800);
    const h = await p.evaluate(() => document.body.scrollHeight);
    await p.setViewportSize({ width: 1200, height: h });
    await p.screenshot({ path: n + '.png', fullPage: true });
    console.log(n, h);
  }
  await b.close();
})();
