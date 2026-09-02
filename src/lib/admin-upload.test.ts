import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ADMIN_IMAGE_MAX_BYTES,
  GENERAL_ADMIN_IMAGE_MAX_BYTES,
  GENERAL_ADMIN_IMAGE_SIZE_ERROR,
  RECIPE_HERO_IMAGE_MAX_BYTES,
  RECIPE_HERO_IMAGE_SIZE_ERROR,
  resolveAdminImageUploadPolicy,
  validateAdminImageBytes,
  validateAdminImageFile,
} from "./admin-upload.ts";

describe("admin image upload limits", () => {
  it("recipe hero accepts up to exactly 5 MB", () => {
    const policy = resolveAdminImageUploadPolicy("recipes");
    assert.equal(policy.maxBytes, RECIPE_HERO_IMAGE_MAX_BYTES);
    assert.equal(
      validateAdminImageFile({ type: "image/jpeg", size: RECIPE_HERO_IMAGE_MAX_BYTES }, policy).ok,
      true,
    );
    const over = validateAdminImageFile(
      { type: "image/jpeg", size: RECIPE_HERO_IMAGE_MAX_BYTES + 1 },
      policy,
    );
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.error, RECIPE_HERO_IMAGE_SIZE_ERROR);
  });

  it("profile/admin uploads stay at 2 MB", () => {
    const policy = resolveAdminImageUploadPolicy("admins");
    assert.equal(policy.maxBytes, GENERAL_ADMIN_IMAGE_MAX_BYTES);
    assert.equal(ADMIN_IMAGE_MAX_BYTES, GENERAL_ADMIN_IMAGE_MAX_BYTES);
    assert.equal(
      validateAdminImageFile({ type: "image/jpeg", size: GENERAL_ADMIN_IMAGE_MAX_BYTES }, policy).ok,
      true,
    );
    const over = validateAdminImageFile(
      { type: "image/jpeg", size: GENERAL_ADMIN_IMAGE_MAX_BYTES + 1 },
      policy,
    );
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.error, GENERAL_ADMIN_IMAGE_SIZE_ERROR);
  });

  it("rejects oversized byte buffers on the server path using folder policy", () => {
    const bytes = new Uint8Array(GENERAL_ADMIN_IMAGE_MAX_BYTES + 1);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const adminResult = validateAdminImageBytes(bytes, resolveAdminImageUploadPolicy("admins"));
    assert.equal(adminResult.ok, false);
    if (!adminResult.ok) assert.equal(adminResult.error, GENERAL_ADMIN_IMAGE_SIZE_ERROR);

    const heroBytes = new Uint8Array(RECIPE_HERO_IMAGE_MAX_BYTES);
    heroBytes[0] = 0xff;
    heroBytes[1] = 0xd8;
    heroBytes[2] = 0xff;
    const heroResult = validateAdminImageBytes(heroBytes, resolveAdminImageUploadPolicy("recipes"));
    assert.equal(heroResult.ok, true);
  });

  it("keeps global Server Action body limit at 3mb (uploads use /api/admin/upload)", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    assert.match(config, /bodySizeLimit:\s*"3mb"/);
    assert.doesNotMatch(config, /bodySizeLimit:\s*"6mb"/);
  });
});
