import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canAccess,
  canDeleteMembers,
  canViewGuestNetworkDiagnostics,
} from "./admin-access";
import { normalizeMemberIds } from "./accounts";
import { adminWorkspaceWidthForPath } from "./admin-nav";
import {
  adminWorkspaceMembersDetail,
  adminWorkspaceMembersList,
  adminWorkspaceWide,
} from "./admin-ui";
import { formatAdminDate, formatAdminRelativeDateTime } from "./datetime";
import { formatPresenceLabel, formatSignInMethod, isMemberOnline } from "./member-presence";

const root = path.dirname(fileURLToPath(import.meta.url));
const membersPage = readFileSync(path.join(root, "../app/admin/(app)/members/page.tsx"), "utf8");
const memberDetail = readFileSync(
  path.join(root, "../app/admin/(app)/members/[id]/page.tsx"),
  "utf8",
);
const membersTable = readFileSync(
  path.join(root, "../components/admin/MembersTable.tsx"),
  "utf8",
);
const connectionHistory = readFileSync(
  path.join(root, "../components/admin/MemberConnectionHistory.tsx"),
  "utf8",
);
const memberNetwork = readFileSync(
  path.join(root, "../components/admin/MemberNetworkSection.tsx"),
  "utf8",
);
const visitorNetwork = readFileSync(
  path.join(root, "../components/admin/VisitorNetworkSection.tsx"),
  "utf8",
);
const removeMember = readFileSync(
  path.join(root, "../components/admin/RemoveMemberButton.tsx"),
  "utf8",
);

test("formatAdminDate omits time", () => {
  assert.equal(formatAdminDate("2026-08-24T22:50:00.000Z"), "Aug 24, 2026");
});

test("formatAdminRelativeDateTime uses today/yesterday labels", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  assert.equal(
    formatAdminRelativeDateTime("2026-08-27T07:58:00.000Z", now),
    "Today, 7:58 AM",
  );
  assert.equal(
    formatAdminRelativeDateTime("2026-08-26T16:12:00.000Z", now),
    "Yesterday, 4:12 PM",
  );
  assert.equal(
    formatAdminRelativeDateTime("2026-08-24T21:30:00.000Z", now),
    "Aug 24, 9:30 PM",
  );
});

test("formatSignInMethod labels providers", () => {
  assert.equal(formatSignInMethod("google"), "Google");
  assert.equal(formatSignInMethod("email"), "Email");
  assert.equal(formatSignInMethod(null), "—");
});

test("presence is textually Online or Offline", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");
  assert.equal(isMemberOnline("2026-08-27T11:58:00.000Z", now), true);
  assert.equal(formatPresenceLabel("2026-08-27T11:58:00.000Z", now), "Online");
  assert.equal(formatPresenceLabel("2026-08-27T11:00:00.000Z", now), "Offline");
});

describe("admin Members list contracts", () => {
  it("uses restrained intro and quiet presence metadata", () => {
    assert.match(membersPage, />\s*Members\s*</);
    assert.match(membersPage, /People with Mesa accounts\./);
    assert.doesNotMatch(membersPage, /Registered members and their recent activity/);
    assert.match(membersTable, /online · Sorted by last seen · Times in GMT/);
    assert.doesNotMatch(membersTable, /Updates automatically/);
    assert.doesNotMatch(membersTable, /border border-line bg-paper px-4 py-3/);
    assert.match(membersPage, /member removed\./i);
    assert.doesNotMatch(membersPage, /Team access/);
  });

  it("keeps four columns without Status, Location, or View", () => {
    assert.match(membersTable, /scope="col"/);
    assert.match(membersTable, />\s*Member\s*</);
    assert.match(membersTable, />\s*Last seen\s*</);
    assert.match(membersTable, />\s*Joined\s*</);
    assert.match(membersTable, />\s*Sign-in\s*</);
    assert.doesNotMatch(membersTable, />\s*Status\s*</);
    assert.doesNotMatch(membersTable, />\s*Location\s*</);
    assert.doesNotMatch(membersTable, />\s*View\s*</);
    assert.match(membersTable, /href=\{`\/admin\/members\/\$\{user\.id\}`\}/);
    assert.match(membersTable, /MEMBER_ADMIN_PRESENCE_POLL_MS/);
    assert.match(membersTable, /lastSeenAt/);
    assert.doesNotMatch(membersTable, /formatLatestCountryCityLocation/);
    assert.doesNotMatch(membersTable, /PresenceDot/);
  });

  it("uses Members-list-specific workspace width", () => {
    assert.equal(adminWorkspaceMembersList, "max-w-5xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/members"), adminWorkspaceMembersList);
    assert.notEqual(adminWorkspaceWidthForPath("/admin/visitors"), adminWorkspaceMembersList);
    assert.equal(adminWorkspaceWidthForPath("/admin/visitors"), adminWorkspaceWide);
  });
});

describe("admin Members bulk selection/deletion", () => {
  const actionsSource = readFileSync(
    path.join(root, "../app/admin/actions.ts"),
    "utf8",
  );
  const schema = readFileSync(path.join(root, "../../prisma/schema.prisma"), "utf8");
  const accountsSource = readFileSync(path.join(root, "./accounts.ts"), "utf8");

  it("normalizes and dedupes member ids for bulk delete", () => {
    assert.deepEqual(
      normalizeMemberIds([" abc ", "abc", "", "  ", "def"]),
      ["abc", "def"],
    );
  });

  it("Owner-only delete helper gates list Select and detail Remove", () => {
    assert.equal(canDeleteMembers("owner"), true);
    assert.equal(canDeleteMembers("members"), false);
    assert.equal(canDeleteMembers("editor"), false);
    assert.equal(canDeleteMembers(""), false);
    // Area access unchanged
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canAccess("members", "members"), true);
    assert.equal(canAccess("editor", "members"), false);
    assert.match(membersPage, /canDeleteMembers\(admin\.role\)/);
    assert.match(membersPage, /canDelete=\{canDelete\}/);
    assert.match(memberDetail, /canDeleteMembers\(admin\.role\)/);
    assert.match(memberDetail, /\{canDelete \? \(/);
  });

  it("permission matrix: Owner deletes; Audience views only; Editor denied Members", () => {
    // Owner
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canDeleteMembers("owner"), true);
    // Audience — view Members, never delete
    assert.equal(canAccess("members", "members"), true);
    assert.equal(canDeleteMembers("members"), false);
    // Editor — no Members area
    assert.equal(canAccess("editor", "members"), false);
    assert.equal(canDeleteMembers("editor"), false);
    // UI wiring: selection / Remove only when canDelete (Owner)
    assert.match(membersTable, /canDelete && sortedUsers\.length > 0/);
    assert.match(membersTable, /showSelectionChrome = canDelete && selectMode/);
    assert.match(memberDetail, /\{canDelete \? \([\s\S]*Remove account/);
    // Server rejects non-Owner on both actions
    assert.match(actionsSource, /deleteMemberAction[\s\S]*?if \(!canDeleteMembers\(admin\.role\)\)/);
    assert.match(
      actionsSource,
      /deleteMembersAction[\s\S]*?if \(!canDeleteMembers\(admin\.role\)\) \{\s*return \{ ok: false, error: "forbidden" \};/,
    );
  });

  it("default Owner view can show Select members; checkboxes only in selection mode", () => {
    assert.match(membersTable, /Select members/);
    assert.match(membersTable, /canDelete && sortedUsers\.length > 0/);
    assert.match(membersTable, /showSelectionChrome = canDelete && selectMode/);
    assert.match(membersTable, /\{showSelectionChrome \? \(/);
  });

  it("selection mode reveals Select page, count, Delete selected, and Cancel", () => {
    assert.match(membersTable, /aria-label="Select page"/);
    assert.match(membersTable, />Select page</);
    assert.match(membersTable, /\{selectedCount\} selected/);
    assert.match(membersTable, /Delete selected/);
    assert.match(membersTable, /Cancel selection/);
    assert.match(membersTable, /Select members on this page/);
  });

  it("Select page toggles only currently visible member ids", () => {
    assert.match(
      membersTable,
      /setSelectedIds\(checked \? new Set\(visibleIds\) : new Set\(\)\)/,
    );
    assert.match(membersTable, /indeterminate = someVisibleSelected/);
    assert.doesNotMatch(membersTable, /Select all \d+/i);
    assert.doesNotMatch(membersTable, /Delete all members/i);
  });

  it("member checkboxes use stable ids and name/email accessible labels", () => {
    assert.match(membersTable, /checked=\{selectedIds\.has\(user\.id\)\}/);
    assert.match(membersTable, /aria-label=\{`Select member \$\{label\}`\}/);
    assert.match(membersTable, /function memberSelectLabel/);
    assert.doesNotMatch(
      membersTable,
      /aria-label=\{`Select member \$\{user\.id\}`\}/,
    );
  });

  it("presence polling updates presence only and does not clear selection by itself", () => {
    assert.match(membersTable, /MEMBER_ADMIN_PRESENCE_POLL_MS/);
    assert.match(membersTable, /setPresenceById\(\(current\) =>/);
    assert.match(membersTable, /usersIdsKey !== trackedIdsKey/);
    const pollBlock = membersTable.slice(
      membersTable.indexOf("async function poll()"),
      membersTable.indexOf("const pollTimer"),
    );
    assert.doesNotMatch(pollBlock, /setSelectedIds/);
    assert.doesNotMatch(pollBlock, /setSelectMode/);
  });

  it("requires confirmation with accurate cascade copy (reviews retained, not deleted)", () => {
    assert.match(
      membersTable,
      /Permanently delete \$\{countLabel\} selected member\$\{selectedCount === 1 \? "" : "s"\}\? Their saved recipes and member activity will also be removed\. Their reviews will remain, but will no longer be linked to the member account\. This cannot be undone\./,
    );
    assert.doesNotMatch(membersTable, /reviews will also be (deleted|removed)/i);
    assert.match(removeMember, /saved recipes, and account activity/);
  });

  it("single and bulk delete enforce Owner-only canDeleteMembers server-side", () => {
    const singleStart = actionsSource.indexOf("export async function deleteMemberAction");
    const bulkStart = actionsSource.indexOf("export async function deleteMembersAction");
    const bulkEnd = actionsSource.indexOf(
      "export type DeleteGuestVisitorResult",
      bulkStart,
    );
    const singleBlock = actionsSource.slice(singleStart, bulkStart);
    const bulkBlock = actionsSource.slice(bulkStart, bulkEnd);
    assert.match(singleBlock, /await requireAccess\("members"\)/);
    assert.match(singleBlock, /if \(!canDeleteMembers\(admin\.role\)\)/);
    assert.match(bulkBlock, /await requireAccess\("members"\)/);
    assert.match(
      bulkBlock,
      /if \(!canDeleteMembers\(admin\.role\)\) \{\s*return \{ ok: false, error: "forbidden" \};/,
    );
    assert.doesNotMatch(bulkBlock, /canDeleteGuestVisitors/);
  });

  it("bulk action validates ids, caps count, and deletes atomically in a transaction", () => {
    assert.match(accountsSource, /export function normalizeMemberIds/);
    assert.match(accountsSource, /MEMBER_BULK_DELETE_MAX = 200/);
    assert.match(actionsSource, /normalizeMemberIds\(memberIds\)/);
    assert.match(actionsSource, /MEMBER_BULK_DELETE_MAX/);
    assert.match(actionsSource, /\$transaction/);
    assert.match(actionsSource, /MEMBER_DELETE_INCOMPLETE/);
    assert.match(actionsSource, /user\.deleteMany\(\{\s*where: \{ id: \{ in: ids \} \}/);
    assert.match(membersTable, /deleteMembersAction\(ids\)/);
    assert.doesNotMatch(membersTable, /deleteMemberAction\(/);
  });

  it("preserves cascade and review SetNull semantics", () => {
    assert.match(
      schema,
      /model RecipeSave[\s\S]*onDelete: Cascade/,
    );
    assert.match(
      schema,
      /model UserConnection[\s\S]*onDelete: Cascade/,
    );
    assert.match(
      schema,
      /model MemberPresenceSession[\s\S]*onDelete: Cascade/,
    );
    assert.match(
      schema,
      /model RecipeReview[\s\S]*onDelete: SetNull/,
    );
  });

  it("success flash uses correct singular/plural count", () => {
    assert.match(membersPage, /memberRemovedMessage/);
    assert.match(membersPage, /1 member removed\./);
    assert.match(membersPage, /members removed\./);
    assert.match(membersTable, /\/admin\/members\?removed=\$\{result\.deletedCount\}/);
    assert.match(membersTable, /router\.push/);
    assert.match(membersTable, /router\.refresh/);
    assert.match(actionsSource, /redirect\("\/admin\/members\?removed=1"\)/);
  });
});

describe("admin Member detail contracts", () => {
  it("uses identity-first metadata without Account/Activity cards", () => {
    assert.match(memberDetail, /← Members/);
    assert.match(memberDetail, /size="detail"/);
    assert.match(memberDetail, /Joined/);
    assert.match(memberDetail, /Sign-in/);
    assert.match(memberDetail, /Last seen/);
    assert.match(memberDetail, /Saved recipes/);
    assert.match(memberDetail, /MemberLiveLastSeen/);
    assert.doesNotMatch(memberDetail, />\s*Account\s*</);
    assert.doesNotMatch(memberDetail, />\s*Activity\s*</);
    assert.doesNotMatch(memberDetail, /First event/);
    assert.doesNotMatch(memberDetail, /Connections recorded/);
    assert.doesNotMatch(memberDetail, />\s*Member\s*</);
    assert.doesNotMatch(memberDetail, /Times in GMT/);
    assert.doesNotMatch(memberDetail, /Technical details/);
    assert.doesNotMatch(memberDetail, /Latest referrer/);
    assert.doesNotMatch(memberDetail, /User agent/);
    assert.doesNotMatch(memberDetail, /Danger zone/);
  });

  it("uses Account activity disclosure and Member context", () => {
    assert.match(connectionHistory, /Account activity/);
    assert.doesNotMatch(connectionHistory, /Connection history/);
    assert.match(connectionHistory, /useState\(false\)/);
    assert.match(connectionHistory, /aria-expanded/);
    assert.match(connectionHistory, /Signup/);
    assert.match(connectionHistory, /Sign-in/);
    assert.match(connectionHistory, /Newest first · Times in GMT/);
    assert.match(connectionHistory, /divide-y/);
    assert.match(memberDetail, /Member context/);
    assert.match(memberDetail, /Last device/);
    assert.match(memberDetail, /Approx\. location/);
    assert.match(memberDetail, /Remove account/);
    assert.match(memberDetail, /canDelete \? \(/);
    assert.match(memberDetail, /account\s+activity/);
    assert.match(removeMember, /account activity/);
  });

  it("Owner sees Remove account; Audience does not via canDeleteMembers", () => {
    assert.equal(canDeleteMembers("owner"), true);
    assert.equal(canDeleteMembers("members"), false);
    assert.match(memberDetail, /canDeleteMembers\(admin\.role\)/);
    assert.match(memberDetail, /\{canDelete \? \([\s\S]*Remove account/);
  });

  it("uses Members-specific network section without regressing Visitors", () => {
    assert.match(memberDetail, /MemberNetworkSection/);
    assert.doesNotMatch(memberDetail, /VisitorNetworkSection/);
    assert.match(memberNetwork, /canEnrich/);
    assert.match(memberNetwork, /Show approximate map/);
    assert.match(memberNetwork, /Raw network fields/);
    assert.match(memberNetwork, /useState\(false\)/);
    assert.match(visitorNetwork, /Network &amp; technical details/);
    assert.match(visitorNetwork, /IpDetailsPanel/);
  });

  it("aligns enrichment UI with Owner-only IP API capability", () => {
    assert.match(memberDetail, /canViewGuestNetworkDiagnostics\(admin\.role\)/);
    assert.equal(canViewGuestNetworkDiagnostics("owner"), true);
    assert.equal(canViewGuestNetworkDiagnostics("members"), false);
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canAccess("members", "members"), true);
    assert.equal(canAccess("editor", "members"), false);
  });

  it("uses Member-detail-specific workspace width", () => {
    assert.equal(adminWorkspaceMembersDetail, "max-w-[52rem]");
    assert.equal(
      adminWorkspaceWidthForPath("/admin/members/abc123"),
      adminWorkspaceMembersDetail,
    );
    assert.notEqual(
      adminWorkspaceWidthForPath("/admin/members"),
      adminWorkspaceMembersDetail,
    );
  });
});
