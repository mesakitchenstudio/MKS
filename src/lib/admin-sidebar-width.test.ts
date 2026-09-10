import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ADMIN_SIDEBAR_DEFAULT_WIDTH_PX,
  ADMIN_SIDEBAR_KEYBOARD_STEP_PX,
  ADMIN_SIDEBAR_MAX_WIDTH_PX,
  ADMIN_SIDEBAR_MIN_WIDTH_PX,
  ADMIN_SIDEBAR_WIDTH_STORAGE_KEY,
  adminSidebarWidthFromKeyboard,
  adminSidebarWidthFromPointerDelta,
  clampAdminSidebarWidth,
  parseStoredAdminSidebarWidth,
  readAdminSidebarWidthFromStorage,
  writeAdminSidebarWidthToStorage,
} from "./admin-sidebar-width";

describe("admin sidebar width preference", () => {
  it("clamps to min/max and rounds", () => {
    assert.equal(clampAdminSidebarWidth(ADMIN_SIDEBAR_DEFAULT_WIDTH_PX), 240);
    assert.equal(clampAdminSidebarWidth(100), ADMIN_SIDEBAR_MIN_WIDTH_PX);
    assert.equal(clampAdminSidebarWidth(999), ADMIN_SIDEBAR_MAX_WIDTH_PX);
    assert.equal(clampAdminSidebarWidth(250.6), 251);
    assert.equal(clampAdminSidebarWidth(Number.NaN), ADMIN_SIDEBAR_DEFAULT_WIDTH_PX);
  });

  it("parses stored widths and rejects malformed values", () => {
    assert.equal(parseStoredAdminSidebarWidth("280"), 280);
    assert.equal(parseStoredAdminSidebarWidth(" 190 "), 190);
    assert.equal(parseStoredAdminSidebarWidth("100"), ADMIN_SIDEBAR_MIN_WIDTH_PX);
    assert.equal(parseStoredAdminSidebarWidth("500"), ADMIN_SIDEBAR_MAX_WIDTH_PX);
    assert.equal(parseStoredAdminSidebarWidth(null), null);
    assert.equal(parseStoredAdminSidebarWidth(""), null);
    assert.equal(parseStoredAdminSidebarWidth("abc"), null);
    assert.equal(parseStoredAdminSidebarWidth("{}"), null);
  });

  it("reads and writes localStorage through the preference helpers", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    assert.equal(readAdminSidebarWidthFromStorage(storage), ADMIN_SIDEBAR_DEFAULT_WIDTH_PX);
    assert.equal(writeAdminSidebarWidthToStorage(300, storage), 300);
    assert.equal(store.get(ADMIN_SIDEBAR_WIDTH_STORAGE_KEY), "300");
    assert.equal(readAdminSidebarWidthFromStorage(storage), 300);

    store.set(ADMIN_SIDEBAR_WIDTH_STORAGE_KEY, "nope");
    assert.equal(readAdminSidebarWidthFromStorage(storage), ADMIN_SIDEBAR_DEFAULT_WIDTH_PX);
  });

  it("moves width from pointer delta", () => {
    assert.equal(adminSidebarWidthFromPointerDelta(240, 100, 140), 280);
    assert.equal(adminSidebarWidthFromPointerDelta(240, 100, 40), 190);
    assert.equal(adminSidebarWidthFromPointerDelta(240, 100, 400), 420);
  });

  it("supports keyboard increment, decrement, home, and end", () => {
    assert.equal(
      adminSidebarWidthFromKeyboard(240, "ArrowRight"),
      240 + ADMIN_SIDEBAR_KEYBOARD_STEP_PX,
    );
    assert.equal(
      adminSidebarWidthFromKeyboard(240, "ArrowLeft"),
      240 - ADMIN_SIDEBAR_KEYBOARD_STEP_PX,
    );
    assert.equal(adminSidebarWidthFromKeyboard(200, "Home"), ADMIN_SIDEBAR_MIN_WIDTH_PX);
    assert.equal(adminSidebarWidthFromKeyboard(200, "End"), ADMIN_SIDEBAR_MAX_WIDTH_PX);
    assert.equal(adminSidebarWidthFromKeyboard(195, "ArrowLeft"), ADMIN_SIDEBAR_MIN_WIDTH_PX);
    assert.equal(adminSidebarWidthFromKeyboard(415, "ArrowRight"), ADMIN_SIDEBAR_MAX_WIDTH_PX);
    assert.equal(adminSidebarWidthFromKeyboard(240, "Enter"), null);
  });

  it("reset target is the documented default width", () => {
    assert.equal(ADMIN_SIDEBAR_DEFAULT_WIDTH_PX, 240);
    assert.equal(ADMIN_SIDEBAR_MIN_WIDTH_PX, 190);
    assert.equal(ADMIN_SIDEBAR_MAX_WIDTH_PX, 420);
  });

  it("AdminShell wires desktop resize separator without changing mobile drawer", () => {
    const shell = readFileSync(
      new URL("../components/admin/AdminShell.tsx", import.meta.url),
      "utf8",
    );
    assert.match(shell, /useSyncExternalStore/);
    assert.match(shell, /subscribeAdminSidebarWidth/);
    assert.match(shell, /role="separator"/);
    assert.match(shell, /aria-orientation="vertical"/);
    assert.match(shell, /aria-valuemin=\{ADMIN_SIDEBAR_MIN_WIDTH_PX\}/);
    assert.match(shell, /onPointerDown=\{onResizePointerDown\}/);
    assert.match(shell, /onDoubleClick=\{onResizeDoubleClick\}/);
    assert.match(shell, /adminMobileDrawerWidthClass/);
    assert.match(shell, /writeAdminSidebarWidthToStorage/);
    assert.match(shell, /style=\{\{\s*width:\s*sidebarWidth\s*\}\}/);
    assert.doesNotMatch(shell, /adminSidebarWidthClass/);
  });
});
