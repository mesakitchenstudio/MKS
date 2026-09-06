import type { PrismaClient } from "@prisma/client";
import { getStaffByEmail } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { validateNewsletterEmail } from "@/lib/newsletter";
import { isActiveNewsletterStatus } from "@/lib/newsletter-unsubscribe";

export const FORMER_MEMBER_DISPLAY_NAME = "Former member";

type DbLike = Pick<PrismaClient, "user" | "recipeReview" | "recipeSave" | "userConnection" | "memberPresenceSession" | "newsletterSubscriber" | "passwordReset">;

/** Opaque placeholder so @@unique([recipeSlug, authorEmail]) stays valid without PII. */
export function anonymizedReviewEmail(reviewId: string) {
  return `deleted+${reviewId}@invalid.local`;
}

export type DeleteMemberAccountResult =
  | { ok: true; alreadyDeleted?: boolean }
  | { ok: false; reason: "staff" | "invalid_email" | "failed"; message: string };

/**
 * Permanently deletes the authenticated member's User row and private data.
 * Session email must be derived server-side — never trust client identity.
 */
export async function deleteMemberAccount(
  sessionEmail: string,
): Promise<DeleteMemberAccountResult> {
  const validated = validateNewsletterEmail(sessionEmail);
  if (!validated.ok) {
    return { ok: false, reason: "invalid_email", message: "Could not verify your account." };
  }
  const email = validated.email;

  if (await getStaffByEmail(email)) {
    return {
      ok: false,
      reason: "staff",
      message: "Studio admin accounts cannot be deleted from the public profile.",
    };
  }

  const db = getDb();

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      await unsubscribeEmailInDb(db, email);
      await db.passwordReset.deleteMany({ where: { email, kind: "member" } });
      return { ok: true, alreadyDeleted: true };
    }

    const userId = existing.id;

    await db.$transaction(async (tx) => {
      const live = await tx.user.findUnique({ where: { id: userId } });
      if (!live) return;

      const reviews = await tx.recipeReview.findMany({
        where: { userId },
        select: { id: true },
      });
      for (const review of reviews) {
        await tx.recipeReview.update({
          where: { id: review.id },
          data: {
            userId: null,
            authorName: FORMER_MEMBER_DISPLAY_NAME,
            authorEmail: anonymizedReviewEmail(review.id),
          },
        });
      }

      await tx.recipeSave.deleteMany({ where: { userId } });
      await tx.userConnection.deleteMany({ where: { userId } });
      await tx.memberPresenceSession.deleteMany({ where: { userId } });

      await unsubscribeEmailInDb(tx, email);
      await tx.passwordReset.deleteMany({ where: { email, kind: "member" } });
      await tx.user.delete({ where: { id: userId } });
    });

    return { ok: true };
  } catch (error) {
    console.error("Member account deletion failed", error);
    return {
      ok: false,
      reason: "failed",
      message: "We couldn't delete your account. Please try again.",
    };
  }
}

async function unsubscribeEmailInDb(db: DbLike, email: string) {
  const row = await db.newsletterSubscriber.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (!row) return;
  if (!isActiveNewsletterStatus(row.status)) return;
  await db.newsletterSubscriber.update({
    where: { id: row.id },
    data: {
      status: "unsubscribed",
      unsubscribedAt: new Date(),
    },
  });
}

export function isAccountDeleteConfirmation(value: string) {
  return value.trim() === "DELETE";
}
