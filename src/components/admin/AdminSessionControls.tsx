"use client";

import { useEffect, useId, useRef, useState } from "react";
import { adminFocusRing } from "@/lib/admin-ui";

function DeviceIcon({ deviceType }: { deviceType: string }) {
  const kind = deviceType.toLowerCase();
  const isPhone = kind.includes("iphone") || kind === "android";
  const isTablet = kind.includes("ipad");
  return (
    <span
      className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line bg-cream/60 text-muted"
      aria-hidden
    >
      {isPhone ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 18h2" />
        </svg>
      ) : isTablet ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M11 18h2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      )}
    </span>
  );
}

export type AdminSessionRowView = {
  sessionTokenId: string;
  primary: string;
  secondary: string;
  activityLabel: string;
  location: string;
  isCurrent: boolean;
  deviceType: string;
};

function RevokeConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onCancel,
  action,
  hiddenFields,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  onCancel: () => void;
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md border border-line bg-paper p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="font-serif text-2xl text-ink">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        <form action={action} className="mt-6 flex flex-wrap items-center gap-3">
          {hiddenFields
            ? Object.entries(hiddenFields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))
            : null}
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={`min-h-11 rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`min-h-11 rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark ${adminFocusRing}`}
          >
            {confirmLabel}
          </button>
        </form>
        <p className="sr-only" aria-live="polite">
          {pendingLabel}
        </p>
      </div>
    </div>
  );
}

export function AdminSessionList({
  sessions,
  revokeAction,
  emptyCopy,
}: {
  sessions: AdminSessionRowView[];
  revokeAction: (formData: FormData) => void | Promise<void>;
  emptyCopy: string;
}) {
  const [pendingTokenId, setPendingTokenId] = useState<string | null>(null);
  const pending = sessions.find((s) => s.sessionTokenId === pendingTokenId);

  if (!sessions.length) {
    return <p className="mt-4 text-sm leading-6 text-muted">{emptyCopy}</p>;
  }

  return (
    <>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {sessions.map((session) => (
          <li
            key={session.sessionTokenId}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div className="flex min-w-0 gap-3">
              <DeviceIcon deviceType={session.deviceType} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{session.primary}</p>
                <p className="mt-0.5 text-sm text-muted">{session.secondary}</p>
                <p className="mt-2 text-sm text-muted">{session.activityLabel}</p>
                <p className="mt-0.5 text-sm text-muted">{session.location}</p>
                {session.isCurrent ? (
                  <p className="mt-2 text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-olive">
                    Current session
                  </p>
                ) : null}
              </div>
            </div>
            {!session.isCurrent ? (
              <button
                type="button"
                className={`min-h-11 shrink-0 self-start rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-terracotta hover:text-terracotta ${adminFocusRing}`}
                aria-label={`Revoke ${session.primary} session`}
                onClick={() => setPendingTokenId(session.sessionTokenId)}
              >
                Revoke
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <RevokeConfirmDialog
        open={Boolean(pending)}
        title="Revoke this session?"
        description="This device will be signed out of Mesa Studio and will need to authenticate again."
        confirmLabel="Revoke session"
        pendingLabel="Confirm revoke session"
        onCancel={() => setPendingTokenId(null)}
        action={revokeAction}
        hiddenFields={
          pending ? { sessionTokenId: pending.sessionTokenId } : undefined
        }
      />
    </>
  );
}

export function AdminRevokeAllOtherButton({
  action,
  disabled,
}: {
  action: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-8 border-t border-line pt-6">
      <p className="text-sm leading-6 text-muted">
        Sign out your Mesa Studio account everywhere except this device.
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`mt-3 min-h-11 rounded-full border border-line px-5 text-sm font-semibold text-ink hover:border-terracotta hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-50 ${adminFocusRing}`}
      >
        Revoke all other sessions
      </button>
      <RevokeConfirmDialog
        open={open}
        title="Revoke all other sessions?"
        description="Every other device signed in to your Mesa Studio account will be signed out. This device stays signed in."
        confirmLabel="Revoke other sessions"
        pendingLabel="Confirm revoke other sessions"
        onCancel={() => setOpen(false)}
        action={action}
      />
    </div>
  );
}

export function AdminRevokeStaffSessionsButton({
  subjectKey,
  staffName,
  action,
}: {
  subjectKey: string;
  staffName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-3 min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-terracotta hover:text-terracotta ${adminFocusRing}`}
      >
        Revoke all sessions for {staffName}
      </button>
      <RevokeConfirmDialog
        open={open}
        title={`Revoke all sessions for ${staffName}?`}
        description={`${staffName} will be signed out of Mesa Studio on every device and will need to authenticate again.`}
        confirmLabel="Revoke all sessions"
        pendingLabel="Confirm revoke staff sessions"
        onCancel={() => setOpen(false)}
        action={action}
        hiddenFields={{ subjectKey }}
      />
    </>
  );
}
