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
async function capture(page, name) {
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
      fullPage: true,
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
      await page.evaluate(() => document.fonts.ready);
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
        assert(await page.getByRole("heading", { level: 1 }).count());
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
    await noScript.close();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    if (server.listening) await new Promise((done) => server.close(done));
  }
});
