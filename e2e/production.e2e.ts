import { expect, test } from "@playwright/test";

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
  expect(runtimeErrors).toEqual([]);
});
