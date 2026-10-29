import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const root = resolve('dist');
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml' };

test('production homepage remains usable under CSP at desktop/mobile sizes', async () => {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + '/')) throw new Error('outside fixture');
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Security-Policy': policy });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 1536 } });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.title(), /xObject by ITextreme/);
    assert.match(await page.locator('main').innerText(), /Eine installierbare Version gibt es noch nicht/);
    assert.equal(await page.locator('script:not([src])').count(), 0, 'CSP must not require inline scripts');
    for (const theme of ['light', 'dark', 'system']) {
      await page.getByRole('combobox', { name: 'Darstellung' }).selectOption(theme);
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      await page.reload();
      assert.equal(await page.getByRole('combobox', { name: 'Darstellung' }).inputValue(), theme);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.length })), []);
    }
    await page.getByRole('combobox', { name: 'Darstellung' }).selectOption('light');
    if (process.env.QA_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.QA_SCREENSHOT_DIR, 'xobject-site-light-final.png'), fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `overflow at ${width}px`);
      await page.getByRole('link', { name: 'Entwicklung', exact: true }).click();
      assert.equal(await page.getByRole('heading', { name: 'Offen entwickelt. Von Anfang an.' }).isVisible(), true);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      assert.deepEqual(result.violations.map(v => v.id), []);
      if (width === 390 && process.env.QA_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.QA_SCREENSHOT_DIR, 'xobject-site-mobile-final.png'), fullPage: true });
    }
    assert.deepEqual(failures, []);
  } finally { await browser.close(); await new Promise(done => server.close(done)); }
});
