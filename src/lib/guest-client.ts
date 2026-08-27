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

  if (/iPhone/i.test(ua)) return { device: "iPhone", os: "iOS" };
  if (/iPad/i.test(ua)) return { device: "iPad", os: "iPadOS" };
  if (/Android/i.test(ua)) return { device: "Android", os: "Android" };
  if (/Windows/i.test(ua)) return { device: "Windows", os: "Windows" };
  // Only after mobile checks — iOS UAs contain "like Mac OS X".
  if (/Macintosh|Mac OS X/i.test(ua)) return { device: "macOS", os: "macOS" };
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

function formatDeviceClientLabel(device: string, os: string, browser: string) {
  const isMobileDevice = device === "iPhone" || device === "iPad" || device === "Android";
  if (isMobileDevice) {
    if (browser) return `${device} · ${browser}`;
    if (os) return `${device} · ${os}`;
    return device;
  }
  if (browser && os) return `${browser} · ${os}`;
  if (browser) return browser;
  if (os) return os;
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
