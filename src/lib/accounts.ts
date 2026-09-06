import { MEMBER_EXISTING_ACCOUNT_API_ERROR, MEMBER_GOOGLE_ONLY_ACCOUNT_API_ERROR } from "@/lib/auth-credentials";
import { evaluatePasswordRegistration } from "@/lib/member-session";
import { getDb } from "@/lib/db";
import { isAccessLevel, type AccessLevel } from "@/lib/admin-access";
import { MEMBER_PRESENCE_STALE_MS, MEMBER_PRESENCE_WRITE_THROTTLE_MS, normalizePresenceSessionKey, presenceLastSeenForGraceDisconnect } from "@/lib/member-presence";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { connectionMeta, type ConnectionMeta } from "@/lib/request-meta";
import type { Prisma } from "@prisma/client";

export type SavedRecipe = {
  slug: string;
  title: string;
};

function emailKey(email: string) {
  return email.trim().toLowerCase();
}

export function isGooglePhotoUrl(url: string) {
  return /googleusercontent\.com|ggpht\.com/i.test(url);
}

export async function getStaffByEmail(email: string) {
  const key = emailKey(email);
  if (!key) return null;

  try {
    const admin = await getDb().admin.findUnique({ where: { email: key } });
    if (admin) {
      const role: AccessLevel = isAccessLevel(admin.role) ? admin.role : "editor";
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role,
        photoUrl: admin.photoUrl || "",
        sessionVersion: admin.sessionVersion ?? 0,
      };
    }
  } catch {
    return null;
  }

  const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (ownerEmail && key === ownerEmail) {
    return {
      id: "env",
      email: ownerEmail,
      name: "Owner",
      role: "owner" as AccessLevel,
      photoUrl: "",
      sessionVersion: 0,
    };
  }

  return null;
}

/** Use the Google avatar as the default admin photo unless a custom upload is set.
 * Precedence: custom owned upload > Google profile photo > empty/default avatar.
 * Google OAuth refresh must never overwrite a custom photoUrl.
 */
export async function syncStaffGooglePhoto(email: string, imageUrl?: string | null) {
  const key = emailKey(email);
  const image = imageUrl?.trim() || "";
  if (!key || !image) return;

  try {
    const db = getDb();
    const admin = await db.admin.findUnique({ where: { email: key } });
    if (!admin) return;

    const current = admin.photoUrl || "";
    if (current && !isGooglePhotoUrl(current)) return;
    if (current === image) return;

    await db.admin.update({ where: { id: admin.id }, data: { photoUrl: image } });
  } catch (error) {
    console.error("Could not sync Google admin photo", error);
  }
}

/** Keep member Google profile photos in sync for the admin members table. */
export async function syncMemberGooglePhoto(email: string, imageUrl?: string | null) {
  const key = emailKey(email);
  const image = imageUrl?.trim() || "";
  if (!key || !image) return;

  try {
    const db = getDb();
    const user = await db.user.findUnique({ where: { email: key } });
    if (!user) return;
    if ((user.photoUrl || "") === image) return;
    await db.user.update({ where: { id: user.id }, data: { photoUrl: image } });
  } catch (error) {
    console.error("Could not sync Google member photo", error);
  }
}

export async function removeMemberByEmail(email: string) {
  try {
    await getDb().user.deleteMany({ where: { email: emailKey(email) } });
  } catch {
    // Member table may not exist yet during setup.
  }
}

/** Thrown when a JWT/cookie is still present but the member row was deleted. */
export class MemberSessionRevokedError extends Error {
  constructor(message = "Member session is no longer valid.") {
    super(message);
    this.name = "MemberSessionRevokedError";
  }
}

/** Lookup only — never creates a member from a leftover session. */
export async function findActiveMemberByEmail(email: string) {
  const key = emailKey(email);
  if (!key) return null;
  if (await getStaffByEmail(key)) return null;
  try {
    return await getDb().user.findUnique({ where: { email: key } });
  } catch (error) {
    console.error("Could not load active member", error);
    return null;
  }
}

export async function requireActiveMember(email: string) {
  const user = await findActiveMemberByEmail(email);
  if (!user) throw new MemberSessionRevokedError();
  return user;
}

export async function ensureMember(email: string, name = "", headers?: unknown) {
  try {
    return await ensureMemberRecord(email, name, headers);
  } catch (error) {
    console.error("Could not ensure member", error);
    return null;
  }
}

async function ensureMemberRecord(email: string, name = "", headers?: unknown) {
  if (await getStaffByEmail(email)) {
    await removeMemberByEmail(email);
    return null;
  }
  const db = getDb();
  const key = emailKey(email);
  const displayName = name.trim();
  const existing = await db.user.findUnique({ where: { email: key } });
  if (existing) {
    // Only backfill when we have request headers. Auth recording belongs to
    // NextAuth events.signIn; recording here without headers created duplicate
    // "Local" signup rows that raced the real connection.
    if (headers) {
      const connectionCount = await db.userConnection.count({ where: { userId: existing.id } });
      if (connectionCount === 0) {
        try {
          await recordConnection({
            email: existing.email,
            name: existing.name,
            method: existing.passwordHash ? "email" : "google",
            headers,
          });
        } catch (error) {
          console.error("Could not backfill connection", error);
        }
      }
    }
    if (displayName && (existing.name === existing.email || !existing.name)) {
      return db.user.update({
        where: { email: key },
        data: { name: displayName },
      });
    }
    return existing;
  }
  const user = await db.user.create({
    data: {
      email: key,
      name: displayName || key,
      notify: false,
    },
  });
  // Connection rows are recorded by NextAuth events.signIn (with headers) or
  // enrichMemberConnection — not here — to avoid duplicate signup events.
  if (headers) {
    try {
      await recordConnection({
        email: user.email,
        name: user.name,
        method: user.passwordHash ? "email" : "google",
        headers,
      });
    } catch (error) {
      console.error("Could not record first connection", error);
    }
  }
  return user;
}

export async function upsertGoogleUser(email: string, name: string, imageUrl?: string | null) {
  const user = await ensureMember(email, name);
  await syncMemberGooglePhoto(email, imageUrl);
  return user;
}

export async function registerEmailUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const db = getDb();
  const email = emailKey(input.email);
  if (await getStaffByEmail(email)) {
    throw new Error("This email is a studio admin. Use the admin login.");
  }
  const existing = await db.user.findUnique({ where: { email } });
  const registration = evaluatePasswordRegistration(existing);
  if (!registration.allowed) {
    if (registration.reason === "password_account_exists") {
      throw new Error(MEMBER_EXISTING_ACCOUNT_API_ERROR);
    }
    throw new Error(MEMBER_GOOGLE_ONLY_ACCOUNT_API_ERROR);
  }
  const passwordHash = hashPassword(input.password);
  const name = input.name.trim() || email;
  // User.notify is legacy — NewsletterSubscriber is the newsletter source of truth.
  return db.user.create({
    data: {
      email,
      name,
      passwordHash,
      notify: false,
    },
  });
}

export async function authenticateEmailUser(email: string, password: string) {
  const db = getDb();
  const user = await db.user.findUnique({ where: { email: emailKey(email) } });
  if (!user) {
    throw new Error("Email or password is not correct.");
  }
  if (!user.passwordHash) {
    throw new Error("This email uses Google sign-in. Use Continue with Google.");
  }
  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error("Email or password is not correct.");
  }
  return db.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });
}

/** Collapse rapid ensureMember + NextAuth signIn callbacks into one logical connection. */
const AUTH_CONNECTION_DEDUPE_MS = 15_000;

function isWeakNetworkIp(ip: string) {
  const value = ip.trim().toLowerCase();
  return (
    !value ||
    value === "unknown" ||
    value === "localhost" ||
    value === "::1" ||
    value === "127.0.0.1" ||
    value === "::ffff:127.0.0.1"
  );
}

async function applyBetterConnectionMeta(
  connection: {
    id: string;
    ip: string;
    userAgent: string;
    city: string;
    region: string;
    country: string;
    referer: string;
  },
  meta: ConnectionMeta,
) {
  const betterIp = Boolean(meta.ip && !isWeakNetworkIp(meta.ip) && isWeakNetworkIp(connection.ip));
  const betterAgent = Boolean(meta.userAgent && !connection.userAgent);
  const betterPlace = Boolean((meta.city || meta.country) && !connection.city && !connection.country);
  const betterReferer = Boolean(meta.referer && !connection.referer);
  if (!betterIp && !betterAgent && !betterPlace && !betterReferer) return false;

  await getDb().userConnection.update({
    where: { id: connection.id },
    data: {
      ip: betterIp ? meta.ip : connection.ip,
      userAgent: betterAgent ? meta.userAgent.slice(0, 500) : connection.userAgent,
      city: connection.city || meta.city,
      region: connection.region || meta.region,
      country: connection.country || meta.country,
      referer: connection.referer || meta.referer.slice(0, 500),
    },
  });
  return true;
}

export async function recordConnection(input: {
  email: string;
  name?: string;
  method: "google" | "email";
  headers?: unknown;
  meta?: ConnectionMeta;
}) {
  const db = getDb();
  const email = emailKey(input.email);
  if (await getStaffByEmail(email)) {
    await removeMemberByEmail(email);
    return null;
  }
  // Sign-in paths create the user first (upsertGoogleUser / register). Never revive
  // a deleted member from a leftover JWT via connection recording alone.
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;

  const meta = input.meta ?? connectionMeta(input.headers);

  // Auth callbacks can fire ensureMember + events.signIn nearly simultaneously.
  // One logical auth moment must yield one connection row.
  const recent = await db.userConnection.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - AUTH_CONNECTION_DEDUPE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    await applyBetterConnectionMeta(recent, meta);
    await db.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date(), name: user.name || input.name?.trim() || user.name },
    });
    return user;
  }

  const priorCount = await db.userConnection.count({ where: { userId: user.id } });
  await db.userConnection.create({
    data: {
      userId: user.id,
      event: priorCount === 0 ? "signup" : "signin",
      method: input.method,
      ip: meta.ip,
      country: meta.country,
      city: meta.city,
      region: meta.region,
      userAgent: (meta.userAgent || "").slice(0, 500),
      referer: (meta.referer || "").slice(0, 500),
    },
  });
  await db.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date(), name: user.name || input.name?.trim() || user.name },
  });
  return user;
}

export async function enrichMemberConnection(email: string, headers?: unknown) {
  const db = getDb();
  const user = await findActiveMemberByEmail(email);
  if (!user) return null;
  const meta = connectionMeta(headers);
  const latest = await db.userConnection.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) {
    await recordConnection({
      email,
      name: user.name,
      method: user.passwordHash ? "email" : "google",
      headers,
      meta,
    });
    return user;
  }

  await db.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });
  await applyBetterConnectionMeta(latest, meta);
  return user;
}

/** Lightweight heartbeat for “currently online” on the admin members page. */
export async function touchMemberPresence(
  email: string,
  name = "",
  sessionKey = "",
) {
  const db = getDb();
  const key = emailKey(email);
  if (!key || (await getStaffByEmail(key))) return null;

  const now = new Date();
  const presenceKey = normalizePresenceSessionKey(sessionKey);
  const trimmedName = name.trim();

  let user;
  try {
    user = await db.user.findUnique({
      where: { email: key },
      select: { id: true, lastSeenAt: true, name: true },
    });
  } catch {
    return null;
  }
  if (!user) return null;

  const lastSeenAge = now.getTime() - new Date(user.lastSeenAt).getTime();
  const nameNeedsUpdate = Boolean(trimmedName && trimmedName !== user.name);
  const shouldTouchUser =
    nameNeedsUpdate || lastSeenAge >= MEMBER_PRESENCE_WRITE_THROTTLE_MS;

  if (shouldTouchUser) {
    try {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          lastSeenAt: now,
          ...(nameNeedsUpdate ? { name: trimmedName } : {}),
        },
        select: { id: true, lastSeenAt: true, name: true },
      });
    } catch {
      // Member was deleted — do not recreate from the heartbeat.
      return null;
    }
  }

  if (presenceKey) {
    try {
      const existing = await db.memberPresenceSession.findUnique({
        where: { userId_sessionKey: { userId: user.id, sessionKey: presenceKey } },
        select: { lastSeenAt: true },
      });
      const sessionAge = existing
        ? now.getTime() - new Date(existing.lastSeenAt).getTime()
        : Number.POSITIVE_INFINITY;

      if (!existing || sessionAge >= MEMBER_PRESENCE_WRITE_THROTTLE_MS) {
        await db.memberPresenceSession.upsert({
          where: { userId_sessionKey: { userId: user.id, sessionKey: presenceKey } },
          create: { userId: user.id, sessionKey: presenceKey, lastSeenAt: now },
          update: { lastSeenAt: now },
        });
      }

      // Drop abandoned device rows so Online stays accurate without a migration job.
      await db.memberPresenceSession.deleteMany({
        where: {
          userId: user.id,
          lastSeenAt: { lt: new Date(now.getTime() - MEMBER_PRESENCE_STALE_MS * 3) },
        },
      });
    } catch (error) {
      console.error("Could not upsert member presence session", error);
    }
  }

  return user;
}

/** Remove only this browser/tab presence session. */
export async function clearMemberPresenceSession(
  email: string,
  sessionKey: string,
  options: { immediate?: boolean } = {},
) {
  const db = getDb();
  const key = emailKey(email);
  const presenceKey = normalizePresenceSessionKey(sessionKey);
  if (!key || !presenceKey) return false;

  const user = await db.user.findUnique({ where: { email: key }, select: { id: true } });
  if (!user) return false;

  const now = Date.now();
  if (options.immediate) {
    await db.memberPresenceSession.deleteMany({
      where: { userId: user.id, sessionKey: presenceKey },
    });
  } else {
    // Keep Online for a short grace window so refresh/navigation does not flicker.
    await db.memberPresenceSession.updateMany({
      where: { userId: user.id, sessionKey: presenceKey },
      data: { lastSeenAt: presenceLastSeenForGraceDisconnect(now) },
    });
  }

  // Other live connections (phone/desktop/tabs) keep the member Online.
  const otherLive = await db.memberPresenceSession.count({
    where: {
      userId: user.id,
      sessionKey: { not: presenceKey },
      lastSeenAt: { gte: new Date(now - MEMBER_PRESENCE_STALE_MS) },
    },
  });

  if (otherLive === 0) {
    // Final connection ended — stamp Last seen once.
    await db.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date(now) },
    });
  }

  return true;
}

export async function listOnlineMemberUserIds(now = Date.now()) {
  const db = getDb();
  const since = new Date(now - MEMBER_PRESENCE_STALE_MS);
  const rows = await db.memberPresenceSession.findMany({
    where: { lastSeenAt: { gte: since } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return new Set(rows.map((row) => row.userId));
}

/** Lightweight Admin → Members presence snapshot (ids + online + lastSeen). */
export async function listMembersPresenceSnapshot(limit = 200) {
  const db = getDb();
  const staff = await db.admin.findMany({ select: { email: true } });
  const staffEmails = staff.map((item) => item.email);
  const [users, onlineIds] = await Promise.all([
    db.user.findMany({
      where: staffEmails.length ? { email: { notIn: staffEmails } } : undefined,
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      select: { id: true, lastSeenAt: true },
    }),
    listOnlineMemberUserIds(),
  ]);

  return users.map((user) => ({
    id: user.id,
    online: onlineIds.has(user.id),
    lastSeenAt: user.lastSeenAt.toISOString(),
  }));
}

export async function getUserByEmail(email: string) {
  try {
    return await getDb().user.findUnique({
      where: { email: emailKey(email) },
      include: {
        saves: { orderBy: { createdAt: "desc" } },
        connections: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  } catch (error) {
    console.error("Could not load member profile", error);
    return null;
  }
}

/** Max members removable in one Owner/Audience bulk action (matches admin list take). */
export const MEMBER_BULK_DELETE_MAX = 200;

/** Dedupe and trim member user ids for bulk admin deletes. */
export function normalizeMemberIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export async function listUsersForAdmin(limit = 200) {
  const db = getDb();
  const staff = await db.admin.findMany({ select: { email: true } });
  const staffEmails = staff.map((item) => item.email);
  const [users, onlineIds] = await Promise.all([
    db.user.findMany({
      where: staffEmails.length ? { email: { notIn: staffEmails } } : undefined,
      orderBy: { lastSeenAt: "desc" },
      take: limit,
      include: {
        _count: { select: { saves: true, connections: true } },
        // Recent connections (newest first) for sign-in method and list LOCATION.
        connections: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }) as Promise<
      Prisma.UserGetPayload<{
        include: {
          _count: { select: { saves: true; connections: true } };
          connections: true;
        };
      }>[]
    >,
    listOnlineMemberUserIds(),
  ]);

  return users.map((user) => ({
    ...user,
    online: onlineIds.has(user.id),
  }));
}

export async function getUserForAdmin(id: string) {
  if (!id) return null;
  const db = getDb();
  const staff = await db.admin.findMany({ select: { email: true } });
  const staffEmails = new Set(staff.map((item) => item.email));
  const user = await db.user.findUnique({
    where: { id },
    include: {
      _count: { select: { saves: true, connections: true } },
      connections: { orderBy: { createdAt: "desc" }, take: 100 },
      saves: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });
  if (!user || staffEmails.has(user.email)) return null;
  const onlineIds = await listOnlineMemberUserIds();
  return { ...user, online: onlineIds.has(user.id) };
}

export async function listSaves(email: string): Promise<SavedRecipe[]> {
  const user = await getDb().user.findUnique({
    where: { email: emailKey(email) },
    include: { saves: { orderBy: { createdAt: "desc" } } },
  });
  return (user?.saves ?? []).map((save) => ({ slug: save.slug, title: save.title }));
}

export async function toggleSave(email: string, recipe: SavedRecipe) {
  const db = getDb();
  const user = await requireActiveMember(email);
  const existing = await db.recipeSave.findUnique({
    where: { userId_slug: { userId: user.id, slug: recipe.slug } },
  });
  if (existing) {
    await db.recipeSave.delete({ where: { id: existing.id } });
  } else {
    await db.recipeSave.create({
      data: { userId: user.id, slug: recipe.slug, title: recipe.title },
    });
  }
  return {
    liked: !existing,
    favorites: await listSaves(email),
  };
}

export async function removeSave(email: string, slug: string) {
  const db = getDb();
  const user = await requireActiveMember(email);
  await db.recipeSave.deleteMany({ where: { userId: user.id, slug } });
  return listSaves(email);
}

export async function importSaves(email: string, recipes: SavedRecipe[]) {
  const db = getDb();
  const user = await requireActiveMember(email);
  if (recipes.length === 0) return listSaves(email);
  for (const recipe of recipes) {
    await db.recipeSave.upsert({
      where: { userId_slug: { userId: user.id, slug: recipe.slug } },
      update: { title: recipe.title },
      create: { userId: user.id, slug: recipe.slug, title: recipe.title },
    });
  }
  return listSaves(email);
}
