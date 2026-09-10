/** Desktop Admin sidebar width preference — local UI only (not DB). */

export const ADMIN_SIDEBAR_WIDTH_STORAGE_KEY = "mesa:admin-sidebar-width:v1";

/** Current fixed layout: `w-[15rem]` ≈ 240px. */
export const ADMIN_SIDEBAR_DEFAULT_WIDTH_PX = 240;

export const ADMIN_SIDEBAR_MIN_WIDTH_PX = 190;

export const ADMIN_SIDEBAR_MAX_WIDTH_PX = 420;

export const ADMIN_SIDEBAR_KEYBOARD_STEP_PX = 10;

type SidebarWidthListener = () => void;

const sidebarWidthListeners = new Set<SidebarWidthListener>();

function emitAdminSidebarWidthChange() {
  for (const listener of sidebarWidthListeners) listener();
}

export function subscribeAdminSidebarWidth(onStoreChange: SidebarWidthListener): () => void {
  sidebarWidthListeners.add(onStoreChange);
  return () => {
    sidebarWidthListeners.delete(onStoreChange);
  };
}

export function getAdminSidebarWidthSnapshot(): number {
  return readAdminSidebarWidthFromStorage();
}

export function getAdminSidebarWidthServerSnapshot(): number {
  return ADMIN_SIDEBAR_DEFAULT_WIDTH_PX;
}

export function clampAdminSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return ADMIN_SIDEBAR_DEFAULT_WIDTH_PX;
  return Math.min(
    ADMIN_SIDEBAR_MAX_WIDTH_PX,
    Math.max(ADMIN_SIDEBAR_MIN_WIDTH_PX, Math.round(width)),
  );
}

/** Parse a stored preference; returns null when missing/malformed. */
export function parseStoredAdminSidebarWidth(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return clampAdminSidebarWidth(n);
}

export function readAdminSidebarWidthFromStorage(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): number {
  if (!storage) return ADMIN_SIDEBAR_DEFAULT_WIDTH_PX;
  try {
    const parsed = parseStoredAdminSidebarWidth(storage.getItem(ADMIN_SIDEBAR_WIDTH_STORAGE_KEY));
    return parsed ?? ADMIN_SIDEBAR_DEFAULT_WIDTH_PX;
  } catch {
    return ADMIN_SIDEBAR_DEFAULT_WIDTH_PX;
  }
}

export function writeAdminSidebarWidthToStorage(
  width: number,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null,
): number {
  const next = clampAdminSidebarWidth(width);
  if (!storage) {
    emitAdminSidebarWidthChange();
    return next;
  }
  try {
    storage.setItem(ADMIN_SIDEBAR_WIDTH_STORAGE_KEY, String(next));
  } catch {
    // Ignore quota / private-mode failures.
  }
  emitAdminSidebarWidthChange();
  return next;
}

export function adminSidebarWidthFromKeyboard(
  current: number,
  key: string,
): number | null {
  const width = clampAdminSidebarWidth(current);
  switch (key) {
    case "ArrowLeft":
      return clampAdminSidebarWidth(width - ADMIN_SIDEBAR_KEYBOARD_STEP_PX);
    case "ArrowRight":
      return clampAdminSidebarWidth(width + ADMIN_SIDEBAR_KEYBOARD_STEP_PX);
    case "Home":
      return ADMIN_SIDEBAR_MIN_WIDTH_PX;
    case "End":
      return ADMIN_SIDEBAR_MAX_WIDTH_PX;
    default:
      return null;
  }
}

export function adminSidebarWidthFromPointerDelta(
  startWidth: number,
  startClientX: number,
  clientX: number,
): number {
  return clampAdminSidebarWidth(startWidth + (clientX - startClientX));
}
