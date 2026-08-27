/** Shared admin image upload rules (client + API). */

export const ADMIN_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const ADMIN_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AdminImageMime = (typeof ADMIN_IMAGE_MIME_TYPES)[number];

export function isAdminImageMime(value: string): value is AdminImageMime {
  return (ADMIN_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function validateAdminImageFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (!isAdminImageMime(file.type)) {
    return {
      ok: false,
      error: "Use a JPEG, PNG, WebP, or GIF image.",
    };
  }
  if (file.size <= 0 || file.size > ADMIN_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "Images must be 2 MB or smaller.",
    };
  }
  return { ok: true };
}

export function adminImageExtension(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}
