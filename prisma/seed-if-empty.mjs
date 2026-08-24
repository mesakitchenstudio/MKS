import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const count = await prisma.recipeType.count();
  if (count > 0) {
    console.log(`Recipe types already exist (${count}). Skipping seed.`);
    process.exit(0);
  }
} finally {
  await prisma.$disconnect();
}

console.log("No recipe types found. Seeding types, categories, and recipes.");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["tsx", "prisma/seed.ts"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
