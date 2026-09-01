import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const sqliteDatasource =
  /datasource db \{\r?\n  provider = "sqlite"\r?\n  url\s+= env\("DATABASE_URL"\)\r?\n\}/;
const production = source.replace(
  sqliteDatasource,
  `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}`,
);

if (production === source) {
  throw new Error("Could not prepare the production Prisma schema.");
}

writeFileSync(path.join(root, "prisma", "schema.production.prisma"), production);
