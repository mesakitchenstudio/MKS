import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  GOOGLE_ONETAP_PROVIDER_ID,
  isGoogleMemberAuthProvider,
  isGoogleOneTapClientConfigured,
  isGoogleOneTapPathEligible,
  resolveGoogleOneTapClientId,
} from "./google-onetap";
import { isGoogleIdTokenAuthConfigured } from "./google-id-token";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("Google One Tap path eligibility", () => {
  it("allows normal public pages", () => {
    assert.equal(isGoogleOneTapPathEligible("/"), true);
    assert.equal(isGoogleOneTapPathEligible("/recipes"), true);
    assert.equal(isGoogleOneTapPathEligible("/recipes/salsa-verde"), true);
    assert.equal(isGoogleOneTapPathEligible("/videos"), true);
    assert.equal(isGoogleOneTapPathEligible("/profile"), true);
  });

  it("excludes admin, auth utility, unsubscribe, and coming soon", () => {
    assert.equal(isGoogleOneTapPathEligible("/admin"), false);
    assert.equal(isGoogleOneTapPathEligible("/admin/login"), false);
    assert.equal(isGoogleOneTapPathEligible("/api/auth/session"), false);
    assert.equal(isGoogleOneTapPathEligible("/auth/error"), false);
    assert.equal(isGoogleOneTapPathEligible("/newsletter/unsubscribe"), false);
    assert.equal(isGoogleOneTapPathEligible("/newsletter/unsubscribe?token=x"), false);
    assert.equal(isGoogleOneTapPathEligible("/forgot-password"), false);
    assert.equal(isGoogleOneTapPathEligible("/reset-password"), false);
    assert.equal(isGoogleOneTapPathEligible("/coming-soon"), false);
  });
});

describe("Google One Tap provider identity", () => {
  it("treats OAuth google and google-onetap as the same member Google family", () => {
    assert.equal(GOOGLE_ONETAP_PROVIDER_ID, "google-onetap");
    assert.equal(isGoogleMemberAuthProvider("google"), true);
    assert.equal(isGoogleMemberAuthProvider("google-onetap"), true);
    assert.equal(isGoogleMemberAuthProvider("credentials"), false);
    assert.equal(isGoogleMemberAuthProvider(undefined), false);
  });
});

describe("Google ID token verification contracts", () => {
  it("requires AUTH_GOOGLE_ID and rejects empty credentials without calling Google", async () => {
    const previous = process.env.AUTH_GOOGLE_ID;
    try {
      delete process.env.AUTH_GOOGLE_ID;
      assert.equal(isGoogleIdTokenAuthConfigured(), false);
      const { verifyGoogleIdToken } = await import("./google-id-token.ts");
      assert.equal(await verifyGoogleIdToken(""), null);
      assert.equal(await verifyGoogleIdToken("not-a-jwt"), null);

      process.env.AUTH_GOOGLE_ID = "mesa-test-client-id.apps.googleusercontent.com";
      assert.equal(isGoogleIdTokenAuthConfigured(), true);
      assert.equal(await verifyGoogleIdToken(""), null);
      assert.equal(await verifyGoogleIdToken("eyJhbGciOiJSUzI1NiJ9.e30.sig"), null);
    } finally {
      if (previous === undefined) delete process.env.AUTH_GOOGLE_ID;
      else process.env.AUTH_GOOGLE_ID = previous;
    }
  });
});

describe("Google One Tap client ID resolution", () => {
  it("prefers the server-passed AUTH_GOOGLE_ID over empty NEXT_PUBLIC", () => {
    const previous = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    try {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      assert.equal(resolveGoogleOneTapClientId(""), "");
      assert.equal(isGoogleOneTapClientConfigured(""), false);
      assert.equal(
        resolveGoogleOneTapClientId("mesa-from-server.apps.googleusercontent.com"),
        "mesa-from-server.apps.googleusercontent.com",
      );
      assert.equal(
        isGoogleOneTapClientConfigured("mesa-from-server.apps.googleusercontent.com"),
        true,
      );
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "mesa-from-public.apps.googleusercontent.com";
      assert.equal(
        resolveGoogleOneTapClientId(""),
        "mesa-from-public.apps.googleusercontent.com",
      );
      assert.equal(
        resolveGoogleOneTapClientId("mesa-from-server.apps.googleusercontent.com"),
        "mesa-from-server.apps.googleusercontent.com",
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = previous;
    }
  });
});

describe("Google One Tap wiring", () => {
  it("registers Auth.js google-onetap provider and mounts client prompt behind public gate", () => {
    const auth = read("auth.ts");
    const layout = read("app/layout.tsx");
    const sessionProvider = read("components/AuthSessionProvider.tsx");
    const oneTap = read("components/GoogleOneTap.tsx");
    const accountMenu = read("components/AccountMenu.tsx");

    assert.match(auth, /GOOGLE_ONETAP_PROVIDER_ID/);
    assert.match(auth, /verifyGoogleIdToken/);
    assert.match(auth, /upsertGoogleUser/);
    assert.match(auth, /isGoogleMemberAuthProvider/);
    assert.doesNotMatch(auth, /use_fedcm_for_prompt/);

    assert.match(layout, /AUTH_GOOGLE_ID/);
    assert.match(layout, /googleOneTapEnabled=\{!sitePrivate && Boolean\(googleClientId\)\}/);
    assert.match(layout, /googleClientId=\{googleClientId\}/);
    assert.match(sessionProvider, /ConsentGatedGoogleOneTap/);
    assert.match(sessionProvider, /googleSignInEnhancementsAllowed/);
    assert.match(oneTap, /accounts\.google\.com\/gsi\/client/);
    assert.match(oneTap, /signIn\(GOOGLE_ONETAP_PROVIDER_ID/);
    assert.match(oneTap, /disableAutoSelect/);
    assert.match(oneTap, /resolveGoogleOneTapClientId|getNotDisplayedReason/);
    assert.doesNotMatch(oneTap, /use_fedcm_for_prompt/);
    assert.doesNotMatch(oneTap, /localStorage\.setItem\([^)]*credential|id_token/i);

    assert.match(accountMenu, /disableGoogleOneTapAutoSelect/);
  });
});
