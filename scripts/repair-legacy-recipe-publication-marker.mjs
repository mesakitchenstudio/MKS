/**
 * Roadmap #8F-R2 — mark one legacy Published Recipe that lacks durable
 * publication evidence with AdminAuditEvent action
 * `recipe.publication_legacy_marker`.
 *
 * Default: --dry-run (no writes).
 * Apply:   --apply (exactly one insert, after recheck).
 *
 * Requires Production DATABASE_URL via neonctl (never hardcoded).
 * Does NOT create recipe.published, RecipeRevision, Follow, or Notification rows.
 */

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const RECIPE_PUBLISHED_ACTION = "recipe.published";
const RECIPE_PUBLICATION_LEGACY_MARKER_ACTION = "recipe.publication_legacy_marker";
const ENTITY_TYPE_RECIPE = "recipe";
const NEON_PROJECT_ID = "blue-grass-46549615";

const apply = process.argv.includes("--apply");
const dryRun = !apply;

function createRowId() {
  // Prisma uses cuid; random hex id is fine for this one-off audit marker.
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex")}`.slice(0, 25);
}

function productionDatabaseUrl() {
  const fromEnv = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL_PRODUCTION;
  if (fromEnv && fromEnv.startsWith("postgres")) return fromEnv;

  const result = spawnSync(
    "npx",
    ["neonctl", "connection-string", "main", `--project-id=${NEON_PROJECT_ID}`, "--prisma"],
    { encoding: "utf8", shell: true },
  );
  if (result.status !== 0) {
    throw new Error(`neonctl failed: ${(result.stderr || result.stdout || "").slice(0, 400)}`);
  }
  const url = result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("postgres"))
    .pop();
  if (!url) throw new Error("neonctl did not return a postgres connection string");
  return url;
}

async function evidenceCounts(client, recipeId) {
  const publishedAudit = await client.query(
    `SELECT COUNT(*)::int AS n FROM "AdminAuditEvent"
     WHERE "entityType" = $1 AND "entityId" = $2 AND action = $3`,
    [ENTITY_TYPE_RECIPE, recipeId, RECIPE_PUBLISHED_ACTION],
  );
  const legacyMarker = await client.query(
    `SELECT COUNT(*)::int AS n FROM "AdminAuditEvent"
     WHERE "entityType" = $1 AND "entityId" = $2 AND action = $3`,
    [ENTITY_TYPE_RECIPE, recipeId, RECIPE_PUBLICATION_LEGACY_MARKER_ACTION],
  );
  const publishedRevision = await client.query(
    `SELECT COUNT(*)::int AS n FROM "RecipeRevision"
     WHERE "stableRecipeId" = $1 AND reason = 'published'`,
    [recipeId],
  );
  return {
    publishedAudit: publishedAudit.rows[0].n,
    legacyMarker: legacyMarker.rows[0].n,
    publishedRevision: publishedRevision.rows[0].n,
  };
}

function hasDurableEvidence(counts) {
  return counts.publishedAudit > 0 || counts.legacyMarker > 0 || counts.publishedRevision > 0;
}

async function auditCatalogue(client) {
  const recipes = (
    await client.query(
      `SELECT id, title, slug, status, "publishedAt", "createdAt", "updatedAt"
       FROM "Recipe"
       ORDER BY title ASC`,
    )
  ).rows;

  const published = recipes.filter((r) => r.status === "published");
  const drafts = recipes.filter((r) => r.status === "draft");
  const ambiguous = [];

  for (const recipe of published) {
    const counts = await evidenceCounts(client, recipe.id);
    if (!hasDurableEvidence(counts)) {
      ambiguous.push({
        id: recipe.id,
        title: recipe.title,
        slug: recipe.slug,
        ...counts,
      });
    }
  }

  return {
    total: recipes.length,
    publishedCount: published.length,
    draftCount: drafts.length,
    ambiguous,
    drafts: drafts.map((r) => ({ id: r.id, title: r.title, slug: r.slug })),
    recipes,
  };
}

async function main() {
  const mode = dryRun ? "dry-run" : "apply";
  console.log(JSON.stringify({ phase: "8F-R2", mode }, null, 2));

  const url = productionDatabaseUrl();
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const catalogue = await auditCatalogue(client);
    console.log(
      JSON.stringify(
        {
          step: "catalogue",
          totalRecipes: catalogue.total,
          published: catalogue.publishedCount,
          draft: catalogue.draftCount,
          ambiguousPublished: catalogue.ambiguous.length,
          ambiguous: catalogue.ambiguous,
        },
        null,
        2,
      ),
    );

    const expectedId = "cmt72lgsc0066jg5uz2wg21av";
    const expectedTitle = "Chocolate Chunk Cookies";

    // Idempotent --apply after a successful repair: ambiguous is already 0.
    if (catalogue.ambiguous.length === 0 && apply) {
      const cookies = catalogue.recipes.find((r) => r.id === expectedId);
      const counts = cookies ? await evidenceCounts(client, expectedId) : null;
      if (
        cookies &&
        cookies.status === "published" &&
        counts &&
        counts.legacyMarker >= 1
      ) {
        console.log(
          JSON.stringify(
            {
              step: "apply-result",
              created: 0,
              skipped_existing_evidence: 1,
              reason: "Cookies already has durable prior-publication evidence",
              evidence: counts,
            },
            null,
            2,
          ),
        );
        return;
      }
      console.log(
        JSON.stringify(
          {
            step: "stop",
            reason: "no ambiguous Published Recipes and Cookies not skippable",
            cookies: cookies
              ? { id: cookies.id, title: cookies.title, status: cookies.status }
              : null,
            evidence: counts,
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    if (catalogue.ambiguous.length !== 1) {
      console.log(
        JSON.stringify(
          {
            step: "stop",
            reason: "expected exactly 1 ambiguous Published Recipe",
            ambiguousCount: catalogue.ambiguous.length,
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    const target = catalogue.ambiguous[0];
    if (target.id !== expectedId || target.title !== expectedTitle) {
      console.log(
        JSON.stringify(
          {
            step: "stop",
            reason: "ambiguous target is not Chocolate Chunk Cookies",
            target,
            expected: { id: expectedId, title: expectedTitle },
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    console.log(
      JSON.stringify(
        {
          step: "dry-run-target",
          targetCount: 1,
          target: { id: target.id, title: target.title, slug: target.slug },
        },
        null,
        2,
      ),
    );

    // Draft safety snapshot (Donuts / ice cream)
    const draftEvidence = [];
    for (const d of catalogue.drafts) {
      const counts = await evidenceCounts(client, d.id);
      draftEvidence.push({ ...d, ...counts, wouldMarker: false });
    }
    console.log(JSON.stringify({ step: "draft-safety", drafts: draftEvidence }, null, 2));

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            step: "dry-run-complete",
            wouldCreate: 1,
            action: RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
            targetId: target.id,
          },
          null,
          2,
        ),
      );
      return;
    }

    // --- apply path ---
    await client.query("BEGIN");
    try {
      const locked = (
        await client.query(
          `SELECT id, title, slug, status, "publishedAt", "createdAt", "updatedAt"
           FROM "Recipe" WHERE id = $1 FOR UPDATE`,
          [target.id],
        )
      ).rows[0];

      if (!locked) {
        throw new Error("target Recipe missing");
      }
      if (locked.status !== "published") {
        throw new Error(`target status is ${locked.status}, expected published`);
      }

      const pre = await evidenceCounts(client, target.id);
      console.log(
        JSON.stringify(
          {
            step: "pre-apply-recheck",
            status: locked.status,
            publishedAudit: pre.publishedAudit,
            publishedRevision: pre.publishedRevision,
            legacyMarker: pre.legacyMarker,
            publishedAt: locked.publishedAt,
            createdAt: locked.createdAt,
            updatedAt: locked.updatedAt,
            slug: locked.slug,
            title: locked.title,
          },
          null,
          2,
        ),
      );

      if (hasDurableEvidence(pre)) {
        await client.query("ROLLBACK");
        console.log(
          JSON.stringify(
            {
              step: "apply-result",
              created: 0,
              skipped_existing_evidence: 1,
              reason: "durable evidence appeared before insert",
            },
            null,
            2,
          ),
        );
        return;
      }

      const id = createRowId();
      const metadata = JSON.stringify({
        source: "roadmap_8",
        reason: "legacy_publication_safety_backfill",
        syntheticHistoricalMarker: true,
        meaning: "Recipe was already public before follower-notification tracking",
      });

      await client.query(
        `INSERT INTO "AdminAuditEvent" (
          id, "createdAt", "adminId", "actorType", "actorName", "actorEmail", "actorRole",
          action, area, "entityType", "entityId", "entityLabel", "entityPath", metadata
        ) VALUES (
          $1, NOW(), NULL, 'system', 'System', '', 'system',
          $2, 'content', $3, $4, $5, $6, $7
        )`,
        [
          id,
          RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
          ENTITY_TYPE_RECIPE,
          locked.id,
          locked.title,
          `/admin/recipes/${locked.id}`,
          metadata,
        ],
      );

      await client.query("COMMIT");

      const after = await evidenceCounts(client, target.id);
      const recipeAfter = (
        await client.query(
          `SELECT id, title, slug, status, "publishedAt", "createdAt", "updatedAt"
           FROM "Recipe" WHERE id = $1`,
          [target.id],
        )
      ).rows[0];

      const revisionCreated = (
        await client.query(
          `SELECT COUNT(*)::int AS n FROM "RecipeRevision"
           WHERE "stableRecipeId" = $1 AND "createdAt" > NOW() - INTERVAL '2 minutes'`,
          [target.id],
        )
      ).rows[0].n;

      const publishedCreated = (
        await client.query(
          `SELECT COUNT(*)::int AS n FROM "AdminAuditEvent"
           WHERE "entityType" = $1 AND "entityId" = $2 AND action = $3
             AND "createdAt" > NOW() - INTERVAL '2 minutes'`,
          [ENTITY_TYPE_RECIPE, target.id, RECIPE_PUBLISHED_ACTION],
        )
      ).rows[0].n;

      console.log(
        JSON.stringify(
          {
            step: "apply-result",
            created: 1,
            skipped_existing_evidence: 0,
            transaction: "success",
            markerId: id,
            evidence: after,
            recipe: recipeAfter,
            recipeRevisionCreatedRecently: revisionCreated,
            recipePublishedEventCreatedRecently: publishedCreated,
            recipeUnchanged:
              String(recipeAfter.publishedAt) === String(locked.publishedAt) &&
              String(recipeAfter.createdAt) === String(locked.createdAt) &&
              recipeAfter.status === locked.status &&
              recipeAfter.slug === locked.slug,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      console.log(
        JSON.stringify(
          {
            step: "apply-result",
            created: 0,
            transaction: "failure",
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    // Post-apply full audit
    const post = await auditCatalogue(client);
    console.log(
      JSON.stringify(
        {
          step: "post-apply-audit",
          totalRecipes: post.total,
          published: post.publishedCount,
          draft: post.draftCount,
          ambiguousPublished: post.ambiguous.length,
          ambiguous: post.ambiguous,
        },
        null,
        2,
      ),
    );

    const cookies = await evidenceCounts(client, expectedId);
    console.log(
      JSON.stringify(
        {
          step: "cookies-evidence",
          recipeId: expectedId,
          ...cookies,
          priorPublicationSemantic: hasDurableEvidence(cookies),
        },
        null,
        2,
      ),
    );

    if (post.ambiguous.length !== 0) {
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
