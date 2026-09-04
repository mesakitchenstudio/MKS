"use client";

import { RemoveReplyButton } from "@/components/admin/RemoveReplyButton";
import { formatAdminDate } from "@/lib/datetime";
import { formatAdminReplyAuthorDisplay } from "@/lib/recipe-reviews";

type Reply = {
  id: string;
  authorName: string;
  authorTitle?: string;
  authorPhotoUrl?: string;
  body: string;
  isStaff: boolean;
  createdAt: Date | string;
};

function ReplyAvatar({
  name,
  photoUrl,
  staff,
}: {
  name: string;
  photoUrl?: string;
  staff: boolean;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
        staff ? "bg-olive text-paper" : "bg-sand text-ink"
      }`}
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

/** Always shows existing replies under a review for Admin → Reviews. */
export function ReviewRepliesSection({ replies, count }: { replies: Reply[]; count: number }) {
  const total = count || replies.length;
  if (total <= 0) return null;

  return (
    <div className="mt-5">
      {total > 1 ? (
        <p className="mb-2 text-xs text-muted">
          {total} {total === 1 ? "reply" : "replies"}
        </p>
      ) : null}
      <ul className="space-y-0 border-l-2 border-line/80 pl-4 sm:pl-5 md:pl-6">
        {replies.map((reply) => {
          const display = formatAdminReplyAuthorDisplay({
            authorName: reply.authorName,
            authorTitle: reply.authorTitle,
            isStaff: reply.isStaff,
          });
          const avatarName = display.primary;

          return (
            <li key={reply.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-start gap-3">
                <ReplyAvatar
                  name={avatarName}
                  photoUrl={reply.authorPhotoUrl}
                  staff={reply.isStaff}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{display.primary}</p>
                      {display.secondary ? (
                        <p className="text-xs text-muted">{display.secondary}</p>
                      ) : reply.isStaff && !reply.authorTitle?.trim() ? (
                        <p className="text-xs text-muted">Staff</p>
                      ) : null}
                    </div>
                    <RemoveReplyButton
                      id={reply.id}
                      authorName={display.primary || reply.authorName}
                    />
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                    {reply.body}
                  </p>
                  <p className="mt-1 text-xs text-muted">{formatAdminDate(reply.createdAt)}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
