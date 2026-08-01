const CHROME_BRAND = "Google Chrome";
const OTHER_CHROMIUM_BROWSER =
  /\b(?:Edg(?:e|A|iOS)?|OPR|Opera|SamsungBrowser|YaBrowser|Vivaldi|Brave|DuckDuckGo|FxiOS)\//i;

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
