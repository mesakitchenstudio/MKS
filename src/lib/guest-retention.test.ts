import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canDeleteGuestVisitors, canViewGuestNetworkDiagnostics } from "./admin-access.ts";
import { dbAvailable, getDb } from "./db.ts";
import {
  GUEST_RETENTION_DEFAULTS,
  getGuestRetentionConfig,
  guestRetentionCutoff,
  parseGuestRetentionDays,
  shouldDeleteInactiveGuest,
  shouldDeleteStalePresence,
  shouldScrubGuestPageViewIp,
  shouldScrubGuestVisitorIp,
} from "./guest-retention-config.ts";
import { GUEST_RETENTION_BATCH_SIZE, GUEST_RETENTION_MAX_BATCHES_PER_STEP, runGuestRetentionLifecycle } from "./guest-retention.ts";
import { isYoutubeFunnelAudienceHuman } from "./youtube-funnel/audience.ts";
import { shouldSkipGuestAnalyticsIngest } from "./guest-tracking.ts";
import { uniqueIps } from "./ip-utils.ts";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("Phase 2E guest retention config", () => {
  it("1. defaults = 7 / 30 / 400", () => {
    assert.deepEqual(getGuestRetentionConfig({}), GUEST_RETENTION_DEFAULTS);
  });

  it("2. valid env override accepted", () => {
    assert.deepEqual(
      getGuestRetentionConfig({
        GUEST_PRESENCE_RETENTION_DAYS: "14",
        GUEST_NETWORK_RETENTION_DAYS: "45",
        GUEST_INACTIVE_RETENTION_DAYS: "500",
      }),
      {
        presenceRetentionDays: 14,
        networkRetentionDays: 45,
        inactiveRetentionDays: 500,
      },
    );
  });

  it("3–5. zero / negative / malformed fall back safely", () => {
    assert.equal(parseGuestRetentionDays("0", 7), 7);
    assert.equal(parseGuestRetentionDays("-3", 30), 30);
    assert.equal(parseGuestRetentionDays("abc", 400), 400);
    assert.equal(parseGuestRetentionDays("30.5", 30), 30);
    assert.equal(parseGuestRetentionDays("", 7), 7);
  });
});

describe("Phase 2E retention eligibility rules", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("6–7. stale presence deleted; recent retained", () => {
    const cutoff = guestRetentionCutoff(7, now);
    assert.equal(
      shouldDeleteStalePresence({
        lastSeenAt: new Date(now.getTime() - 8 * 86400000),
        presenceCutoff: cutoff,
      }),
      true,
    );
    assert.equal(
      shouldDeleteStalePresence({
        lastSeenAt: new Date(now.getTime() - 2 * 86400000),
        presenceCutoff: cutoff,
      }),
      false,
    );
  });

  it("8–10. pageview / visitor IP scrub age rules", () => {
    const cutoff = guestRetentionCutoff(30, now);
    assert.equal(
      shouldScrubGuestPageViewIp({
        ip: "203.0.113.10",
        createdAt: new Date(now.getTime() - 31 * 86400000),
        networkCutoff: cutoff,
      }),
      true,
    );
    assert.equal(
      shouldScrubGuestPageViewIp({
        ip: "203.0.113.10",
        createdAt: new Date(now.getTime() - 5 * 86400000),
        networkCutoff: cutoff,
      }),
      false,
    );
    assert.equal(
      shouldScrubGuestVisitorIp({
        ip: "203.0.113.10",
        ipUpdatedAt: new Date(now.getTime() - 40 * 86400000),
        lastSeenAt: now,
        networkCutoff: cutoff,
      }),
      true,
    );
    // Historical null ipUpdatedAt uses lastSeenAt — recent activity keeps IP.
    assert.equal(
      shouldScrubGuestVisitorIp({
        ip: "203.0.113.10",
        ipUpdatedAt: null,
        lastSeenAt: new Date(now.getTime() - 5 * 86400000),
        networkCutoff: cutoff,
      }),
      false,
    );
  });

  it("16–17. inactive visitor eligibility uses lastSeenAt inactivity", () => {
    const cutoff = guestRetentionCutoff(400, now);
    assert.equal(
      shouldDeleteInactiveGuest({
        lastSeenAt: new Date(now.getTime() - 401 * 86400000),
        inactiveCutoff: cutoff,
      }),
      true,
    );
    assert.equal(
      shouldDeleteInactiveGuest({
        lastSeenAt: new Date(now.getTime() - 10 * 86400000),
        inactiveCutoff: cutoff,
      }),
      false,
    );
  });

  it("documents bounded multi-batch work and omits networkScrubbedAt", () => {
    assert.equal(GUEST_RETENTION_BATCH_SIZE, 500);
    assert.equal(GUEST_RETENTION_MAX_BATCHES_PER_STEP, 20);
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.doesNotMatch(schema, /networkScrubbedAt/);
    assert.match(schema, /ipUpdatedAt\s+DateTime\?/);
    assert.match(schema, /@@index\(\[lastSeenAt\]\)/);
  });
});

describe("Phase 2E retention schema + permissions contracts", () => {
  it("18–19. pageviews and funnel events cascade with GuestVisitor", () => {
    const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    assert.match(
      schema,
      /model GuestPageView[\s\S]*onDelete: Cascade/,
    );
    assert.match(
      schema,
      /model FunnelEvent[\s\S]*onDelete: Cascade/,
    );
  });

  it("20. manual Owner deletion helpers remain Owner-only", () => {
    assert.equal(canDeleteGuestVisitors("owner"), true);
    assert.equal(canDeleteGuestVisitors("members"), false);
  });

  it("23–25. Audience unchanged; Owner network gate unchanged; scrubbed IPs filter out", () => {
    assert.equal(canViewGuestNetworkDiagnostics("members"), false);
    assert.equal(canViewGuestNetworkDiagnostics("owner"), true);
    assert.deepEqual(uniqueIps([null, "", "unknown", "203.0.113.9"]), ["203.0.113.9"]);
    assert.deepEqual(uniqueIps([null, ""]), []);
  });

  it("26–28. analytics gates remain Human-only; staff/member ingest skip preserved", () => {
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: "human", userAgent: CHROME }),
      true,
    );
    assert.equal(
      isYoutubeFunnelAudienceHuman({ clientKind: "unknown", userAgent: "" }),
      false,
    );
    assert.equal(
      shouldSkipGuestAnalyticsIngest({
        email: "m@x.com",
        staffRole: null,
        hasVerifiedAdminSession: false,
      }),
      true,
    );
    assert.equal(
      shouldSkipGuestAnalyticsIngest({
        email: null,
        staffRole: "owner",
        hasVerifiedAdminSession: false,
      }),
      true,
    );
  });

  it("cron route uses shared Bearer-only auth helper (no query secret)", () => {
    const route = readFileSync(
      new URL("../app/api/cron/guest-retention/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(route, /authorizeCronRequest/);
    assert.doesNotMatch(route, /searchParams\.get\("secret"\)/);
    assert.doesNotMatch(route, /\?secret/);
  });
});

describe("Phase 2E retention lifecycle against database", () => {
  it("scrubs IPs, keeps journey/UTM/classification, deletes stale presence and inactive visitors", async (t) => {
    if (!(await dbAvailable())) {
      t.skip("database unavailable");
      return;
    }

    const db = getDb();
    const now = new Date();
    const suffix = randomUUID();
    const activeKey = `ret-active-${suffix}`;
    const inactiveKey = `ret-inactive-${suffix}`;
    const scrubKey = `ret-scrub-${suffix}`;

    const active = await db.guestVisitor.create({
      data: {
        visitorKey: activeKey,
        firstSeenAt: now,
        lastSeenAt: now,
        lastPath: "/recipes/focaccia",
        ip: "203.0.113.50",
        ipUpdatedAt: now,
        country: "TR",
        city: "Istanbul",
        userAgent: CHROME,
        utmSource: "youtube",
        utmMedium: "video",
        utmCampaign: "spring",
        clientKind: "human",
        clientKindReasons: '["none"]',
        clientKindAt: now,
        pageViews: {
          create: [
            {
              path: "/recipes/focaccia",
              referer: "https://www.youtube.com/",
              ip: "203.0.113.50",
              userAgent: CHROME,
              createdAt: now,
            },
            {
              path: "/recipes/soup",
              referer: "",
              ip: "203.0.113.50",
              userAgent: CHROME,
              createdAt: new Date(now.getTime() - 40 * 86400000),
            },
          ],
        },
        presenceSessions: {
          create: {
            connectionKey: `conn-active-${suffix}`,
            lastSeenAt: now,
          },
        },
        funnelEvents: {
          create: {
            name: "recipe_video_play",
            recipeSlug: "focaccia",
            createdAt: now,
          },
        },
      },
      include: { pageViews: true },
    });

    const scrubVisitor = await db.guestVisitor.create({
      data: {
        visitorKey: scrubKey,
        firstSeenAt: new Date(now.getTime() - 60 * 86400000),
        lastSeenAt: new Date(now.getTime() - 5 * 86400000),
        lastPath: "/coming-soon",
        ip: "203.0.113.60",
        ipUpdatedAt: new Date(now.getTime() - 40 * 86400000),
        country: "US",
        city: "Austin",
        userAgent: CHROME,
        utmSource: "pinterest",
        clientKind: "human",
        clientKindAt: now,
      },
    });

    const inactive = await db.guestVisitor.create({
      data: {
        visitorKey: inactiveKey,
        firstSeenAt: new Date(now.getTime() - 500 * 86400000),
        lastSeenAt: new Date(now.getTime() - 450 * 86400000),
        lastPath: "/recipes/old",
        ip: "203.0.113.70",
        ipUpdatedAt: new Date(now.getTime() - 450 * 86400000),
        userAgent: CHROME,
        pageViews: {
          create: {
            path: "/recipes/old",
            ip: "203.0.113.70",
            createdAt: new Date(now.getTime() - 450 * 86400000),
          },
        },
        funnelEvents: {
          create: {
            name: "recipe_watch_on_youtube_click",
            recipeSlug: "old",
            createdAt: new Date(now.getTime() - 450 * 86400000),
          },
        },
        presenceSessions: {
          create: {
            connectionKey: `conn-old-${suffix}`,
            lastSeenAt: new Date(now.getTime() - 20 * 86400000),
          },
        },
      },
    });

    await db.guestPresenceSession.create({
      data: {
        visitorId: active.id,
        connectionKey: `conn-stale-${suffix}`,
        lastSeenAt: new Date(now.getTime() - 10 * 86400000),
      },
    });

    try {
      const first = await runGuestRetentionLifecycle({
        now,
        env: {
          GUEST_PRESENCE_RETENTION_DAYS: "7",
          GUEST_NETWORK_RETENTION_DAYS: "30",
          GUEST_INACTIVE_RETENTION_DAYS: "400",
        },
      });
      assert.equal(first.ok, true);
      assert.ok(first.presenceDeleted >= 1);
      assert.ok(first.pageViewIpsScrubbed >= 1);
      assert.ok(first.visitorIpsScrubbed >= 1);
      assert.ok(first.inactiveVisitorsDeleted >= 1);

      const kept = await db.guestVisitor.findUnique({
        where: { id: active.id },
        include: { pageViews: { orderBy: { createdAt: "asc" } }, funnelEvents: true, presenceSessions: true },
      });
      assert.ok(kept);
      assert.equal(kept.ip, "203.0.113.50");
      assert.equal(kept.utmSource, "youtube");
      assert.equal(kept.utmCampaign, "spring");
      assert.equal(kept.clientKind, "human");
      assert.equal(kept.country, "TR");
      assert.equal(kept.pageViews.length, 2);
      const landing = kept.pageViews.find((view) => view.path === "/recipes/focaccia");
      const older = kept.pageViews.find((view) => view.path === "/recipes/soup");
      assert.ok(landing);
      assert.ok(older);
      assert.equal(landing.ip, "203.0.113.50");
      assert.equal(older.ip, null);
      assert.equal(kept.funnelEvents.length, 1);
      assert.equal(kept.presenceSessions.length, 1);

      const scrubbed = await db.guestVisitor.findUnique({ where: { id: scrubVisitor.id } });
      assert.ok(scrubbed);
      assert.equal(scrubbed.ip, null);
      assert.equal(scrubbed.utmSource, "pinterest");
      assert.equal(scrubbed.clientKind, "human");
      assert.equal(scrubbed.city, "Austin");

      assert.equal(await db.guestVisitor.findUnique({ where: { id: inactive.id } }), null);
      assert.equal(
        await db.guestPageView.count({ where: { visitorId: inactive.id } }),
        0,
      );
      assert.equal(
        await db.funnelEvent.count({ where: { visitorId: inactive.id } }),
        0,
      );

      // Idempotent second run
      const second = await runGuestRetentionLifecycle({
        now,
        env: {
          GUEST_PRESENCE_RETENTION_DAYS: "7",
          GUEST_NETWORK_RETENTION_DAYS: "30",
          GUEST_INACTIVE_RETENTION_DAYS: "400",
        },
      });
      assert.equal(second.ok, true);
    } finally {
      await db.guestVisitor.deleteMany({
        where: { visitorKey: { in: [activeKey, inactiveKey, scrubKey] } },
      });
    }
  });
});
