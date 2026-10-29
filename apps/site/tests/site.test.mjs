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
const labels = { light: "Hell", dark: "Dunkel", system: "System" };
async function chooseTheme(page, theme) {
  const trigger = page.getByRole("button", { name: /^Darstellung:/ });
  await trigger.click();
  await page
    .getByRole("menuitemradio", { name: labels[theme], exact: true })
    .click();
  await expect(trigger).toHaveAccessibleName(`Darstellung: ${labels[theme]}`);
  await expect(page.getByRole("menu")).not.toBeVisible();
}
async function accessible(page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    [],
  );
}
async function stable(page) {
  await page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some((animation) => animation.playState === "running"),
  );
}
async function screenshot(page, name, fullPage = true) {
  if (process.env.QA_SCREENSHOT_DIR) {
    await stable(page);
    await page.screenshot({
      path: join(process.env.QA_SCREENSHOT_DIR, name),
      fullPage,
    });
  }
}

test("header controls match ITx and remain usable under production CSP", async () => {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const file = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(root + "/")) throw Error("outside fixture");
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
  if (!process.env.SITE_TEST_URL)
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url =
    process.env.SITE_TEST_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        failures.push(message.text());
    });
    const response = await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    assert.match(
      response.headers()["content-security-policy"],
      /script-src 'self'/,
    );
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.title(), /xObject by ITextreme/);
    assert.match(
      await page.locator("main").innerText(),
      /Eine installierbare Version gibt es noch nicht/,
    );
    assert.equal(
      await page
        .locator('script:not([src]):not([type="application/ld+json"])')
        .count(),
      0,
      "no executable inline scripts",
    );
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
    assert.equal(
      await page.getByRole("combobox").count(),
      0,
      "theme is the ITx icon menu",
    );
    assert.equal(
      await page.getByRole("link", { name: "Lizenzen", exact: true }).count(),
      0,
    );
    assert.equal(
      JSON.parse(
        await page.locator('script[type="application/ld+json"]').textContent(),
      ).url,
      "https://xobject.org/",
    );
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#inhalt")).toBeFocused();
    const nav = page.getByRole("navigation", {
      name: "Hauptnavigation",
      exact: true,
    });
    assert(
      (await nav.boundingBox()).width < 500,
      "navigation must remain compact",
    );
    await nav.getByRole("link", { name: "Entwicklung", exact: true }).click();
    await expect(
      nav.getByRole("link", { name: "Entwicklung", exact: true }),
    ).toHaveAttribute("aria-current", "location");
    await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(await page.locator('.hero [data-slot="button"]').count(), 2);
    for (const mode of ["light", "dark", "system"]) {
      await chooseTheme(page, mode);
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        page.getByRole("button", {
          name: `Darstellung: ${labels[mode]}`,
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(await page.locator("html").getAttribute("data-theme"), mode);
      await stable(page);
      await accessible(page);
      await page.getByRole("button", { name: /^Darstellung:/ }).click();
      await expect(
        page.getByRole("menuitemradio", { name: labels[mode], exact: true }),
      ).toHaveAttribute("aria-checked", "true");
      await stable(page);
      await accessible(page);
      if (mode === "dark")
        await screenshot(page, "xobject-header-dark-menu.png", false);
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: /^Darstellung:/ }).click();
    await expect(
      page.getByRole("menuitemradio", { name: "System", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await stable(page);
    await accessible(page);
    await screenshot(page, "xobject-itx-theme-menu.png", false);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: /^Darstellung:/ }),
    ).toBeFocused();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark"),
    );
    await screenshot(page, "xobject-header-dark.png");
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("dark"),
    );
    await chooseTheme(page, "light");
    await screenshot(page, "xobject-header-desktop.png");
    for (const width of [1024, 1023, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await stable(page);
      assert(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `overflow at ${width}`,
      );
      for (const heading of await page.locator("h3").all())
        assert(
          await heading.evaluate(
            (node) => node.scrollWidth <= node.clientWidth,
          ),
          `heading overflow at ${width}`,
        );
    }
    const navigation = page.getByRole("button", {
      name: "Navigation öffnen",
      exact: true,
    });
    await navigation.click();
    await expect(
      page.getByRole("menuitem", { name: "Überblick", exact: true }),
    ).toBeVisible();
    await stable(page);
    await accessible(page);
    await page.keyboard.press("Escape");
    await expect(navigation).toBeFocused();
    await navigation.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Überblick", exact: true }),
    ).toBeFocused();
    await page.mouse.click(4, 400);
    await expect(page.getByRole("menu")).not.toBeVisible();
    await navigation.click();
    await page
      .getByRole("menuitem", { name: "Entwicklung", exact: true })
      .click();
    await expect(page.getByRole("menu")).not.toBeVisible();
    const heading = page.getByRole("heading", {
      name: "Offen entwickelt. Von Anfang an.",
    });
    await expect(heading).toBeInViewport();
    assert(
      (await heading.boundingBox()).y >=
        (await page.locator(".site-header").boundingBox()).height,
    );
    await page.getByRole("link", { name: "Nach oben", exact: true }).click();
    await page.waitForFunction(() => window.scrollY < 2);
    await accessible(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, "xobject-header-mobile.png");
    await navigation.click();
    await screenshot(page, "xobject-header-mobile-menu.png", false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.getByRole("menu")).not.toBeVisible();
    for (const button of await page
      .locator('.header-controls button, .hero [data-slot="button"]')
      .all())
      if (await button.isVisible())
        assert((await button.boundingBox()).height >= 44, "COS target height");
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    if (server.listening) await new Promise((done) => server.close(done));
  }
});
