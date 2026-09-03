/** Client-safe guest UA classification for admin Visitors UI and metrics. */

export type GuestClientKind = "visitor" | "bot" | "unknown";

export type GuestClientInfo = {
  kind: GuestClientKind;
  /** Short human label for tables: "Chrome · Windows", "iPhone · Safari", "Googlebot", … */
  label: string;
};

const NAMED_BOTS: { test: RegExp; label: string }[] = [
  {
    test: /googlebot|adsbot-google|google-inspectiontool|mediapartners-google|storebot-google|googleother|google-extended|feedfetcher-google|google-read-aloud|duplexweb-google|google-safety|googleproducer|apis-google/i,
    label: "Googlebot",
  },
  { test: /bingbot|bingpreview|msnbot/i, label: "Bingbot" },
  { test: /dataprovider/i, label: "Dataprovider bot" },
  { test: /facebookexternalhit|facebot/i, label: "Facebook bot" },
  { test: /twitterbot/i, label: "Twitter bot" },
  { test: /linkedinbot/i, label: "LinkedIn bot" },
  { test: /slackbot/i, label: "Slack bot" },
  { test: /applebot/i, label: "Applebot" },
  { test: /yandex(bot|images)/i, label: "Yandex bot" },
  { test: /duckduckbot/i, label: "DuckDuckBot" },
  { test: /baiduspider/i, label: "Baidu spider" },
  { test: /semrushbot/i, label: "Semrush bot" },
  { test: /ahrefsbot/i, label: "Ahrefs bot" },
  { test: /mj12bot/i, label: "Majestic bot" },
  { test: /dotbot/i, label: "DotBot" },
  { test: /bytespider/i, label: "Bytespider" },
  { test: /gptbot|chatgpt-user/i, label: "GPTBot" },
  { test: /claudebot|anthropic-ai/i, label: "Claude bot" },
  { test: /amazonbot/i, label: "Amazonbot" },
  { test: /petalbot/i, label: "Petal bot" },
];

/**
 * Device / platform detection.
 * Mobile tokens (iPhone, iPad, Android) must win before "like Mac OS X".
 */
export function detectGuestDevice(userAgent: string): { device: string; os: string } {
  const ua = userAgent.trim();
  if (!ua) return { device: "", os: "" };

  // Order is intentional: specific devices before generic OS tokens.
  if (/iPhone/i.test(ua)) return { device: "iPhone", os: "iOS" };
  if (/iPad/i.test(ua)) return { device: "iPad", os: "iPadOS" };
  if (/Android/i.test(ua)) return { device: "Android", os: "Android" };
  if (/Windows/i.test(ua)) return { device: "Windows", os: "Windows" };
  // Never treat "like Mac OS X" inside iPhone/iPad UAs as desktop macOS.
  if (/Macintosh/i.test(ua) || (/Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua))) {
    return { device: "macOS", os: "macOS" };
  }
  if (/Linux/i.test(ua)) return { device: "Linux", os: "Linux" };
  return { device: "", os: "" };
}

export function detectGuestBrowser(userAgent: string) {
  const ua = userAgent.trim();
  if (!ua) return "";

  if (/Edg\//i.test(ua) || /"Microsoft Edge"/i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Chrome\/|Chromium\/|CriOS\//i.test(ua) || /"Google Chrome"|"Chromium"/i.test(ua)) {
    return "Chrome";
  }
  if (/Firefox\/|FxiOS\//i.test(ua)) return "Firefox";
  // Mobile Safari and desktop Safari (Chrome already matched above when both appear).
  if (/Safari\//i.test(ua)) return "Safari";
  if (/WindowsPowerShell/i.test(ua)) return "PowerShell";
  return "";
}

/** Major browser version from UA when reliably present (e.g. Chrome/131 → "131"). */
export function detectGuestBrowserVersion(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) return "";
  const browser = detectGuestBrowser(ua);
  if (!browser) return "";

  const patterns: Record<string, RegExp> = {
    Edge: /(?:Edg|Edge)\/(\d+)/i,
    Opera: /(?:OPR|Opera)\/(\d+)/i,
    Chrome: /(?:Chrome|CriOS|Chromium)\/(\d+)/i,
    Firefox: /(?:Firefox|FxiOS)\/(\d+)/i,
    Safari: /Version\/(\d+)/i,
  };
  const match = patterns[browser]?.exec(ua);
  return match?.[1] || "";
}

function formatDeviceClientLabel(device: string, _os: string, browser: string) {
  if (device === "iPhone") return "iPhone · iOS";
  if (device === "iPad") return "iPad · iPadOS";
  if (device === "Android") return "Android";
  if (device === "Windows") return "Windows";
  if (device === "macOS") return "macOS";
  if (device === "Linux") return "Linux";
  // Client-only signal when no reliable device/OS was found (e.g. brand hints).
  if (browser) return browser;
  return "";
}

/** True for clearly automated crawlers — used by audience metrics. */
export function isBotUserAgent(userAgent: string) {
  return classifyGuestClient(userAgent).kind === "bot";
}

/** Human anonymous traffic for metrics (excludes bots; members never enter guest tables). */
export function isHumanGuestUserAgent(userAgent: string) {
  return !isBotUserAgent(userAgent);
}

export function classifyGuestClient(userAgent: string): GuestClientInfo {
  const ua = userAgent.trim();
  if (!ua) return { kind: "unknown", label: "Unknown" };

  for (const bot of NAMED_BOTS) {
    if (bot.test.test(ua)) {
      return { kind: "bot", label: bot.label };
    }
  }

  // Avoid matching device brands like "Cubot"; require crawler-like tokens.
  if (/\b(crawler|spider|crawl|scrapy|httpclient|python-requests|headlesschrome)\b/i.test(ua)) {
    return { kind: "bot", label: "Bot" };
  }
  if (/\b[a-z0-9_-]*(bot|crawler|spider)[a-z0-9_-]*\b/i.test(ua) && !/cubot/i.test(ua)) {
    return { kind: "bot", label: "Bot" };
  }

  // Do not treat bare "Google" / brand hints as bots without a crawler token.
  const { device, os } = detectGuestDevice(ua);
  const browser = detectGuestBrowser(ua);
  const label = formatDeviceClientLabel(device, os, browser);
  if (label) return { kind: "visitor", label };

  return { kind: "unknown", label: ua.slice(0, 48) };
}

/** Compact “Windows · Chrome 131” style label when UA is parseable. */
export function formatGuestOsBrowserLabel(userAgent: string): string {
  const ua = userAgent.trim();
  if (!ua) return "Unknown";
  const classified = classifyGuestClient(ua);
  if (classified.kind === "bot") return classified.label;

  const { device, os } = detectGuestDevice(ua);
  const browser = detectGuestBrowser(ua);
  const version = detectGuestBrowserVersion(ua);
  const platform = device || os || "";
  const browserPart = browser ? (version ? `${browser} ${version}` : browser) : "";

  if (platform && browserPart) return `${platform} · ${browserPart}`;
  if (platform) return platform;
  if (browserPart) return browserPart;
  return classified.label || "Unknown";
}

export function guestClientKindLabel(kind: GuestClientKind) {
  if (kind === "bot") return "Bot";
  if (kind === "unknown") return "Unknown";
  return "Visitor";
}

/** OS / platform portion (Unknown when unavailable). */
export function guestOsLabel(userAgent: string) {
  return detectGuestDevice(userAgent).os || "Unknown";
}

/** Browser portion (Unknown when unavailable; bots return classification label). */
export function guestBrowserLabel(userAgent: string) {
  const ua = userAgent.trim();
  if (!ua) return "Unknown";
  const classified = classifyGuestClient(ua);
  if (classified.kind === "bot") return classified.label;
  return detectGuestBrowser(ua) || "Unknown";
}

/** Shared Device / client string for Visitors list + detail (same as classifyGuestClient.label for humans). */
export function guestDeviceClientLabel(userAgent: string) {
  return classifyGuestClient(userAgent).label;
}
