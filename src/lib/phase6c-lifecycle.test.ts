import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  countUnreadAdminNotifications,
  filterAdminNotifications,
  humanizeAdminNotificationType,
  type AdminNotificationRecord,
} from "./admin-notifications.ts";
import {
  decideScheduledRecipePublish,
  formatIstanbulDateTimeLocal,
  isRecipeScheduled,
  parseIstanbulDateTimeLocal,
  recipePublicationLabel,
  validateScheduledPublishAt,
} from "./recipe-schedule.ts";
import { buildAdminNavSections } from "./admin-nav.ts";
import { zonedLocalToUtc } from "./youtube-data/release-planner.ts";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), "src", rel), "utf8");
}

function note(partial: Partial<AdminNotificationRecord> = {}): AdminNotificationRecord {
  return {
    id: partial.id ?? "n1",
    createdAt: partial.createdAt ?? "2026-09-07T12:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-09-07T12:00:00.000Z",
    type: partial.type ?? "recipe.schedule.succeeded",
    title: partial.title ?? "Published",
    body: partial.body ?? "",
    severity: partial.severity ?? "success",
    entityType: partial.entityType ?? "recipe",
    entityId: partial.entityId ?? "r1",
    entityLabel: partial.entityLabel ?? "Flatbread",
    entityPath: partial.entityPath ?? "/admin/recipes/r1",
    recipientAdminId: partial.recipientAdminId ?? null,
    readAt: partial.readAt ?? null,
    dismissedAt: partial.dismissedAt ?? null,
    metadata: partial.metadata ?? {},
  };
}

describe("phase 6C — recipe schedule helpers", () => {
  it("treats draft + scheduledPublishAt as Scheduled, not a third public status", () => {
    assert.equal(recipePublicationLabel({ status: "draft", scheduledPublishAt: null }), "Draft");
    assert.equal(
      recipePublicationLabel({
        status: "draft",
        scheduledPublishAt: "2026-09-08T12:00:00.000Z",
      }),
      "Scheduled",
    );
    assert.equal(
      recipePublicationLabel({
        status: "published",
        scheduledPublishAt: "2026-09-08T12:00:00.000Z",
      }),
      "Published",
    );
    assert.equal(
      isRecipeScheduled({ status: "published", scheduledPublishAt: "2026-09-08T12:00:00.000Z" }),
      false,
    );
  });

  it("round-trips Istanbul datetime-local through shared timezone helpers", () => {
    const utc = zonedLocalToUtc({
      year: 2026,
      month: 9,
      day: 10,
      hour: 15,
      minute: 0,
      timeZone: "Europe/Istanbul",
    });
    const local = formatIstanbulDateTimeLocal(utc);
    assert.equal(local, "2026-09-10T15:00");
    const parsed = parseIstanbulDateTimeLocal(local);
    assert.ok(parsed);
    assert.equal(parsed!.toISOString(), utc.toISOString());
  });

  it("rejects past schedule times", () => {
    const past = new Date(Date.now() - 120_000);
    const result = validateScheduledPublishAt(past);
    assert.equal(result.ok, false);
  });

  it("decides cron publish vs fail from readiness without inventing a second engine", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    assert.deepEqual(
      decideScheduledRecipePublish({
        status: "draft",
        scheduledPublishAt: due,
        readinessStatus: "ready",
        now: new Date("2026-01-01T00:01:00.000Z"),
      }),
      { action: "publish" },
    );
    assert.equal(
      decideScheduledRecipePublish({
        status: "draft",
        scheduledPublishAt: due,
        readinessStatus: "not_ready",
        now: new Date("2026-01-01T00:01:00.000Z"),
      }).action,
      "fail",
    );
    assert.equal(
      decideScheduledRecipePublish({
        status: "draft",
        scheduledPublishAt: due,
        readinessStatus: "ready_with_recommendations",
        now: new Date("2026-01-01T00:01:00.000Z"),
      }).action,
      "publish",
    );
  });
});

describe("phase 6C — admin notifications", () => {
  it("counts unread and hides dismissed using per-viewer receipt fields", () => {
    const rows = [
      note({ id: "a", readAt: null }),
      note({ id: "b", readAt: "2026-09-07T13:00:00.000Z" }),
      note({ id: "c", dismissedAt: "2026-09-07T13:00:00.000Z" }),
    ];
    assert.equal(countUnreadAdminNotifications(rows), 1);
    assert.deepEqual(
      filterAdminNotifications(rows).map((row) => row.id),
      ["a", "b"],
    );
    assert.equal(
      humanizeAdminNotificationType("recipe.schedule.blocked"),
      "Scheduled publish blocked",
    );
  });
});

describe("phase 6C — wiring", () => {
  it("exposes Notifications under Publishing with content permission", () => {
    const editor = buildAdminNavSections("editor");
    assert.ok(
      editor
        .find((section) => section.id === "publishing")
        ?.items.some((item) => item.href === "/admin/notifications"),
    );
    const audience = buildAdminNavSections("members");
    assert.equal(
      audience.some((section) => section.items.some((item) => item.href === "/admin/notifications")),
      false,
    );
  });

  it("wires cron, schema fields, and inbox without YouTube planner coupling in cron route", () => {
    const cron = read("app/api/cron/recipe-publish/route.ts");
    const server = read("lib/recipe-schedule-server.ts");
    const page = read("app/admin/(app)/notifications/page.tsx");
    const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const vercel = readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
    assert.match(cron, /authorizeRecipePublishCronRequest/);
    assert.match(cron, /runScheduledRecipePublishLifecycle/);
    assert.match(server, /getRecipePublishingReadiness/);
    assert.doesNotMatch(server, /YouTubeRelease|release-planner/);
    assert.match(page, /requireAccess\("content"\)/);
    assert.match(schema, /scheduledPublishAt/);
    assert.match(schema, /model AdminNotification/);
    // Hobby: recipe-publish is external every 10m, not a Vercel cron.
    assert.doesNotMatch(vercel, /recipe-publish/);
    assert.doesNotMatch(vercel, /\*\/10/);
  });

  it("keeps Activity audit separate from notification inbox", () => {
    const page = read("app/admin/(app)/notifications/page.tsx");
    assert.match(page, /not the Activity audit log/i);
    assert.doesNotMatch(page, /listAdminAuditEvents/);
  });
});
