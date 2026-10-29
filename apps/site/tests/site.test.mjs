import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
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
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

test("production homepage remains usable under CSP at desktop/mobile sizes", async () => {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const file = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + "/")) throw new Error("outside fixture");
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Security-Policy": policy,
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.title(), /xObject by ITextreme/);
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator(".skip-link")
        .evaluate((node) => node === document.activeElement),
      true,
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator("#inhalt")
        .evaluate((node) => node === document.activeElement),
      true,
    );
    assert.equal(
      await page.getByRole("link", { name: "Lizenzen", exact: true }).count(),
      0,
    );
    const desktopNavigation = page.getByRole("navigation", {
      name: "Hauptnavigation",
      exact: true,
    });
    await desktopNavigation
      .getByRole("link", { name: "Entwicklung", exact: true })
      .click();
    await expect(
      desktopNavigation.getByRole("link", { name: "Entwicklung", exact: true }),
    ).toHaveAttribute("aria-current", "location");
    await page.goto(`http://127.0.0.1:${server.address().port}/`);

    assert.match(
      await page.locator("main").innerText(),
      /Eine installierbare Version gibt es noch nicht/,
    );
    assert.equal(
      await page
        .locator('script:not([src]):not([type="application/ld+json"])')
        .count(),
      0,
      "CSP must not require executable inline scripts",
    );
    const schema = JSON.parse(
      await page.locator('script[type="application/ld+json"]').textContent(),
    );
    assert.equal(schema["@type"], "WebSite");
    assert.equal(schema.url, "https://xobject.org/");
    assert.match(
      await page
        .locator("h1")
        .evaluate((node) => getComputedStyle(node).fontFamily),
      /Orbitron/,
    );
    assert.match(
      await page
        .locator("body")
        .evaluate((node) => getComputedStyle(node).fontFamily),
      /Inter/,
    );
    assert.equal(await page.locator('[data-slot="button"]').count(), 2);
    for (const button of await page
      .locator('[data-slot="button"], #theme')
      .all()) {
      assert((await button.boundingBox()).height >= 44, "COS target height");
    }
    for (const theme of ["light", "dark", "system"]) {
      await page
        .getByRole("combobox", { name: "Darstellung" })
        .selectOption(theme);
      assert.equal(
        await page.locator("html").getAttribute("data-theme"),
        theme,
      );
      await page.reload();
      if (theme === "dark" && process.env.QA_SCREENSHOT_DIR) {
        await page.screenshot({
          path: join(
            process.env.QA_SCREENSHOT_DIR,
            "xobject-design-system-dark.png",
          ),
          fullPage: true,
        });
      }
      assert.equal(
        await page.getByRole("combobox", { name: "Darstellung" }).inputValue(),
        theme,
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
        [],
        JSON.stringify(
          result.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
        ),
      );
    }
    await page
      .getByRole("combobox", { name: "Darstellung" })
      .selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark"),
    );
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("dark"),
    );
    await page
      .getByRole("combobox", { name: "Darstellung" })
      .selectOption("light");
    if (process.env.QA_SCREENSHOT_DIR)
      await page.screenshot({
        path: join(
          process.env.QA_SCREENSHOT_DIR,
          "xobject-site-light-final.png",
        ),
        fullPage: true,
      });
    for (const width of [1024, 1023, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `tablet overflow at ${width}`,
      );
      for (const heading of await page.locator("h3").all())
        assert(
          await heading.evaluate(
            (node) => node.scrollWidth <= node.clientWidth,
          ),
          `heading overflow at ${width}`,
        );
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        true,
        `overflow at ${width}px`,
      );
      const menu = page.locator("[data-mobile-navigation]");
      const toggle = menu.locator("summary");
      await expect(toggle).toBeVisible();
      assert((await toggle.boundingBox()).height >= 44);
      await toggle.click();
      await expect(menu).toHaveJSProperty("open", true);
      if (width === 390 && process.env.QA_SCREENSHOT_DIR)
        await page.waitForFunction(
          () =>
            !document
              .getAnimations()
              .some((animation) => animation.playState === "running"),
        );
      await page.screenshot({
        path: join(
          process.env.QA_SCREENSHOT_DIR,
          "xobject-itx-layout-mobile-menu.png",
        ),
      });
      if (width === 390) {
        const openMenu = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          openMenu.violations.map((v) => v.id),
          [],
        );
      }
      await page.keyboard.press("Escape");
      await expect(menu).toHaveJSProperty("open", false);
      await expect(toggle).toBeFocused();
      await toggle.press("Enter");
      await expect(menu).toHaveJSProperty("open", true);
      await page.mouse.click(4, 400);
      await expect(menu).toHaveJSProperty("open", false);
      await toggle.click();
      await menu
        .getByRole("link", { name: "Entwicklung", exact: true })
        .click();
      await expect(menu).toHaveJSProperty("open", false);

      assert.equal(
        await page
          .getByRole("heading", { name: "Offen entwickelt. Von Anfang an." })
          .isVisible(),
        true,
      );
      const destination = page.getByRole("heading", {
        name: "Offen entwickelt. Von Anfang an.",
      });
      await expect(destination).toBeInViewport();
      assert(
        (await destination.boundingBox()).y >=
          (await page.locator(".site-header").boundingBox()).height,
        "sticky header must not cover the destination",
      );
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((v) => v.id),
        [],
      );
      await page.getByRole("link", { name: "Nach oben", exact: true }).click();
      await page.waitForFunction(() => window.scrollY < 2);
      if (width === 390 && process.env.QA_SCREENSHOT_DIR)
        await page.screenshot({
          path: join(
            process.env.QA_SCREENSHOT_DIR,
            "xobject-site-mobile-final.png",
          ),
          fullPage: true,
        });
    }
    const menu = page.locator("[data-mobile-navigation]");
    await menu.locator("summary").click();
    await expect(menu).toHaveJSProperty("open", true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(menu).toHaveJSProperty("open", false);
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
});
