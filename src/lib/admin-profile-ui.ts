import { accessLabel, canAccess, type AccessLevel } from "@/lib/admin-access";
import { isGooglePhotoUrl } from "@/lib/accounts";

export const ADMIN_PROFILE_PHOTO_FILE_HELP =
  "JPEG, PNG, WebP or GIF · max 2 MB · square works best.";

export const ADMIN_PROFILE_SYSTEM_OWNER_PHOTO_COPY =
  "Profile photos are stored on named Team Access accounts. The System Owner session does not have its own profile photo.";

export type AdminProfileAccountView = {
  displayName: string;
  roleLabel: string;
  email: string;
  sessionNote?: string;
};

export function buildAdminProfileAccountView(input: {
  isSystemOwner: boolean;
  name: string;
  role: AccessLevel | string;
  email: string;
}): AdminProfileAccountView {
  if (input.isSystemOwner) {
    return {
      displayName: "System owner",
      roleLabel: accessLabel(input.role),
      email: input.email.trim(),
      sessionNote: "Environment session",
    };
  }
  return {
    displayName: input.name.trim() || "Admin",
    roleLabel: accessLabel(input.role),
    email: input.email.trim(),
  };
}

export function adminProfilePhotoUsageCopy(role: AccessLevel | string) {
  if (canAccess(role, "content")) {
    return "This photo appears next to your name on public review replies.";
  }
  return "This is the profile photo for your Mesa staff account.";
}

export function adminProfileGooglePhotoHelper(photoUrl: string) {
  if (!isGooglePhotoUrl(photoUrl)) return "";
  return "Google provided this photo. Upload another to replace it.";
}
