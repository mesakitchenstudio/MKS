"use client";

import { useId, useState } from "react";
import { RemoveReplyButton } from "@/components/admin/RemoveReplyButton";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { formatAdminDate } from "@/lib/datetime";

type Reply = {
  id: string;
  authorName: string;
  body: string;
  isStaff: boolean;
  createdAt: Date | string;
};

export function ReviewRepliesSection({ replies, count }: { replies: Reply[]; count: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const total = count || replies.length;
  if (total <= 0) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-semibold text-ink">
          Replies
          <span className="ml-2 font-normal text-muted">· {total}</span>
        </p>
        <button
          type="button"
          className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide replies" : "Show replies"}
        </button>
      </div>

      {open ? (
        <ul id={panelId} className="mt-3 divide-y divide-line border border-line">
          {replies.map((reply) => (
            <li key={reply.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {reply.authorName}
                    {reply.isStaff ? (
                      <span className="font-normal text-muted"> · Staff</span>
                    ) : null}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink/90">
                    {reply.body}
                  </p>
                  <p className="mt-1 text-xs text-muted">{formatAdminDate(reply.createdAt)}</p>
                </div>
                <RemoveReplyButton id={reply.id} authorName={reply.authorName} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
