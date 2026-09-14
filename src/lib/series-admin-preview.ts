/** Protected Collection preview URL keyed by canonical Series.id. */
export function adminSeriesPreviewPath(seriesId: string) {
  const id = seriesId.trim();
  if (!id) return "";
  return `/admin/series/${encodeURIComponent(id)}/preview`;
}

export function adminSeriesPreviewBannerCopy(published: boolean): {
  eyebrow: string;
  detail: string;
} {
  if (published) {
    return {
      eyebrow: "Collection preview",
      detail: "This collection is currently published.",
    };
  }
  return {
    eyebrow: "Draft collection preview",
    detail: "This collection is not publicly visible.",
  };
}
