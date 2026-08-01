import { describe, expect, it } from "vitest";
import { isGoogleChrome } from "../../src/platform/browser-support.ts";

describe("Google Chrome detection", () => {
  it("uses the Google Chrome client-hint brand when available", () => {
    expect(
      isGoogleChrome({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "126" },
            { brand: "Google Chrome", version: "126" },
          ],
        },
        userAgent: "ignored",
      }),
    ).toBe(true);
  });

  it("does not accept another Chromium browser from client hints", () => {
    expect(
      isGoogleChrome({
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "126" },
            { brand: "Microsoft Edge", version: "126" },
          ],
        },
        userAgent: "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0",
      }),
    ).toBe(false);
  });

  it("falls back to the user agent for desktop and iOS Chrome", () => {
    expect(
      isGoogleChrome({
        userAgent: "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36",
      }),
    ).toBe(true);
    expect(
      isGoogleChrome({
        userAgent: "Mozilla/5.0 CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(true);
  });

  it.each([
    "Mozilla/5.0 Firefox/128.0",
    "Mozilla/5.0 Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0",
    "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 OPR/111.0",
    "Mozilla/5.0 Chrome/126.0.0.0 SamsungBrowser/26.0 Safari/537.36",
  ])("rejects a non-Chrome user agent: %s", (userAgent) => {
    expect(isGoogleChrome({ userAgent })).toBe(false);
  });
});
