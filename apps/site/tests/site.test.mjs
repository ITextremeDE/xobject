import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const root = resolve("dist");
const policy =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};
const t = {
  en: {
    appearance: "Appearance",
    light: "Light",
    dark: "Dark",
    system: "System",
    nav: "Main navigation",
    menu: "Open navigation",
    start: "Get started",
  },
  de: {
    appearance: "Darstellung",
    light: "Hell",
    dark: "Dunkel",
    system: "System",
    nav: "Hauptnavigation",
    menu: "Navigation öffnen",
    start: "Loslegen",
  },
};
async function accessible(page) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    scan.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    [],
  );
}
async function capture(page, name, fullPage = true) {
  if (process.env.QA_SCREENSHOT_DIR) {
    await mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true });
    for (const img of await page.locator("img:visible").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveJSProperty("complete", true);
      assert(await img.evaluate((n) => n.naturalWidth > 0));
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: join(process.env.QA_SCREENSHOT_DIR, name),
      fullPage,
    });
  }
}
test("localized product site, theme controls, screenshots and resources under production CSP", async () => {
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = resolve(
        root,
        "." + (name.endsWith("/") ? name + "index.html" : name),
      );
      if (!file.startsWith(root + "/")) throw Error();
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Security-Policy": policy,
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  if (!process.env.SITE_TEST_URL)
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base =
      process.env.SITE_TEST_URL || `http://127.0.0.1:${server.address().port}/`,
    browser = await chromium.launch();
  try {
    const errors = [];
    for (const lang of ["en", "de"]) {
      const context = await browser.newContext({
          locale: lang === "de" ? "de-DE" : "en-US",
          viewport: { width: 1440, height: 1000 },
          reducedMotion: "reduce",
        }),
        page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (["error", "warning"].includes(m.type())) errors.push(m.text());
      });
      let response = await page.goto(base, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await expect(page).toHaveURL(new URL(lang + "/", base).href);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      assert.match(await page.title(), /xObject by ITextreme/);
      await expect(page.locator('.faq-item').last()).toContainText(lang==='de'?'Für V2':'Version 2');
      const resourceLinks=page.locator('.footer-columns > div').nth(1).locator('a');
      await expect(resourceLinks).toHaveText(lang==='de'
        ? ['Dokumentation','Changelog','Roadmap','Anforderungen','Quellcode']
        : ['Documentation','Changelog','Roadmap','Requirements','Source code']);
      assert.deepEqual(await resourceLinks.evaluateAll(links=>links.map(link=>link.getAttribute('href'))),[
        'https://docs.xobject.org/','/changelog/','/roadmap/',
        'https://docs.xobject.org/prd/','https://github.com/ITextremeDE/xobject',
      ]);
      assert.deepEqual(await page.locator('.footer-columns > div').nth(2).locator('a').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),[
        'https://itextreme.de/datenschutzerklaerung','https://itextreme.de/impressum',
      ]);
      await page.evaluate(() => document.fonts.ready);
      const navigationAsset = await page.locator('script[src*="/_astro/SiteLayout."]').getAttribute('src');
      assert.match(navigationAsset, /\/_astro\/SiteLayout\.[\w.-]+\.[\w-]+\.js$/);
      assert.equal(await page.locator('script[src="/navigation.js"]').count(), 0);
      await page.evaluate(()=>{
        const section=document.getElementById('features');
        window.scrollTo({top:section.getBoundingClientRect().top+scrollY-80,behavior:'instant'});
      });
      for(const link of await page.locator('[data-section-navigation] a[href$="#features"]').all())
        await expect(link).toHaveAttribute('aria-current','location');
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      for(const link of await page.locator('[data-section-navigation] a[href$="#overview"]').all())
        await expect(link).toHaveAttribute('aria-current','location');
      assert.equal(
        await page
          .locator('script:not([src]):not([type="application/ld+json"])')
          .count(),
        0,
      );
      assert.match(
        await page
          .locator("h1")
          .evaluate((n) => getComputedStyle(n).fontFamily),
        /Orbitron/,
      );
      assert.match(
        await page
          .locator("body")
          .evaluate((n) => getComputedStyle(n).fontFamily),
        /Inter/,
      );
      assert.equal(
        await page.locator('link[rel="alternate"][hreflang]').count(),
        3,
      );
      assert.equal(await page.locator('.hero [data-slot="button"]').count(), 2);
      assert.equal(
        (
          await context.request.get(new URL("/social-preview.png", base).href)
        ).status(),
        200,
      );
      assert.equal(
        await page.locator("main figure.product-screenshot").count(),
        5,
      );
      await expect(
        page.locator('.language-navigation a[data-language="en"]'),
      ).toHaveAccessibleName("English");
      await expect(
        page.locator('.language-navigation a[data-language="de"]'),
      ).toHaveAccessibleName("Deutsch");
      assert.equal(await page.locator(".language-navigation img").count(), 2);
      const openScreenshot = async () => {
        const trigger = page.locator(".hero .screenshot-link:visible");
        await trigger.click();
        const dialog = page.getByRole("dialog", {
          name: "Screenshot",
          exact: true,
        });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("heading", { name: "Screenshot", exact: true }),
        ).toHaveCSS("font-size", "16px");
        await expect(dialog.locator("img")).toHaveJSProperty("complete", true);
        assert(
          await dialog.locator("img").evaluate((img) => img.naturalWidth > 0),
        );
        assert.equal(
          context.pages().length,
          1,
          "Screenshot stays in the same tab",
        );
        assert.equal(new URL(page.url()).pathname, `/${lang}/`);
        return { dialog, trigger };
      };
      let viewer = await openScreenshot();
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          viewer.dialog.evaluate((el) => el.contains(document.activeElement)),
        )
        .toBe(true);
      await accessible(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(viewer.trigger).toBeFocused();
      viewer = await openScreenshot();
      await viewer.dialog
        .getByRole("button", {
          name: lang === "de" ? "Schließen" : "Close",
          exact: true,
        })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(viewer.trigger).toBeFocused();
      viewer = await openScreenshot();
      await page.mouse.click(2, 2);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(viewer.trigger).toBeFocused();

      await page.reload({ waitUntil: "networkidle" });
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#inhalt")).toBeFocused();
      const nav = page.getByRole("navigation", {
        name: t[lang].nav,
        exact: true,
      });
      await nav.getByRole("link", { name: t[lang].start, exact: true }).click();
      await expect(
        nav.getByRole("link", { name: t[lang].start, exact: true }),
      ).toHaveAttribute("aria-current", "location");
      for (const mode of ["light", "dark", "system"]) {
        const trigger = page.getByRole("button", {
          name: new RegExp("^" + t[lang].appearance + ":"),
        });
        await trigger.click();
        await page
          .getByRole("menuitemradio", { name: t[lang][mode], exact: true })
          .click();
        await expect(page.getByRole("menu")).not.toBeVisible();
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
        viewer = await openScreenshot();
        await accessible(page);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await accessible(page);
        await trigger.click();
        await expect(
          page.getByRole("menuitemradio", { name: t[lang][mode], exact: true }),
        ).toHaveAttribute("aria-checked", "true");
        await accessible(page);
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        const displayed = page.locator(".hero .screenshot-link:visible img");
        await expect(displayed).toBeVisible();
        assert.equal(
          await displayed.evaluate((n) => n.complete && n.naturalWidth > 0),
          true,
        );
        if (mode === "dark") {
          await page.goto(new URL(lang + "/", base).href, {
            waitUntil: "networkidle",
          });
          await capture(page, `site-${lang}-dark.png`);
        }
      }
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() =>
        document.documentElement.classList.contains("dark"),
      );
      await expect(page.locator(".hero .screenshot-dark")).toBeVisible();
      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(
        () => !document.documentElement.classList.contains("dark"),
      );
      for (const width of [1440, 1024, 1023, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(new URL(lang + "/", base).href, {
          waitUntil: "networkidle",
        });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `overflow ${lang} ${width}`,
        );
        if ([1440, 390].includes(width)) {
          await accessible(page);
          await capture(page, `site-${lang}-${width}.png`);
        }
      }
      viewer = await openScreenshot();
      assert(
        await viewer.dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.x >= 0 &&
            r.y >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight
          );
        }),
        "Lightbox fits the mobile viewport",
      );
      await accessible(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const navigation = page.getByRole("button", {
        name: t[lang].menu,
        exact: true,
      });
      await navigation.click();
      await accessible(page);
      await page.keyboard.press("Escape");
      await expect(navigation).toBeFocused();
      await navigation.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", {
          name: t[lang].overview ?? (lang === "de" ? "Überblick" : "Overview"),
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await navigation.click();
      await page
        .getByRole("menuitem", { name: t[lang].start, exact: true })
        .click();
      await expect(page.getByRole("menu")).not.toBeVisible();
      await page.locator(".faq-item summary").first().click();
      assert.equal(
        await page.locator(".faq-item").first().getAttribute("open"),
        "",
      );
      const other = lang === "en" ? "de" : "en";
      await page
        .locator(`.language-navigation a[data-language="${other}"]`)
        .click();
      await expect(page).toHaveURL(new RegExp("/" + other + "/#start$"));
      assert.equal(
        await page.evaluate(() => localStorage.getItem("xobject-language")),
        other,
      );
      await page.goto(base, { waitUntil: "networkidle" });
      await expect(page).toHaveURL(new URL(other + "/", base).href);
      await page.goto(new URL(lang + "/", base).href, {
        waitUntil: "networkidle",
      });
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await page.setViewportSize({ width: 1440, height: 1000 });
      for (const path of ["changelog", "roadmap"]) {
        await page.goto(new URL(path + "/", base).href, {
          waitUntil: "networkidle",
        });
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await accessible(page);
        assert.equal(await page.getByRole("heading", { level: 1 }).count(),1);
        await capture(page, `${path}-${lang}.png`, false);
        assert.equal(await page.locator('article a[href^="https://github.com/ITextremeDE/xobject/blob/main/docs/"]').count(),0);
        for(const link of await page.locator('article a[href^="https://docs.xobject.org/"]').all()){
          const target=new URL(await link.getAttribute('href'));
          assert(!target.pathname.endsWith('.md'),'documentation links use rendered routes');
        }
        const sectionLinks=page.locator('.document-aside nav a');
        for(const link of await sectionLinks.all()){
          const target=await link.getAttribute('href');
          assert(await page.evaluate(id=>document.getElementById(id)!==null,decodeURIComponent(target.slice(1))),`section target ${target}`);
        }
        await expect(sectionLinks.first()).toHaveAttribute('aria-current','location');
        const originalHash=new URL(page.url()).hash;
        for(const index of [1,0]){
          const target=await sectionLinks.nth(index).getAttribute('href');
          await page.evaluate(id=>{
            const heading=document.getElementById(id);
            window.scrollTo({top:heading.getBoundingClientRect().top+scrollY-100,behavior:'instant'});
          },decodeURIComponent(target.slice(1)));
          await expect(sectionLinks.nth(index)).toHaveAttribute('aria-current','location');
          assert.equal(new URL(page.url()).hash,originalHash,'scroll tracking does not rewrite history');
          assert.equal(await page.locator('.document-aside a[aria-current]').count(),1);
        }
        const aside=page.locator('.document-aside');
        await page.evaluate(()=>window.scrollTo({top:1100,behavior:'instant'}));
        const firstTop=(await aside.boundingBox()).y;
        await page.evaluate(()=>window.scrollTo({top:1600,behavior:'instant'}));
        const secondTop=(await aside.boundingBox()).y;
        assert(Math.abs(firstTop-secondTop)<2,'desktop section navigation stays pinned while scrolling');
        assert(firstTop>=72&&firstTop<=120,'section navigation stays below the sticky header');
        await sectionLinks.first().focus();
        await page.keyboard.press('Enter');
        assert(new URL(page.url()).hash);
        for(const width of [1440,390]){
          await page.setViewportSize({width,height:900});
          const target=await sectionLinks.nth(1).getAttribute('href');
          await page.evaluate(id=>{
            const heading=document.getElementById(id);
            window.scrollTo({top:heading.getBoundingClientRect().top+scrollY-100,behavior:'instant'});
          },decodeURIComponent(target.slice(1)));
          await expect(sectionLinks.nth(1)).toHaveAttribute('aria-current','location');
          if(width===390){
            await expect.poll(()=>sectionLinks.nth(1).evaluate(link=>{
              const item=link.getBoundingClientRect(),strip=link.closest('ul').getBoundingClientRect();
              return item.left>=strip.left-1&&item.right<=strip.right+1;
            })).toBe(true);
          }
          await accessible(page);
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        }
        await page.setViewportSize({width:1440,height:1000});
      }
      await context.close();
    }
    for (const locale of ["fr-FR", "de-AT"]) {
      const ctx = await browser.newContext({ locale }),
        p = await ctx.newPage();
      await p.goto(base, { waitUntil: "networkidle" });
      await expect(p).toHaveURL(
        new URL((locale.startsWith("de") ? "de" : "en") + "/", base).href,
      );
      await ctx.close();
    }
    const noScript = await browser.newContext({ javaScriptEnabled: false }),
      p = await noScript.newPage();
    await p.goto(base);
    await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
    await p.locator('.language-navigation a[data-language="de"]').click();
    await expect(p.locator("html")).toHaveAttribute("lang", "de");
    await p.locator(".hero .screenshot-link:visible").click();
    assert(
      new URL(p.url()).pathname.endsWith(".png"),
      "Without JavaScript the same-tab original image remains available",
    );
    assert.equal(noScript.pages().length, 1);
    await noScript.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (server.listening) await new Promise((done) => server.close(done));
  }
});
