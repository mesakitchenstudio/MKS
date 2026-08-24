import path from "node:path";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaUrl?: string };

function sqliteFileUrl() {
  const filePath = path.resolve(process.cwd(), "prisma", "dev.db");
  return `file:${filePath.replace(/\\/g, "/")}`;
}

function databaseUrl() {
  if (process.env.VERCEL) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL is not set");
    return url;
  }
  return sqliteFileUrl();
}

export function getDb() {
  const url = databaseUrl();
  if (!globalForPrisma.prisma || globalForPrisma.prismaUrl !== url) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url } },
    });
    globalForPrisma.prismaUrl = url;
  }
  return globalForPrisma.prisma;
}

export async function dbAvailable() {
  try {
    const db = getDb();
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
