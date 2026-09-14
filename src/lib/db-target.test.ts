import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assertIngredientOperatorWriteTargetSafe,
  assertProductionOperatorDatabaseUrl,
  classifyDatabaseUrl,
  describeDatabaseTarget,
  getDatabaseTargetInfo,
} from "@/lib/db-target";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("db-target operator safety", () => {
  it("A: VERCEL=1 + file: URL is local SQLite, not remote/Production", () => {
    const env = {
      VERCEL: "1",
      DATABASE_URL: "file:./prisma/dev.db",
    };
    const info = getDatabaseTargetInfo(env);
    assert.equal(info.provider, "sqlite");
    assert.equal(info.isRemote, false);
    assert.equal(info.isProductionLike, false);

    const banner = describeDatabaseTarget(env);
    assert.match(banner, /Provider: SQLite/);
    assert.match(banner, /Production: NO/);
    assert.doesNotMatch(banner, /Production operator context: YES/);
    assert.doesNotMatch(banner, /remote/i);
  });

  it("B: VERCEL_ENV=production + file: fails Production write assertion", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DATABASE_URL: "file:./prisma/dev.db",
    };
    assert.throws(
      () => assertIngredientOperatorWriteTargetSafe(env),
      /Production\/operator write refused|must be postgres/i,
    );
    assert.throws(
      () => assertProductionOperatorDatabaseUrl(env.DATABASE_URL, env),
      /Refusing to create Prisma client/i,
    );
  });

  it("C: postgresql:// classifies as PostgreSQL", () => {
    const info = classifyDatabaseUrl(
      "postgresql://user:s3cret@ep-abc.neon.tech/neondb?sslmode=require",
    );
    assert.equal(info.provider, "postgresql");
    assert.equal(info.host, "ep-abc.neon.tech");
    assert.equal(info.databaseName, "neondb");
  });

  it("D: postgres:// classifies as PostgreSQL", () => {
    const info = classifyDatabaseUrl("postgres://u:p@db.example.com:5432/mesa");
    assert.equal(info.provider, "postgresql");
    assert.equal(info.host, "db.example.com");
    assert.equal(info.databaseName, "mesa");
  });

  it("E: missing DATABASE_URL is unknown / safe error", () => {
    const missing = classifyDatabaseUrl(undefined);
    assert.equal(missing.provider, "unknown");
    assert.equal(missing.urlPresent, false);

    const vercelMissing = getDatabaseTargetInfo({ VERCEL: "1" });
    assert.equal(vercelMissing.provider, "unknown");
    assert.equal(vercelMissing.urlPresent, false);
    assert.match(vercelMissing.sourceDescription, /missing/i);
  });

  it("F: malformed URL is unknown / safe", () => {
    const bad = classifyDatabaseUrl("postgresql://[%");
    assert.equal(bad.provider, "unknown");

    const weird = classifyDatabaseUrl("mysql://localhost/db");
    assert.equal(weird.provider, "unknown");
  });

  it("G+H: target description never includes password or full connection URL", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DATABASE_URL:
        "postgresql://op_user:SuperSecretPass99@ep-xyz.neon.tech/neondb?sslmode=require&token=abc",
    };
    const banner = describeDatabaseTarget(env);
    assert.doesNotMatch(banner, /SuperSecretPass99/);
    assert.doesNotMatch(banner, /op_user/);
    assert.doesNotMatch(banner, /token=abc/);
    assert.doesNotMatch(banner, /postgresql:\/\//);
    assert.doesNotMatch(banner, /DATABASE_URL=/);
    assert.match(banner, /Provider: PostgreSQL/);
    assert.match(banner, /ep-xyz\.neon\.tech/);
    assert.match(banner, /neondb/);
    assert.match(banner, /Production operator context: YES/);
  });

  it("I: backfill --apply Production mode fails before write on SQLite", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      DATABASE_URL: "file:./prisma/dev.db",
    };
    assert.throws(() => assertIngredientOperatorWriteTargetSafe(env));

    const script = read("scripts/backfill-recipe-ingredients.ts");
    assert.match(script, /assertIngredientOperatorWriteTargetSafe/);
    assert.match(script, /if \(apply\)/);
    // Target banner + assert before getDb on apply path
    const applyBlock = script.indexOf("if (apply)");
    const getDbCall = script.indexOf("getDb()", applyBlock);
    const assertCall = script.indexOf("assertIngredientOperatorWriteTargetSafe", applyBlock);
    assert.ok(assertCall > -1 && getDbCall > assertCall);
  });

  it("J: seed Production mode fails before write on SQLite", () => {
    const env = {
      INGREDIENT_OPERATOR_PRODUCTION: "1",
      DATABASE_URL: "file:./prisma/dev.db",
      // Without VERCEL, getDb uses local SQLite; Production flag still blocks writes.
    };
    // Non-VERCEL + production flag: getDatabaseTargetInfo is still local SQLite
    const info = getDatabaseTargetInfo(env);
    assert.equal(info.provider, "sqlite");
    assert.throws(() => assertIngredientOperatorWriteTargetSafe(env));

    const script = read("scripts/seed-ingredient-identity.ts");
    assert.match(script, /assertIngredientOperatorWriteTargetSafe/);
    const assertIdx = script.indexOf("assertIngredientOperatorWriteTargetSafe");
    const getDbIdx = script.indexOf("getDb()");
    assert.ok(assertIdx > -1 && getDbIdx > assertIdx);
  });

  it("local SQLite seed remains allowed when Production mode is off", () => {
    const env = { DATABASE_URL: "file:./prisma/dev.db" };
    assert.doesNotThrow(() => assertIngredientOperatorWriteTargetSafe(env));
    assert.equal(getDatabaseTargetInfo(env).provider, "sqlite");
  });

  it("INGREDIENT_OPERATOR_PRODUCTION=1 requires PostgreSQL for writes", () => {
    assert.throws(
      () =>
        assertIngredientOperatorWriteTargetSafe({
          INGREDIENT_OPERATOR_PRODUCTION: "1",
          VERCEL: "1",
          DATABASE_URL: "file:prisma/dev.db",
        }),
    );
    assert.doesNotThrow(() =>
      assertIngredientOperatorWriteTargetSafe({
        INGREDIENT_OPERATOR_PRODUCTION: "1",
        VERCEL: "1",
        DATABASE_URL: "postgresql://u:p@host.neon.tech/neondb",
      }),
    );
  });
});
