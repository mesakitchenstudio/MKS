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
  return user;
}

export async function upsertGoogleUser(email: string, name: string) {
  return ensureMember(email, name);
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
  const isNew = Date.now() - user.createdAt.getTime() < 20_000;
  await db.userConnection.create({
    data: {
      userId: user.id,
      event: isNew ? "signup" : "signin",
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

  const betterIp = Boolean(
    meta.ip &&
      meta.ip !== "unknown" &&
      (!latest.ip || latest.ip === "unknown" || latest.ip === "::1" || latest.ip === "127.0.0.1"),
  );
  const betterAgent = Boolean(meta.userAgent && !latest.userAgent);
  const betterPlace = Boolean((meta.city || meta.country) && !latest.city && !latest.country);
  await db.user.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() },
  });
  if (!betterIp && !betterAgent && !betterPlace) return user;

  await db.userConnection.update({
    where: { id: latest.id },
    data: {
      ip: betterIp ? meta.ip : latest.ip,
      userAgent: betterAgent ? meta.userAgent.slice(0, 500) : latest.userAgent,
      city: latest.city || meta.city,
      region: latest.region || meta.region,
      country: latest.country || meta.country,
      referer: latest.referer || meta.referer.slice(0, 500),
    },
  });
  return user;
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

export async function listUsersForAdmin() {
  const db = getDb();
  const staff = await db.admin.findMany({ select: { email: true } });
  const staffEmails = staff.map((item) => item.email);
  return db.user.findMany({
    where: staffEmails.length ? { email: { notIn: staffEmails } } : undefined,
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { saves: true, connections: true } },
      connections: { orderBy: { createdAt: "desc" } },
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
