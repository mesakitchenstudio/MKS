"use client";

import { RemoveReplyButton } from "@/components/admin/RemoveReplyButton";
import { formatAdminDate } from "@/lib/datetime";

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

/** Always shows existing replies under a review for Admin → Reviews moderation. */
export function ReviewRepliesSection({ replies, count }: { replies: Reply[]; count: number }) {
  const total = count || replies.length;
  if (total <= 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-semibold text-ink">
          Conversation
          <span className="ml-2 font-normal text-muted">· {total}</span>
        </p>
      <ul className="mt-3 divide-y divide-line border border-line">
        {replies.map((reply) => {
          const title = reply.authorTitle?.trim();
          const label = title ? `${reply.authorName} · ${title}` : reply.authorName;
          return (
            <li key={reply.id} className="px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-1 gap-3">
                  <ReplyAvatar
                    name={reply.authorName}
                    photoUrl={reply.authorPhotoUrl}
                    staff={reply.isStaff}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {label}
                      {reply.isStaff && !title ? (
                        <span className="font-normal text-muted"> · Staff</span>
                      ) : null}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
                      {reply.body}
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatAdminDate(reply.createdAt)}</p>
                  </div>
                </div>
                <RemoveReplyButton id={reply.id} authorName={reply.authorName} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
