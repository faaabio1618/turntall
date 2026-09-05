import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("serves the production editor and local FFmpeg assets", async ({
  page,
}) => {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        brands: [
          { brand: "Chromium", version: "136" },
          { brand: "Google Chrome", version: "136" },
        ],
        mobile: false,
        platform: "Linux",
      },
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "turntall.com", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#browser-gate")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);

  const assets = await page.evaluate(async () =>
    Promise.all(
      [
        ["favicon.svg", "/favicon.svg"],
        ["robots.txt", "/robots.txt"],
        ["sitemap.xml", "/sitemap.xml"],
        ["llms.txt", "/llms.txt"],
        ["ffmpeg-core.js", "/ffmpeg/ffmpeg-core.js"],
        ["ffmpeg-core.wasm", "/ffmpeg/ffmpeg-core.wasm"],
      ].map(async ([name, url]) => {
        const response = await fetch(url, { method: "HEAD" });
        return {
          name,
          ok: response.ok,
          contentType: response.headers.get("content-type"),
        };
      }),
    ),
  );
  expect(assets).toEqual([
    {
      name: "favicon.svg",
      ok: true,
      contentType: expect.stringContaining("image/svg+xml"),
    },
    {
      name: "robots.txt",
      ok: true,
      contentType: expect.stringContaining("text/plain"),
    },
    {
      name: "sitemap.xml",
      ok: true,
      contentType: expect.stringContaining("text/xml"),
    },
    {
      name: "llms.txt",
      ok: true,
      contentType: expect.stringContaining("text/plain"),
    },
    {
      name: "ffmpeg-core.js",
      ok: true,
      contentType: expect.stringContaining("text/javascript"),
    },
    {
      name: "ffmpeg-core.wasm",
      ok: true,
      contentType: expect.stringContaining("application/wasm"),
    },
  ]);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://turntall.com/",
  );
  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .evaluate((element) => JSON.parse(element.textContent ?? "{}"));
  expect(structuredData).toMatchObject({
    "@type": "WebApplication",
    isAccessibleForFree: true,
    offers: { price: "0" },
  });
  await expect(
    page.getByRole("heading", {
      name: "Convert horizontal video to vertical video in your browser",
    }),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);

  // The static fallback must be replaced, not appended to the live editor.
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator(".agent-fallback")).toHaveCount(0);
  await expect(page.locator('.site-footer a[href="mailto:info@turntall.com"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/agent-ready-home.png', fullPage: true });
  await page.locator('#file-input').setInputFiles(fileURLToPath(new URL('../tests/fixtures/e2e-sample.webm', import.meta.url)));
  await expect(page.locator('#file-details')).toContainText('e2e-sample.webm');
  await expect(page.locator('#video-preparation-overlay')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('#video-panel')).toBeVisible();
  await expect(page.locator('#selection-panel')).toBeVisible();
  await expect(page.locator('#output-preview-panel')).toBeVisible();
  await expect(page.locator('#cut-button')).toBeEnabled();
  await page.reload();
  await page.locator('.site-footer a[href="/privacy"]').click();
  await expect(page.getByRole('heading', { name: 'Privacy at turntall.com', level: 1 })).toBeVisible();
  await page.screenshot({ path: 'test-results/agent-ready-privacy.png', fullPage: true });
  await page.getByRole('link', { name: 'Editor', exact: true }).click();
  await expect(page.locator('#file-input')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
