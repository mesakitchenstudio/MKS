import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_IMAGE_MAX_BYTES,
  ADMIN_IMAGE_SIZE_ERROR,
  validateAdminImageFile,
  validateAdminImageBytes,
} from "./admin-upload.ts";

describe("admin image upload limits", () => {
  const justBelow = ADMIN_IMAGE_MAX_BYTES - 1;
  const exactly = ADMIN_IMAGE_MAX_BYTES;
  const justAbove = ADMIN_IMAGE_MAX_BYTES + 1;

  it("accepts files just below 5 MB", () => {
    assert.equal(validateAdminImageFile({ type: "image/jpeg", size: justBelow }).ok, true);
  });

  it("accepts files exactly 5 MB", () => {
    assert.equal(validateAdminImageFile({ type: "image/jpeg", size: exactly }).ok, true);
  });

  it("rejects files just above 5 MB", () => {
    const result = validateAdminImageFile({ type: "image/jpeg", size: justAbove });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, ADMIN_IMAGE_SIZE_ERROR);
  });

  it("rejects oversized byte buffers on the server path", () => {
    const bytes = new Uint8Array(justAbove);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const result = validateAdminImageBytes(bytes);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, ADMIN_IMAGE_SIZE_ERROR);
  });
});
