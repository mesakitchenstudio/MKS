import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { ADMIN_COOKIE, createSessionToken } from "./admin-session-token.ts";
import { publicHeaderNavLabels, publicMobileNavLabels } from "./public-nav.ts";
import { proxy } from "../proxy.ts";
import { lessons } from "../data/lessons.ts";
import {
  canViewStudioLesson,
  filterPubliclyVisibleLessons,
  isStudioPath,
  isStudioPublicLaunchEnabled,
  shouldGateStudioRequest,
  visibleStudioLessons,
} from "./studio-public.ts";

describe("public navigation", () => {
  it("omits Studio from desktop and mobile nav labels", () => {
    assert.deepEqual(publicHeaderNavLabels(), ["Recipes", "Videos", "About"]);
    assert.deepEqual(publicMobileNavLabels(), ["All recipes", "Videos", "About", "Contact"]);
    assert.equal(publicHeaderNavLabels().includes("Studio"), false);
    assert.equal(publicMobileNavLabels().includes("Studio"), false);
  });
});

describe("studio public launch gate", () => {
  const originalLaunch = process.env.STUDIO_PUBLIC_LAUNCH;
  const originalPrivate = process.env.SITE_PRIVATE;
  const originalSecret = process.env.ADMIN_SECRET;

  afterEach(() => {
    process.env.STUDIO_PUBLIC_LAUNCH = originalLaunch;
    process.env.SITE_PRIVATE = originalPrivate;
    process.env.ADMIN_SECRET = originalSecret;
  });

  it("treats Studio as unpublished by default", () => {
    delete process.env.STUDIO_PUBLIC_LAUNCH;
    assert.equal(isStudioPublicLaunchEnabled(), false);
  });

  it("recognizes studio routes", () => {
    assert.equal(isStudioPath("/studio"), true);
    assert.equal(isStudioPath("/studio/how-to-measure"), true);
    assert.equal(isStudioPath("/recipes"), false);
  });

  it("gates studio routes for visitors when launch is disabled", () => {
    process.env.STUDIO_PUBLIC_LAUNCH = "false";
    assert.equal(shouldGateStudioRequest("/studio", null), true);
    assert.equal(shouldGateStudioRequest("/studio/how-to-measure", null), true);
    assert.equal(shouldGateStudioRequest("/recipes", null), false);
  });

  it("allows staff to preview studio while launch is disabled", () => {
    process.env.STUDIO_PUBLIC_LAUNCH = "false";
    process.env.ADMIN_SECRET = "test-admin-secret-for-studio";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid: "test-sid",
    });
    const cookie = `${ADMIN_COOKIE}=${token}`;
    assert.equal(shouldGateStudioRequest("/studio", cookie), false);
  });

  it("rewrites public studio requests to Coming Soon while unpublished", () => {
    process.env.SITE_PRIVATE = "false";
    process.env.STUDIO_PUBLIC_LAUNCH = "false";
    const req = new NextRequest(new URL("http://localhost:3000/studio"));
    const res = proxy(req);
    assert.equal(res.headers.get("x-middleware-rewrite"), "http://localhost:3000/coming-soon");
  });

  it("lets staff browse studio while launch is disabled", () => {
    process.env.SITE_PRIVATE = "false";
    process.env.STUDIO_PUBLIC_LAUNCH = "false";
    process.env.ADMIN_SECRET = "test-admin-secret-for-studio";
    const token = createSessionToken({
      id: "env",
      email: "owner@example.com",
      name: "Owner",
      role: "owner",
      sv: 0,
      sid: "test-sid",
    });
    const cookie = `${ADMIN_COOKIE}=${token}`;
    const req = new NextRequest(new URL("http://localhost:3000/studio"), {
      headers: { cookie },
    });
    const res = proxy(req);
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });

  it("hides draft lessons from public views and recipe cross-links", () => {
    process.env.STUDIO_PUBLIC_LAUNCH = "false";
    assert.deepEqual(filterPubliclyVisibleLessons(lessons), []);
    assert.deepEqual(visibleStudioLessons(lessons, false), []);
    assert.equal(canViewStudioLesson(lessons[0]!, false), false);
    assert.equal(canViewStudioLesson(lessons[0]!, true), true);
  });

  it("shows only published lessons publicly after launch", () => {
    process.env.STUDIO_PUBLIC_LAUNCH = "true";
    const published = { ...lessons[0]!, status: "published" as const };
    const draft = { ...lessons[1]!, status: "draft" as const };
    assert.deepEqual(filterPubliclyVisibleLessons([published, draft]), [published]);
    assert.equal(canViewStudioLesson(published, false), true);
    assert.equal(canViewStudioLesson(draft, false), false);
  });
});
