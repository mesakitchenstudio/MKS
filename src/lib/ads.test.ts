import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdSenseLoader } from "@/components/ads/AdSenseLoader";
import { AdSlot } from "@/components/ads/AdSlot";
import {
  getAllowedAdPlacements,
  getAdSenseClientId,
  isAdsAllowedForPath,
  isAdPlacementAllowed,
  isAdsGloballyEnabled,
  resolveAdsPageKind,
  shouldLoadAdSenseScript,
} from "./ads";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const disabledEnv = { ADS_ENABLED: "false" } as NodeJS.ProcessEnv;
const enabledEnv = {
  ADS_ENABLED: "true",
  NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-1234567890123456",
} as NodeJS.ProcessEnv;

describe("ads global switch", () => {
  it("treats unset and non-true as disabled", () => {
    assert.equal(isAdsGloballyEnabled({}), false);
    assert.equal(isAdsGloballyEnabled({ ADS_ENABLED: "1" }), false);
    assert.equal(isAdsGloballyEnabled({ ADS_ENABLED: "false" }), false);
    assert.equal(isAdsGloballyEnabled({ ADS_ENABLED: "true" }), true);
  });

  it("rejects placeholder AdSense client ids", () => {
    assert.equal(getAdSenseClientId({}), null);
    assert.equal(getAdSenseClientId({ NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-XXXX" }), null);
    assert.equal(getAdSenseClientId({ NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-…" }), null);
    assert.equal(
      getAdSenseClientId({ NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-1234567890123456" }),
      "ca-pub-1234567890123456",
    );
  });
});

describe("ads route policy (centralized)", () => {
  it("marks Admin always ineligible", () => {
    assert.equal(resolveAdsPageKind("/admin"), "admin");
    assert.equal(resolveAdsPageKind("/admin/recipes"), "admin");
    assert.equal(
      isAdsAllowedForPath({ pathname: "/admin", sitePrivate: false, env: enabledEnv }),
      false,
    );
    assert.deepEqual(
      getAllowedAdPlacements({ pathname: "/admin/recipes", sitePrivate: false, env: enabledEnv }),
      [],
    );
  });

  it("marks homepage, about, contact, auth/member ineligible", () => {
    for (const pathname of [
      "/",
      "/about",
      "/contact",
      "/privacy",
      "/disclosures",
      "/profile",
      "/auth/signin",
      "/forgot-password",
      "/reset-password",
    ]) {
      assert.equal(
        isAdsAllowedForPath({ pathname, sitePrivate: false, env: enabledEnv }),
        false,
        pathname,
      );
    }
  });

  it("disables studio and series by default", () => {
    assert.equal(
      isAdsAllowedForPath({ pathname: "/studio", sitePrivate: false, env: enabledEnv }),
      false,
    );
    assert.equal(
      isAdsAllowedForPath({ pathname: "/series/foo", sitePrivate: false, env: enabledEnv }),
      false,
    );
  });

  it("allows /recipes only catalog side-rail placement", () => {
    assert.equal(resolveAdsPageKind("/recipes"), "recipe_catalog");
    assert.equal(
      isAdsAllowedForPath({ pathname: "/recipes", sitePrivate: false, env: enabledEnv }),
      true,
    );
    assert.deepEqual(
      getAllowedAdPlacements({ pathname: "/recipes", sitePrivate: false, env: enabledEnv }),
      ["recipe_catalog_side_rail"],
    );
    assert.equal(
      isAdPlacementAllowed({
        pathname: "/recipes",
        placement: "recipe_detail_mid",
        sitePrivate: false,
        env: enabledEnv,
      }),
      false,
    );
  });

  it("allows recipe detail configured placements", () => {
    const pathname = "/recipes/herb-focaccia";
    assert.equal(resolveAdsPageKind(pathname), "recipe_detail");
    assert.deepEqual(
      getAllowedAdPlacements({ pathname, sitePrivate: false, env: enabledEnv }),
      ["recipe_detail_side_rail", "recipe_detail_mid", "recipe_detail_after_recipe"],
    );
  });

  it("defaults unknown routes to ads disabled", () => {
    assert.equal(resolveAdsPageKind("/category/mains"), "other");
    assert.equal(resolveAdsPageKind("/search"), "other");
    assert.equal(resolveAdsPageKind("/some-future-page"), "other");
    assert.equal(
      isAdsAllowedForPath({
        pathname: "/some-future-page",
        sitePrivate: false,
        env: enabledEnv,
      }),
      false,
    );
  });

  it("blocks ads in Coming Soon / private mode even when globally enabled", () => {
    assert.equal(
      isAdsAllowedForPath({ pathname: "/recipes", sitePrivate: true, env: enabledEnv }),
      false,
    );
    assert.equal(
      shouldLoadAdSenseScript({
        pathname: "/recipes/herb-focaccia",
        sitePrivate: true,
        env: enabledEnv,
      }),
      false,
    );
    assert.equal(resolveAdsPageKind("/coming-soon"), "coming_soon");
    assert.equal(
      isAdsAllowedForPath({ pathname: "/coming-soon", sitePrivate: false, env: enabledEnv }),
      false,
    );
  });

  it("returns no placements while ADS_ENABLED=false", () => {
    assert.deepEqual(
      getAllowedAdPlacements({
        pathname: "/recipes/herb-focaccia",
        sitePrivate: false,
        env: disabledEnv,
      }),
      [],
    );
    assert.equal(
      shouldLoadAdSenseScript({
        pathname: "/recipes/herb-focaccia",
        sitePrivate: false,
        env: disabledEnv,
      }),
      false,
    );
  });
});

describe("AdSlot and AdSenseLoader while disabled", () => {
  it("AdSlot renders no markup when ADS_ENABLED is not true", () => {
    const prior = process.env.ADS_ENABLED;
    try {
      delete process.env.ADS_ENABLED;
      const html = renderToStaticMarkup(
        createElement(AdSlot, {
          placement: "recipe_detail_mid",
          pathname: "/recipes/herb-focaccia",
          sitePrivate: false,
        }),
      );
      assert.equal(html, "");
    } finally {
      if (prior === undefined) delete process.env.ADS_ENABLED;
      else process.env.ADS_ENABLED = prior;
    }
  });

  it("AdSenseLoader renders no script when disabled", () => {
    const prior = process.env.ADS_ENABLED;
    try {
      process.env.ADS_ENABLED = "false";
      const html = renderToStaticMarkup(
        createElement(AdSenseLoader, {
          pathname: "/recipes/herb-focaccia",
          sitePrivate: false,
        }),
      );
      assert.equal(html, "");
      assert.doesNotMatch(html, /googlesyndication|adsbygoogle/i);
    } finally {
      if (prior === undefined) delete process.env.ADS_ENABLED;
      else process.env.ADS_ENABLED = prior;
    }
  });
});

describe("ads wiring (source)", () => {
  it("keeps dormant recipe-detail AdSlots at editorial boundaries only", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    assert.match(page, /placement="recipe_detail_mid"/);
    assert.match(page, /placement="recipe_detail_after_recipe"/);
    assert.doesNotMatch(page, /recipe_catalog_side_rail/);
    const mid = page.indexOf('placement="recipe_detail_mid"');
    const after = page.indexOf('placement="recipe_detail_after_recipe"');
    const cooking = page.indexOf("<RecipeCookingWorkspace");
    const shell = page.indexOf("<RecipeContentShell");
    const collection = page.indexOf("<CollectionRow");
    assert.ok(cooking > 0 && mid > cooking && mid < shell);
    assert.ok(after > shell && after < collection);
  });

  it("does not insert AdSlot into the recipes catalog page", () => {
    const catalog = read("app/recipes/page.tsx");
    assert.doesNotMatch(catalog, /AdSlot|adsense|recipe_catalog_side_rail/i);
  });

  it("wires AdSensePathLoader in root layout with sitePrivate gate", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /AdSensePathLoader/);
    assert.match(layout, /sitePrivate=\{sitePrivate\}/);
  });

  it("documents advertising architecture", () => {
    const doc = readFileSync(path.join(root, "../../docs/ADVERTISING.md"), "utf8");
    assert.match(doc, /ADS_ENABLED/);
    assert.match(doc, /Never\*?\*? insert ads directly into recipe-card grids/);
  });
});
