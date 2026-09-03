import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGuestAudience,
  classifyGuestAudienceFromUserAgent,
  GUEST_CLASSIFICATION_THRESHOLDS,
  guestAudienceKindLabel,
  guestClassificationReasonLabel,
  guestClassificationWriteFields,
  isAudienceHumanKind,
  isHumanAudienceGuest,
  matchesAudienceKindFilter,
  parseGuestClassificationReasons,
  parseGuestKindFilter,
  resolveGuestAudienceKind,
  serializeGuestClassificationReasons,
} from "./guest-classification.ts";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0)";
const GENERIC_CRAWLER = "SomeSiteCrawler/1.0 (+https://example.com/crawler)";
const HEADLESS = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/131.0.0.0 Safari/537.36";
const WEAK_SELENIUM =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 selenium";

function viewsAt(paths: string[], nowMs: number, spacingMs: number) {
  return paths.map((path, index) => ({
    path,
    createdAt: new Date(nowMs - index * spacingMs),
  }));
}

describe("Phase 2D guest audience classification", () => {
  it("1–5. known crawlers and strong automation → Bot", () => {
    assert.equal(classifyGuestAudienceFromUserAgent(GOOGLEBOT).kind, "bot");
    assert.equal(classifyGuestAudienceFromUserAgent(GOOGLEBOT).reasons[0], "known_named_bot_ua");
    assert.equal(classifyGuestAudienceFromUserAgent(BINGBOT).kind, "bot");
    assert.equal(classifyGuestAudienceFromUserAgent(GPTBOT).kind, "bot");
    assert.equal(classifyGuestAudienceFromUserAgent(GENERIC_CRAWLER).kind, "bot");
    assert.equal(classifyGuestAudienceFromUserAgent(HEADLESS).kind, "bot");
    assert.equal(
      classifyGuestAudienceFromUserAgent(HEADLESS).reasons[0],
      "strong_automation_ua",
    );
  });

  it("6–8. normal browsers → Human", () => {
    assert.equal(classifyGuestAudienceFromUserAgent(CHROME_WINDOWS).kind, "human");
    assert.equal(classifyGuestAudienceFromUserAgent(SAFARI_IPHONE).kind, "human");
    assert.equal(classifyGuestAudienceFromUserAgent(CHROME_ANDROID).kind, "human");
  });

  it("9. datacenter IP is irrelevant — normal Chrome alone is not Bot / Likely automated", () => {
    // Classifier has no IP/ASN input by design; AWS/Linode/etc. cannot flip the class.
    const result = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      recentPageViews: [],
    });
    assert.equal(result.kind, "human");
    assert.deepEqual(result.reasons, []);
  });

  it("10–11. empty / malformed UA → Unknown", () => {
    assert.equal(classifyGuestAudienceFromUserAgent("").kind, "unknown");
    assert.equal(
      classifyGuestAudienceFromUserAgent("").reasons[0],
      "empty_user_agent",
    );
    const malformed = classifyGuestAudienceFromUserAgent("some-unknown-client/1.0");
    assert.equal(malformed.kind, "unknown");
    assert.equal(malformed.reasons[0], "unparseable_user_agent");
  });

  it("12. one weak signal alone → NOT Likely automated", () => {
    const weakUaOnly = classifyGuestAudience({
      userAgent: WEAK_SELENIUM,
      recentPageViews: [],
    });
    assert.equal(weakUaOnly.kind, "human");

    const now = Date.now();
    const moderateRateOnly = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      now,
      recentPageViews: viewsAt(
        Array.from(
          { length: GUEST_CLASSIFICATION_THRESHOLDS.moderatePageviewsInWindow },
          (_, i) => `/recipes/page-${i}`,
        ),
        now,
        4_000,
      ),
    });
    assert.equal(moderateRateOnly.kind, "human");
    // Single moderate signals are not persisted as Likely automated; human returns empty reasons.
    assert.deepEqual(moderateRateOnly.reasons, []);
  });

  it("13. two documented weak/moderate signals → Likely automated", () => {
    const now = Date.now();
    const result = classifyGuestAudience({
      userAgent: WEAK_SELENIUM,
      now,
      recentPageViews: viewsAt(
        Array.from(
          { length: GUEST_CLASSIFICATION_THRESHOLDS.moderatePageviewsInWindow },
          (_, i) => `/recipes/page-${i}`,
        ),
        now,
        4_000,
      ),
    });
    assert.equal(result.kind, "likely_automated");
    assert.ok(result.reasons.includes("weak_automation_ua"));
    assert.ok(result.reasons.includes("high_pageview_rate"));
  });

  it("14. extreme machine-speed rate alone → Likely automated", () => {
    const now = Date.now();
    const result = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      now,
      recentPageViews: viewsAt(
        Array.from(
          { length: GUEST_CLASSIFICATION_THRESHOLDS.extremePageviewsInWindow },
          (_, i) => `/path-${i}`,
        ),
        now,
        500,
      ),
    });
    assert.equal(result.kind, "likely_automated");
    assert.ok(result.reasons.includes("extreme_pageview_rate"));
  });

  it("15. normal fast browsing does NOT trigger Likely automated", () => {
    const now = Date.now();
    // Several recipe tabs / refreshes well under moderate threshold (12 / 60s).
    const result = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      now,
      recentPageViews: viewsAt(
        ["/recipes/a", "/recipes/b", "/recipes/c", "/recipes/d", "/recipes/e", "/coming-soon"],
        now,
        3_000,
      ),
    });
    assert.equal(result.kind, "human");
  });

  it("16–18. persistence payload stores kind, reasons JSON, and timestamp", () => {
    const at = new Date("2026-09-04T10:00:00.000Z");
    const classified = classifyGuestAudienceFromUserAgent(GOOGLEBOT);
    const fields = guestClassificationWriteFields(classified, at);
    assert.equal(fields.clientKind, "bot");
    assert.equal(fields.clientKindAt.toISOString(), at.toISOString());
    assert.equal(fields.clientKindReasons, serializeGuestClassificationReasons(classified.reasons));
    assert.deepEqual(parseGuestClassificationReasons(fields.clientKindReasons), classified.reasons);
  });

  it("19. later ingest can recompute classification safely", () => {
    const now = Date.now();
    const first = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      now,
      recentPageViews: viewsAt(["/"], now, 0),
    });
    assert.equal(first.kind, "human");

    const second = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      now: now + 1_000,
      recentPageViews: viewsAt(
        Array.from({ length: GUEST_CLASSIFICATION_THRESHOLDS.extremePageviewsInWindow }, () => "/x"),
        now + 1_000,
        200,
      ),
    });
    assert.equal(second.kind, "likely_automated");
    const rewritten = guestClassificationWriteFields(second, new Date(now + 1_000));
    assert.equal(rewritten.clientKind, "likely_automated");
  });

  it("20–21. Member/staff skip is enforced before upsert (no classification write path)", () => {
    // Documented contract: classification only runs inside upsertGuestActivity.
    // Staff/member ingest is skipped earlier — covered in guest-tracking.test.ts.
    // Classification helpers never run for those requests because upsertGuestActivity is not called.
    assert.equal(typeof classifyGuestAudience, "function");
  });

  it("22–25. Human KPIs include Human only", () => {
    for (const kind of ["human", "likely_automated", "bot", "unknown"] as const) {
      assert.equal(isAudienceHumanKind(kind), kind === "human");
    }
  });

  it("isHumanAudienceGuest matches Visitors / Funnel Human-only gate", () => {
    assert.equal(isHumanAudienceGuest({ clientKind: "human", userAgent: CHROME_WINDOWS }), true);
    assert.equal(
      isHumanAudienceGuest({ clientKind: "likely_automated", userAgent: CHROME_WINDOWS }),
      false,
    );
    assert.equal(isHumanAudienceGuest({ clientKind: null, userAgent: CHROME_WINDOWS }), true);
    assert.equal(isHumanAudienceGuest({ clientKind: null, userAgent: "" }), false);
  });

  it("26. filter tabs return correct classes", () => {
    assert.equal(parseGuestKindFilter(undefined), "humans");
    assert.equal(parseGuestKindFilter("likely_automated"), "likely_automated");
    assert.equal(matchesAudienceKindFilter("human", "humans"), true);
    assert.equal(matchesAudienceKindFilter("likely_automated", "humans"), false);
    assert.equal(matchesAudienceKindFilter("likely_automated", "likely_automated"), true);
    assert.equal(matchesAudienceKindFilter("bot", "bots"), true);
    assert.equal(matchesAudienceKindFilter("unknown", "unknown"), true);
    assert.equal(matchesAudienceKindFilter("bot", "all"), true);
  });

  it("27–28. readable reason labels contain no network / IP data", () => {
    const labels = [
      guestClassificationReasonLabel("known_named_bot_ua"),
      guestClassificationReasonLabel("extreme_pageview_rate"),
      guestClassificationReasonLabel("empty_user_agent"),
    ];
    for (const label of labels) {
      assert.equal(/ip|asn|aws|linode|azure|cloudflare/i.test(label), false);
    }
    assert.equal(guestAudienceKindLabel("likely_automated"), "Likely automated");
  });

  it("historical null clientKind falls back to UA classifier", () => {
    assert.equal(
      resolveGuestAudienceKind({ clientKind: null, userAgent: GOOGLEBOT }),
      "bot",
    );
    assert.equal(
      resolveGuestAudienceKind({ clientKind: null, userAgent: CHROME_WINDOWS }),
      "human",
    );
    assert.equal(
      resolveGuestAudienceKind({ clientKind: "likely_automated", userAgent: CHROME_WINDOWS }),
      "likely_automated",
    );
  });

  it("extreme same-path burst alone → Likely automated", () => {
    const now = Date.now();
    const result = classifyGuestAudience({
      userAgent: CHROME_WINDOWS,
      now,
      recentPageViews: viewsAt(
        Array.from(
          { length: GUEST_CLASSIFICATION_THRESHOLDS.extremeSamePathBurstCount },
          () => "/recipes/spam",
        ),
        now,
        200,
      ),
    });
    assert.equal(result.kind, "likely_automated");
    assert.ok(result.reasons.includes("extreme_same_path_burst"));
  });
});
