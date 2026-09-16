import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { negotiatePageRepresentation, routeRequest } from "../../scripts/site-routes.ts";

describe("Accept negotiation in the deployed edge function", () => {
  it.each([
    [undefined, "html"], ["", "html"], ["*/*", "html"], ["text/*", "html"],
    ["text/html", "html"], ["text/markdown", "markdown"],
    ["text/markdown, text/html", "markdown"],
    ["text/html, text/markdown", "html"],
    ["text/html;q=0.5, text/markdown;q=0.9", "markdown"],
    ["text/markdown;q=0.2, text/html;q=0.9", "html"],
    ["text/markdown;q=0, */*;q=1", "html"],
    ["text/html;q=0, */*;q=1", "markdown"],
    ["text/*;q=0.9, text/html;q=0.1", "markdown"],
    ["text/html;q=0, text/markdown;q=0", null],
    ["application/json", null], ["*/*;q=0", null],
    ["TEXT/MARKDOWN;Q=0.7", "markdown"],
    ["text/markdown; charset=UTF-8", "markdown"],
    ['text/markdown; charset="utf-8"', "markdown"],
    ["text/markdown; variant=unknown", null],
    ['text/markdown; variant="x,y", text/html', "html"],
    ["text/markdown;q=invalid", null], ["text/markdown;q=1.1", null],
    ["text/markdown;q=-1", null], ["text/markdown;q=0.1234", null],
    ["not-a-type", null],
    ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "html"],
  ])("%s selects %s", (accept, result) => {
    expect(negotiatePageRepresentation(accept)).toBe(result);
  });
});

describe("CloudFront routes", () => {
  function route(uri: string, accept = "*/*", method = "GET") {
    return routeRequest({ request: { uri, method, headers: { accept: { value: accept } } } });
  }
  it.each(["/", "/index.html", "/about", "/about/", "/contact", "/privacy/index.html"])("separates cached variants for %s", (uri) => {
    const html = route(uri, "text/html");
    const markdown = route(uri, "text/markdown");
    expect(html).toHaveProperty("uri", expect.stringMatching(/\.html$/));
    expect(markdown).toHaveProperty("uri", expect.stringMatching(/\.md$/));
    expect(html).not.toEqual(markdown);
  });
  it.each(["/missing", "/missing/", "/missing.html", "/missing.json", "/about/nope", "/__proto__", "/constructor"])("returns a real informative 404 for %s", (uri) => {
    expect(route(uri)).toMatchObject({ statusCode: 404, body: expect.stringContaining("sitemap.xml") });
  });
  it("returns an empty HEAD error and a 406 when no type is supported", () => {
    expect(route("/missing", "*/*", "HEAD")).toMatchObject({ statusCode: 404, body: "" });
    expect(route("/", "application/json")).toMatchObject({ statusCode: 406, headers: { vary: { value: "Accept, Accept-Encoding" } } });
  });
  it.each(["/assets/app-abc.js", "/ffmpeg/ffmpeg-core.wasm", "/robots.txt", "/llms.txt", "/sitemap.xml", "/og-image.png"])("preserves assets and discovery files: %s", (uri) => {
    expect(route(uri, "application/octet-stream")).toHaveProperty("uri", uri);
  });
  it("handles repeated Accept headers", () => {
    expect(routeRequest({ request: { uri: "/", method: "GET", headers: { accept: { value: "text/html;q=0.1", multiValue: [{ value: "text/html;q=0.1" }, { value: "text/markdown" }] } } } })).toHaveProperty("uri", "/index.md");
  });
  it("splits Accept headers with a linear scanner instead of a backtracking lookahead", () => {
    const source = readFileSync("terraform/functions/site-request.js", "utf8");
    expect(source).not.toMatch(/split\(\s*\/[^/]*\(\?=/);
    expect(source).toContain("splitOutsideQuotes");
  });
  it("sets MIME and downstream caching headers on cached responses", () => {
    const handler = runInNewContext(readFileSync("terraform/functions/site-response.js", "utf8") + "\nhandler");
    for (const uri of ["/index.html", "/index.md", "/about/index.md"]) {
      const response = handler({ request: { uri }, response: { statusCode: 200, headers: { "content-type": { value: "text/html" } } } });
      expect(response.headers.vary.value).toBe("Accept, Accept-Encoding");
      if (uri.endsWith(".md")) expect(response.headers["content-type"].value).toBe("text/markdown; charset=utf-8");
    }
  });
});
