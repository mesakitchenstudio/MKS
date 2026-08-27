import { getDb } from "@/lib/db";
import { isAccessLevel, type AccessLevel } from "@/lib/admin-access";
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
      };
    }
  } catch {
    return null;
  }

  const ownerEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (ownerEmail && key === ownerEmail) {
    return { id: "env", email: ownerEmail, name: "Owner", role: "owner" as AccessLevel, photoUrl: "" };
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
  notify: boolean;
}) {
  const db = getDb();
  const email = emailKey(input.email);
  if (await getStaffByEmail(email)) {
    throw new Error("This email is a studio admin. Use the admin login.");
  }
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    throw new Error("An account with that email already exists.");
  }
  const passwordHash = hashPassword(input.password);
  const name = input.name.trim() || email;
  if (existing) {
    return db.user.update({
      where: { email },
      data: {
        name: existing.name || name,
        passwordHash,
        notify: input.notify,
        lastSeenAt: new Date(),
      },
    });
  }
  return db.user.create({
    data: {
      email,
      name,
      passwordHash,
      notify: input.notify,
    },
  });
}

export async function authenticateEmailUser(email: string, password: string) {
  const db = getDb();
  const identifier = email.trim();
  let user = await db.user.findUnique({ where: { email: emailKey(identifier) } });
  if (!user) {
    const users = await db.user.findMany();
    user = users.find((item) => item.name.toLowerCase() === identifier.toLowerCase()) ?? null;
  }
  if (!user) {
    throw new Error("Email or password is not correct.");
  }
  if (!user.passwordHash) {
    throw new Error("This email uses Google sign-in. Use Sign in with Google.");
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
  const user =
    (await db.user.findUnique({ where: { email } })) ||
    (await db.user.create({
      data: {
        email,
        name: input.name?.trim() || email,
      },
    }));

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

export async function enrichMemberConnection(email: string, name = "", headers?: unknown) {
  const db = getDb();
  const user = await ensureMember(email, name, headers);
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
export async function touchMemberPresence(email: string, name = "") {
  const db = getDb();
  const key = emailKey(email);
  if (!key || (await getStaffByEmail(key))) return null;

  try {
    return await db.user.update({
      where: { email: key },
      data: {
        lastSeenAt: new Date(),
        ...(name.trim() ? { name: name.trim() } : {}),
      },
    });
  } catch {
    return ensureMember(email, name);
  }
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

export async function listUsersForAdmin(limit = 200) {
  const db = getDb();
  const staff = await db.admin.findMany({ select: { email: true } });
  const staffEmails = staff.map((item) => item.email);
  return db.user.findMany({
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
  >;
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
  return user;
}

export async function listSaves(email: string): Promise<SavedRecipe[]> {
  const user = await getDb().user.findUnique({
    where: { email: emailKey(email) },
    include: { saves: { orderBy: { createdAt: "desc" } } },
  });
  return (user?.saves ?? []).map((save) => ({ slug: save.slug, title: save.title }));
}

export async function toggleSave(email: string, recipe: SavedRecipe, name = "", headers?: unknown) {
  const db = getDb();
  const user = await ensureMember(email, name, headers);
  if (!user) {
    return { liked: false, favorites: [] as SavedRecipe[] };
  }
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
  const user = await db.user.findUnique({ where: { email: emailKey(email) } });
  if (!user) return listSaves(email);
  await db.recipeSave.deleteMany({ where: { userId: user.id, slug } });
  return listSaves(email);
}

export async function importSaves(email: string, recipes: SavedRecipe[], name = "", headers?: unknown) {
  const db = getDb();
  const user = await ensureMember(email, name, headers);
  if (!user) return listSaves(email);
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
