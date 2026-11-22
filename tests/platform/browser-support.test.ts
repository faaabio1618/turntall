import { describe, expect, it } from "vitest";
import {
  isGoogleChrome,
  isSupportedBrowser,
  isSupportedFirefox,
  nativeVideoControlsCapturePointer,
} from "../../src/platform/browser-support.ts";

const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:160.0) Gecko/20100101 Firefox/160.0";

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

describe("Firefox detection", () => {
  it.each([
    FIREFOX_WINDOWS,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  ])("accepts a current Firefox: %s", (userAgent) => {
    expect(isSupportedFirefox({ userAgent })).toBe(true);
  });

  it("rejects Firefox releases without presented-frame callbacks", () => {
    expect(
      isSupportedFirefox({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
      }),
    ).toBe(false);
  });

  it.each([
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 Version/17.5 Safari/605.1.15",
    "",
  ])("does not treat another engine as Firefox: %s", (userAgent) => {
    expect(isSupportedFirefox({ userAgent })).toBe(false);
  });

  it("ignores spoofed client hints that Firefox does not expose", () => {
    expect(
      isSupportedFirefox({
        userAgentData: {
          brands: [{ brand: "Microsoft Edge", version: "126" }],
        },
        userAgent: FIREFOX_WINDOWS,
      }),
    ).toBe(true);
  });
});

describe("native video control pointer handling", () => {
  it("needs a pointer layer only for Gecko's video controls", () => {
    expect(nativeVideoControlsCapturePointer({ userAgent: FIREFOX_WINDOWS })).toBe(
      true,
    );
    expect(
      nativeVideoControlsCapturePointer({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      }),
    ).toBe(false);
  });
});

describe("supported browser detection", () => {
  it("accepts Google Chrome and Firefox", () => {
    expect(
      isSupportedBrowser({
        userAgent: "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36",
      }),
    ).toBe(true);
    expect(isSupportedBrowser({ userAgent: FIREFOX_WINDOWS })).toBe(true);
  });

  it.each([
    "Mozilla/5.0 Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36 Edg/126.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
  ])("rejects an unsupported browser: %s", (userAgent) => {
    expect(isSupportedBrowser({ userAgent })).toBe(false);
  });
});
