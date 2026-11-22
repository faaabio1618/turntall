const CHROME_BRAND = "Google Chrome";
const OTHER_CHROMIUM_BROWSER =
  /\b(?:Edg(?:e|A|iOS)?|OPR|Opera|SamsungBrowser|YaBrowser|Vivaldi|Brave|DuckDuckGo|FxiOS)\//i;
const FIREFOX_VERSION = /\bFirefox\/(\d+)/;
const GECKO_ENGINE = /\bGecko\/\d/;

/**
 * Firefox 132 is the first release with requestVideoFrameCallback, which the
 * editor uses to read the presented frame's exact media time. It also ships
 * WebCodecs (Firefox 130) for the streaming editor.
 */
export const MIN_FIREFOX_VERSION = 132;

export interface BrowserNavigator {
  userAgent?: string;
  userAgentData?: {
    brands?: Array<{ brand: string; version?: string }>;
    mobile?: boolean;
  };
  maxTouchPoints?: number;
}

/**
 * Detect Google Chrome without accepting every Chromium-based browser.
 * User-Agent Client Hints are preferred because user-agent strings for
 * Chromium browsers commonly contain the word "Chrome".
 */
export function isGoogleChrome(
  browserNavigator: BrowserNavigator = navigator as BrowserNavigator,
) {
  const brands = browserNavigator.userAgentData?.brands;

  if (Array.isArray(brands) && brands.length > 0) {
    return brands.some(({ brand }) => brand === CHROME_BRAND);
  }

  const userAgent = browserNavigator.userAgent ?? "";
  return (
    /\b(?:Chrome|CriOS)\/\d+/i.test(userAgent) &&
    !OTHER_CHROMIUM_BROWSER.test(userAgent)
  );
}

/**
 * Detect the Gecko engine. Chromium and WebKit user agents only contain
 * "like Gecko", and Firefox on iOS (FxiOS) uses WebKit.
 */
export function isGeckoBrowser(
  browserNavigator: BrowserNavigator = navigator as BrowserNavigator,
) {
  const userAgent = browserNavigator.userAgent ?? "";
  return GECKO_ENGINE.test(userAgent) && FIREFOX_VERSION.test(userAgent);
}

/**
 * Detect a Firefox release with the media APIs the editor depends on. Firefox
 * does not expose User-Agent Client Hints, so only the user-agent string is
 * considered.
 */
export function isSupportedFirefox(
  browserNavigator: BrowserNavigator = navigator as BrowserNavigator,
) {
  if (!isGeckoBrowser(browserNavigator)) {
    return false;
  }

  const version = Number(
    FIREFOX_VERSION.exec(browserNavigator.userAgent ?? "")?.[1],
  );
  return Number.isFinite(version) && version >= MIN_FIREFOX_VERSION;
}

export function isSupportedBrowser(
  browserNavigator: BrowserNavigator = navigator as BrowserNavigator,
) {
  return (
    isGoogleChrome(browserNavigator) || isSupportedFirefox(browserNavigator)
  );
}

/**
 * Firefox's native video controls consume pointerdown, pointerup, and click
 * events inside the video, so page scripts never receive them. Chromium
 * forwards those events to the page.
 */
export function nativeVideoControlsCapturePointer(
  browserNavigator: BrowserNavigator = navigator as BrowserNavigator,
) {
  return isGeckoBrowser(browserNavigator);
}
