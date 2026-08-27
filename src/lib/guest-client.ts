/** Client-safe guest UA classification for admin Visitors UI and metrics. */

export type GuestClientKind = "visitor" | "bot" | "unknown";

export type GuestClientInfo = {
  kind: GuestClientKind;
  /** Short human label for tables: "Chrome · Windows", "Googlebot", … */
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

function detectOs(userAgent: string) {
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iOS/i.test(userAgent)) return "iOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "";
}

function detectBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent) || /"Microsoft Edge"/i.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/i.test(userAgent)) return "Opera";
  if (/Chrome\/|Chromium\/|CriOS\//i.test(userAgent) || /"Google Chrome"|"Chromium"/i.test(userAgent)) {
    return "Chrome";
  }
  if (/Firefox\/|FxiOS\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  if (/WindowsPowerShell/i.test(userAgent)) return "PowerShell";
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
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  if (browser && os) return { kind: "visitor", label: `${browser} · ${os}` };
  if (browser) return { kind: "visitor", label: browser };
  if (os) return { kind: "visitor", label: os };

  return { kind: "unknown", label: ua.slice(0, 48) };
}

export function guestClientKindLabel(kind: GuestClientKind) {
  if (kind === "bot") return "Bot";
  if (kind === "unknown") return "Unknown";
  return "Visitor";
}

/** OS portion for visitor detail (Unknown when unavailable). */
export function guestOsLabel(userAgent: string) {
  return detectOs(userAgent.trim()) || "Unknown";
}

/** Browser/client portion for visitor detail (Unknown when unavailable). */
export function guestBrowserLabel(userAgent: string) {
  const ua = userAgent.trim();
  if (!ua) return "Unknown";
  const classified = classifyGuestClient(ua);
  if (classified.kind === "bot") return classified.label;
  return detectBrowser(ua) || "Unknown";
}
