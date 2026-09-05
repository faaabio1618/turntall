import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";

const pages = ["/", "/about", "/contact", "/privacy"];

for (const path of pages) {
  test(`${path} works without JavaScript and negotiates Markdown`, async ({ browser, request }) => {
    const html = await request.get(path, { headers: { Accept: "text/html" } });
    expect(html.status()).toBe(200);
    expect(html.headers()["content-type"]).toContain("text/html");
    expect(html.headers().vary.toLowerCase()).toContain("accept");
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(html.url());
    expect((await page.locator("main").innerText()).length).toBeGreaterThan(500);
    await expect(page.locator("h1")).toHaveCount(1);
    const levels = await page.locator("h1,h2,h3,h4,h5,h6").evaluateAll(nodes => nodes.map(node => Number(node.tagName.slice(1))));
    for (let index = 1; index < levels.length; index++) expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://turntall.com${path}`);
    const alternate = await page.locator('link[type="text/markdown"]').getAttribute("href");
    await context.close();
    for (const url of [path, alternate!]) {
      const markdown = await request.get(url, { headers: { Accept: "text/markdown" } });
      expect(markdown.status()).toBe(200);
      expect(markdown.headers()["content-type"]).toContain("text/markdown");
      expect(markdown.headers().vary.toLowerCase()).toContain("accept");
      expect(await markdown.text()).toMatch(/^# /);
      expect((await markdown.text()).length).toBeGreaterThan(500);
      const head = await request.head(url, { headers: { Accept: "text/markdown" } });
      expect(head.status()).toBe(200);
      expect((await head.body()).length).toBe(0);
    }
  });
}

test("negotiation honors quality, exclusion, wildcards, and unsupported types", async ({ request }) => {
  for (const [accept, status, mime] of [
    ["*/*", 200, "text/html"],
    ["text/markdown;q=0, text/html", 200, "text/html"],
    ["text/html;q=0.1, text/markdown;q=0.9", 200, "text/markdown"],
    ["text/markdown;q=0.1, text/html;q=0.9", 200, "text/html"],
    ["application/json", 406, "text/markdown"],
  ] as const) {
    const response = await request.get("/", { headers: { Accept: accept } });
    expect(response.status()).toBe(status);
    expect(response.headers()["content-type"]).toContain(mime);
  }
});

test("unknown paths return 404 for GET and HEAD", async ({ request }) => {
  for (const path of ["/this-path-does-not-exist", "/unknown/", "/missing.html", "/missing.json", "/assets/missing.js", "/ffmpeg/missing.wasm"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    if (!path.startsWith("/assets/") && !path.startsWith("/ffmpeg/")) {
      expect(response.headers()["content-type"]).toContain("text/markdown");
      expect(await response.text()).toContain("https://turntall.com/llms.txt");
    }
    expect((await request.head(path)).status()).toBe(404);
  }
});

test("all public files and discovery links resolve with correct metadata", async ({ request }) => {
  for (const file of readdirSync("public", { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())) {
    const path = "/" + file.parentPath.replaceAll("\\", "/").replace(/^public\/?/, "") + (file.parentPath === "public" ? "" : "/") + file.name;
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    if (file.name.endsWith(".md")) expect(response.headers()["content-type"]).toContain("text/markdown");
    if (file.name.endsWith(".txt")) expect(response.headers()["content-type"]).toContain("text/plain");
  }
  const llms = await (await request.get("/llms.txt")).text();
  expect(llms).toMatch(/^# turntall\.com\r?\n\r?\n> /);
  expect(llms).toContain("When to use");
  for (const match of llms.matchAll(/\]\((https:\/\/turntall\.com[^)]+)\)/g)) {
    expect((await request.get(new URL(match[1]).pathname)).status()).toBe(200);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname)).toEqual(pages);
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://turntall.com/sitemap.xml");
  const html = await (await request.get("/")).text();
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('<meta property="og:type" content="website"');
  expect(html).toContain('<meta property="og:image" content="https://turntall.com/og-image.png"');
  expect(html).toContain('<title>turntall.com');
  const image = await request.get("/og-image.png");
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});
