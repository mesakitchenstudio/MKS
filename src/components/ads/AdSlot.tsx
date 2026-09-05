import {
  AD_PLACEMENT_META,
  type AdPlacementId,
  isAdPlacementAllowed,
  isAdsGloballyEnabled,
} from "@/lib/ads";

/**
 * Manual ad placement boundary.
 * While ADS_ENABLED is false: renders nothing (no box, no reserved height, no a11y node).
 */
export function AdSlot({
  placement,
  pathname,
  sitePrivate = false,
}: {
  placement: AdPlacementId;
  /** Current public pathname (e.g. `/recipes/herb-focaccia`). */
  pathname: string;
  sitePrivate?: boolean;
}) {
  if (!isAdsGloballyEnabled()) return null;
  if (
    !isAdPlacementAllowed({
      pathname,
      placement,
      sitePrivate,
    })
  ) {
    return null;
  }

  const meta = AD_PLACEMENT_META[placement];

  return (
    <aside
      data-ad-placement={placement}
      aria-label="Advertisement"
      className={`no-print mx-auto my-8 flex justify-center ${meta.reservedClassName}`}
    >
      {/* Live AdSense <ins> mounts here when publisher config is active. */}
    </aside>
  );
}
