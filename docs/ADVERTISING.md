# Advertising architecture

## 1. Current status

Advertising is **disabled**. No AdSense publisher ID is configured, no ad network scripts load, and `AdSlot` renders nothing (no boxes, reserved height, or layout shift).

## 2. Environment variables

| Variable | Purpose |
| --- | --- |
| `ADS_ENABLED` | Must be exactly `true` to allow any ads. Unset / any other value = off. |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | Future `ca-pub-…` client id. Placeholders (`XXXX`, `…`, `placeholder`) are rejected. |
| `ADSENSE_CLIENT` | Optional server-side alias; same validation as above. |

Coming Soon / private mode (`SITE_PRIVATE`) also blocks ads regardless of `ADS_ENABLED`.

## 3. Page eligibility policy

Policy lives in `src/lib/ads.ts` (`PAGE_POLICIES`, `resolveAdsPageKind`, `isAdsAllowedForPath`).

| Surface | Eligible? | Notes |
| --- | --- | --- |
| `/` (home) | No | |
| `/recipes` | Yes (when enabled) | Side-rail only — never in-grid |
| `/recipes/[slug]` | Yes (when enabled) | Side-rail + up to 2 in-content placements |
| `/studio`, `/series` | No | Disabled by default |
| `/about`, `/contact`, `/privacy`, `/disclosures` | No | |
| Auth / profile / member | No | `/auth/*`, `/profile`, password reset, etc. |
| `/admin/**` | **Never** | Hard deny |
| `/coming-soon` / private gate | No | |
| Unknown routes | No | Opt-in only |

Helpers:

- `isAdsAllowedForPath({ pathname, sitePrivate?, env? })` — page + global + private
- `getAllowedAdPlacements(...)` — placements for that path when allowed
- `isAdPlacementAllowed({ …, placement })` — single placement check
- `shouldLoadAdSenseScript(...)` — page eligible **and** real client id present

## 4. Placement IDs

Stable identifiers (for future impression / revenue reporting):

- `recipe_catalog_side_rail`
- `recipe_detail_side_rail`
- `recipe_detail_mid`
- `recipe_detail_after_recipe`

Do not invent extra placements without a product decision.

## 5. How `AdSlot` works

```tsx
<AdSlot placement="recipe_detail_mid" pathname={`/recipes/${slug}`} sitePrivate={…} />
```

While `ADS_ENABLED` is not `true`: returns `null` (absent from DOM and a11y tree).

When enabled and the placement is allowed: renders an `<aside data-ad-placement="…">` with reserved dimensions from `AD_PLACEMENT_META` (CLS control). Live `<ins>` markup is deferred until AdSense activation.

## 6. How to enable advertising later

1. Satisfy consent / privacy prerequisites (see below).
2. Set a real `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…`.
3. Set `ADS_ENABLED=true`.
4. Confirm eligible public pages only; Admin / auth / private remain blocked by policy.
5. Optionally mount side-rail units via an external provider **around** the centered content — do not shrink `/recipes` or insert grid rows.

`AdSensePathLoader` in the root layout calls `AdSenseLoader`, which loads `adsbygoogle.js` only when `shouldLoadAdSenseScript` passes.

## 7. Consent / privacy prerequisites

Today there is **no** cookie-consent CMP and no marketing/advertising consent gate. Newsletter / account consent is unrelated.

Before live ads:

- Add a consent mechanism that can block advertising scripts until required consent is granted (where law requires it).
- Review Privacy and Disclosures copy with counsel — do not invent legal wording in code.
- Wire `shouldLoadAdSenseScript` / slot render behind that consent check.

This doc does **not** claim compliance.

## 8. Pages that must remain ad-free

Home, About, Contact, legal, auth/member/profile, Admin, Coming Soon / private mode, Studio, Series (until deliberately re-enabled in `PAGE_POLICIES`).

## 9. Catalog grid rule

**Never** insert ads directly into recipe-card grids without an explicit product decision. Future catalog monetization is side-rail only; keep editorial whitespace as ordinary layout, not reserved ad columns.
