import { createSessionToken } from "../src/lib/admin-session-token";

process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret";

const owner = createSessionToken({ id: "env", email: "o", name: "O", role: "owner", sv: 0 });
const editor = createSessionToken({ id: "e1", email: "e", name: "E", role: "editor", sv: 0 });

async function post(path: string, cookie: string, body: unknown) {
  const res = await fetch(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `mesa_admin_session=${cookie}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function main() {
  const preview = await post("/api/admin/youtube/chapter-sync/preview", owner, { recipeId: "missing" });
  console.log("preview-missing", preview.status, preview.json);

  const applyEditor = await post("/api/admin/youtube/chapter-sync/apply", editor, {
    recipeId: "missing",
    previewToken: "bad.token",
  });
  console.log("apply-editor", applyEditor.status, applyEditor.json);

  const applyOwnerBad = await post("/api/admin/youtube/chapter-sync/apply", owner, {
    recipeId: "missing",
    previewToken: "bad.token",
  });
  console.log("apply-owner-bad", applyOwnerBad.status, applyOwnerBad.json);
}

void main();
