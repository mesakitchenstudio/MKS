"use client";

import { useEffect, useId, useState } from "react";
import { AdminPhotoField } from "@/components/admin/AdminPhotoField";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { ACCESS_LEVELS, accessLabel } from "@/lib/admin-access";
import { MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/admin-staff";
import { adminFocusRing } from "@/lib/admin-ui";
import { displayInitials } from "@/lib/display-initials";
import {
  STAFF_SAVED_PARAMS,
  useTransientSavedFlag,
} from "@/lib/admin-transient-feedback";
import { deleteAdminAction, saveAdminAction } from "@/app/admin/actions";

const fieldClass =
  "mt-1.5 w-full rounded-sm border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition focus:border-terracotta";

const noticeOk = "mt-4 border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-olive-dark";
const noticeErr = "mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta-dark";

export type StaffTeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  photoUrl: string;
  lastLoginLabel: string;
  isYou: boolean;
  lockOwnerRole: boolean;
  canRemove: boolean;
  /** Legacy row that reused ADMIN_EMAIL — Owner should change this email. */
  reservedEmailConflict?: boolean;
  noticeOk?: string;
  noticeErr?: string;
  initiallyOpen?: boolean;
};

export function StaffTeamList({ members }: { members: StaffTeamMember[] }) {
  const initiallyOpenId = members.find((member) => member.initiallyOpen)?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(initiallyOpenId);
  const [trackedOpenId, setTrackedOpenId] = useState(initiallyOpenId);
  if (initiallyOpenId !== trackedOpenId) {
    setTrackedOpenId(initiallyOpenId);
    if (initiallyOpenId) setOpenId(initiallyOpenId);
  }

  return (
    <ul className="mt-5 divide-y divide-line/80 border-t border-line/80">
      {members.map((member) => (
        <StaffTeamMemberRow
          key={member.id}
          member={member}
          open={openId === member.id}
          onToggle={() => setOpenId((current) => (current === member.id ? null : member.id))}
        />
      ))}
    </ul>
  );
}

function StaffTeamMemberRow({
  member,
  open,
  onToggle,
}: {
  member: StaffTeamMember;
  open: boolean;
  onToggle: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const titleId = useId();
  const passwordHelpId = useId();
  const panelId = `staff-editor-${member.id}`;
  const showSaved = useTransientSavedFlag(Boolean(member.noticeOk), STAFF_SAVED_PARAMS);
  const initials = displayInitials(member.name) || "?";

  useEffect(() => {
    if (!confirmRemove) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmRemove(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmRemove]);

  return (
    <li id={`admin-${member.id}`} className="list-none">
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sand text-sm font-semibold text-ink">
            {member.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="font-semibold text-ink">{member.name}</p>
              {member.isYou ? <span className="text-xs text-muted">You</span> : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">{member.email}</p>
            {member.reservedEmailConflict ? (
              <p className="mt-2 text-sm leading-5 text-terracotta-dark">
                This email belongs to the System Owner. Change it to a unique address for this team
                member.
              </p>
            ) : null}
            <p className="mt-2 text-sm text-muted sm:hidden">
              <span className="text-ink">{accessLabel(member.role)}</span>
              <span aria-hidden> · </span>
              Last login {member.lastLoginLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? `Close editing ${member.name}` : `Edit ${member.name}`}
            className={`inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-ink transition-colors hover:text-terracotta sm:hidden ${adminFocusRing}`}
          >
            {open ? "Close" : "Edit"}
          </button>
        </div>

        <div className="hidden min-w-0 items-center gap-6 sm:flex sm:shrink-0">
          <p className="w-20 text-sm text-ink">{accessLabel(member.role)}</p>
          <p className="min-w-[11rem] text-xs text-muted">Last login {member.lastLoginLabel}</p>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? `Close editing ${member.name}` : `Edit ${member.name}`}
            className={`inline-flex min-h-9 items-center text-sm font-semibold text-ink transition-colors hover:text-terracotta ${adminFocusRing}`}
          >
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {open ? (
        <div id={panelId} className="border-y border-line/80 bg-cream/30">
          {showSaved && member.noticeOk ? (
            <p className={`mx-5 ${noticeOk}`}>{member.noticeOk}</p>
          ) : null}
          {member.noticeErr ? <p className={`mx-5 ${noticeErr}`}>{member.noticeErr}</p> : null}

          <form action={saveAdminAction} className="grid gap-4 p-5 md:grid-cols-2">
            <input type="hidden" name="id" value={member.id} />
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-ink">Profile photo</p>
              <div className="mt-2">
                <AdminPhotoField
                  defaultValue={member.photoUrl || ""}
                  actorName={member.name}
                />
              </div>
            </div>
            <label className="grid text-sm font-semibold text-ink">
              Full name
              <input name="name" defaultValue={member.name} required className={fieldClass} />
            </label>
            <label className="grid text-sm font-semibold text-ink">
              Email
              <input
                name="email"
                type="email"
                defaultValue={member.email}
                required
                className={fieldClass}
              />
            </label>
            <label className="grid text-sm font-semibold text-ink">
              New password
              <input
                name="password"
                type="password"
                minLength={MIN_ADMIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-describedby={passwordHelpId}
                className={fieldClass}
              />
              <span id={passwordHelpId} className="mt-1.5 text-xs font-normal text-muted">
                Leave blank to keep current.
              </span>
            </label>
            {member.lockOwnerRole ? (
              <div className="grid text-sm font-semibold text-ink">
                Access level
                <input type="hidden" name="role" value="owner" />
                <p className={`${fieldClass} cursor-not-allowed opacity-70`} aria-disabled="true">
                  Owner
                </p>
                <p className="mt-1.5 text-xs font-normal text-muted">
                  Your owner access cannot be changed while signed in.
                </p>
              </div>
            ) : (
              <label className="grid text-sm font-semibold text-ink">
                Access level
                <select name="role" defaultValue={member.role} className={fieldClass}>
                  {ACCESS_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <PendingSubmitButton
                pendingLabel="Saving…"
                className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
              >
                Save changes
              </PendingSubmitButton>
              {member.isYou ? (
                <span className="text-sm text-muted">You cannot remove your own account.</span>
              ) : member.canRemove ? (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className={`inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-muted hover:border-terracotta hover:text-terracotta ${adminFocusRing}`}
                >
                  Remove
                </button>
              ) : (
                <span className="text-sm text-muted">Mesa must keep at least one owner.</span>
              )}
            </div>
          </form>
        </div>
      ) : null}

      {confirmRemove ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setConfirmRemove(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={titleId} className="font-serif text-2xl text-ink">
              Remove {member.name} from Mesa admin?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              They will no longer be able to access the admin area.
            </p>
            <form action={deleteAdminAction} className="mt-6 flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={member.id} />
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <PendingSubmitButton
                pendingLabel="Removing…"
                className="rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
              >
                Remove admin
              </PendingSubmitButton>
            </form>
          </div>
        </div>
      ) : null}
    </li>
  );
}
