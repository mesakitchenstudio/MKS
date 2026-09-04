import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canAccess,
  canViewGuestNetworkDiagnostics,
} from "./admin-access";
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
    assert.match(membersPage, /Member removed\./);
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
    assert.match(memberDetail, /account\s+activity/);
    assert.match(removeMember, /account activity/);
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
