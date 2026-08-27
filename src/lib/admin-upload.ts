/** Shared admin image upload rules (client + API). */

export const ADMIN_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const ADMIN_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AdminImageMime = (typeof ADMIN_IMAGE_MIME_TYPES)[number];

export const ADMIN_IMAGE_ACCEPT = ADMIN_IMAGE_MIME_TYPES.join(",");

export const ADMIN_IMAGE_HELP =
  "Square images work best. JPEG, PNG, WebP, or GIF · max 2 MB.";

export function isAdminImageMime(value: string): value is AdminImageMime {
  return (ADMIN_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/** Detect type from file signatures — do not trust extension or browser MIME alone. */
export function sniffAdminImageMime(bytes: Uint8Array): AdminImageMime | null {
  if (bytes.length < 12) return null;

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF87a / GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  // RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function validateAdminImageFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (file.size <= 0 || file.size > ADMIN_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "Choose an image smaller than 2 MB.",
    };
  }
  // Browser MIME is a hint only; server still sniffs bytes.
  if (file.type && !isAdminImageMime(file.type) && !file.type.startsWith("image/")) {
    return {
      ok: false,
      error: "Use a JPEG, PNG, WebP, or GIF image.",
    };
  }
  if (file.type && file.type.startsWith("image/") && !isAdminImageMime(file.type)) {
    return {
      ok: false,
      error: "Use a JPEG, PNG, WebP, or GIF image.",
    };
  }
  return { ok: true };
}

export function validateAdminImageBytes(
  bytes: Uint8Array,
): { ok: true; mime: AdminImageMime } | { ok: false; error: string } {
  if (bytes.length <= 0 || bytes.length > ADMIN_IMAGE_MAX_BYTES) {
    return { ok: false, error: "Choose an image smaller than 2 MB." };
  }
  const mime = sniffAdminImageMime(bytes);
  if (!mime) {
    return { ok: false, error: "Use a JPEG, PNG, WebP, or GIF image." };
  }
  return { ok: true, mime };
}

export function adminImageExtension(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/** True for files this app uploaded (safe to delete). Never Google-hosted avatars. */
export function isOwnedAdminUploadUrl(url: string) {
  const value = url.trim();
  if (!value) return false;
  if (/googleusercontent\.com|ggpht\.com/i.test(value)) return false;
  if (value.startsWith("/uploads/")) return true;
  try {
    const host = new URL(value).hostname;
    return /(^|\.)vercel-storage\.com$/i.test(host) || /(^|\.)blob\.vercel-storage\.com$/i.test(host);
  } catch {
    return false;
  }
}
