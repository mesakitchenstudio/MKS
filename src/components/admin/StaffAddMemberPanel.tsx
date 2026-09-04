"use client";

import { useState, type ReactNode } from "react";
import { AdminPhotoField } from "@/components/admin/AdminPhotoField";
import { PendingSubmitButton } from "@/components/admin/PendingSubmitButton";
import { ACCESS_LEVELS } from "@/lib/admin-access";
import { MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/admin-staff";
import { adminFocusRing } from "@/lib/admin-ui";
import {
  STAFF_CREATED_PARAMS,
  useTransientSavedFlag,
} from "@/lib/admin-transient-feedback";
import { saveAdminAction } from "@/app/admin/actions";

const fieldClass =
  "mt-1.5 w-full rounded-sm border border-line bg-cream px-3 py-2.5 text-sm text-ink outline-none transition focus:border-terracotta";

const noticeOk = "mt-4 border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-olive-dark";
const noticeErr = "mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta-dark";

export function StaffTeamSection({
  countLabel,
  created,
  errorMessage,
  children,
}: {
  countLabel: string;
  created?: boolean;
  errorMessage?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(created || errorMessage));
  const showCreated = useTransientSavedFlag(Boolean(created), STAFF_CREATED_PARAMS);
  const shouldForceOpen = Boolean(created || errorMessage);
  const [wasForcedOpen, setWasForcedOpen] = useState(shouldForceOpen);
  if (shouldForceOpen !== wasForcedOpen) {
    setWasForcedOpen(shouldForceOpen);
    if (shouldForceOpen) setOpen(true);
  }

  return (
    <section className="mt-8" aria-labelledby="team-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <h2 id="team-heading" className="font-serif text-2xl text-ink">
            Team
          </h2>
          <p className="mt-1 text-sm text-muted">{countLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="staff-add-member"
          className={`inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:border-terracotta hover:text-terracotta sm:min-h-9 ${adminFocusRing}`}
        >
          {open ? "Close" : "Add team member"}
        </button>
      </div>

      {open ? (
        <div id="staff-add-member" className="mt-5 border border-line bg-paper">
          <div className="border-b border-line bg-cream px-5 py-4">
            <h3 className="font-serif text-xl text-ink">Add team member</h3>
            <p className="mt-1 text-sm text-muted">
              Create a Mesa admin account and choose what they can access.
            </p>
          </div>
          {showCreated ? <p className={`mx-5 ${noticeOk}`}>Admin account created.</p> : null}
          {errorMessage ? <p className={`mx-5 ${noticeErr}`}>{errorMessage}</p> : null}
          <form action={saveAdminAction} className="grid gap-4 p-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-ink">Profile photo</p>
              <div className="mt-2">
                <AdminPhotoField />
              </div>
            </div>
            <label className="grid text-sm font-semibold text-ink">
              Full name
              <input name="name" required autoComplete="name" className={fieldClass} />
            </label>
            <label className="grid text-sm font-semibold text-ink">
              Email
              <input name="email" type="email" required autoComplete="email" className={fieldClass} />
            </label>
            <label className="grid text-sm font-semibold text-ink">
              Password
              <input
                name="password"
                type="password"
                minLength={MIN_ADMIN_PASSWORD_LENGTH}
                required
                autoComplete="new-password"
                placeholder={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters`}
                className={fieldClass}
              />
            </label>
            <label className="grid text-sm font-semibold text-ink">
              Access level
              <select name="role" defaultValue="editor" className={fieldClass}>
                {ACCESS_LEVELS.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-2">
              <PendingSubmitButton
                pendingLabel="Adding…"
                className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:hover:bg-terracotta"
              >
                Add admin
              </PendingSubmitButton>
            </div>
          </form>
        </div>
      ) : null}

      {children}
    </section>
  );
}
