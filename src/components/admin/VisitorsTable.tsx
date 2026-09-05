"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { adminFocusRing } from "@/lib/admin-ui";
import { formatAdminShortDateTime } from "@/lib/datetime";
import type { GuestVisitorAdminListRow } from "@/lib/guest-analytics";
import { GUEST_ADMIN_PRESENCE_POLL_MS } from "@/lib/guest-tracking";
import { deleteGuestVisitorsAction } from "@/app/admin/actions";

type PresenceSnap = { id: string; online: boolean; lastSeenAt: string };

function GuestKindBadge({ kind, label }: { kind: string; label: string }) {
  if (kind === "human") return null;
  return (
    <span className="inline-flex rounded-full bg-sand px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink">
      {label}
    </span>
  );
}

function PagePair({
  landingPath,
  landingTitle,
  lastPath,
  lastPathTitle,
}: {
  landingPath: string;
  landingTitle: string;
  lastPath: string;
  lastPathTitle: string;
}) {
  const same = Boolean(landingPath && lastPath && landingPath === lastPath);
  if (!landingPath && !lastPath) return <span className="text-muted">—</span>;

  if (same || !landingPath) {
    const title = lastPathTitle || landingTitle || lastPath || landingPath || "—";
    const path = lastPath || landingPath;
    return (
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        {path ? (
          <p className="mt-0.5 break-all font-mono text-[0.65rem] text-muted">{path}</p>
        ) : null}
      </div>
    );
  }

  const landTitle = landingTitle || landingPath;
  const endTitle = lastPathTitle || lastPath || "—";
  const showPaths = landingPath !== lastPath;

  return (
    <div className="min-w-0">
      <p className="font-semibold text-ink">
        {landTitle}
        <span className="mx-1.5 font-normal text-muted" aria-hidden>
          →
        </span>
        {endTitle}
      </p>
      {showPaths ? (
        <p className="mt-0.5 break-all font-mono text-[0.65rem] text-muted">
          {landingPath}
          <span className="mx-1" aria-hidden>
            →
          </span>
          {lastPath || "—"}
        </p>
      ) : null}
    </div>
  );
}

export function VisitorsTable({
  visitors,
  canDelete = false,
  selectMode = false,
  onSelectModeChange,
}: {
  visitors: GuestVisitorAdminListRow[];
  canDelete?: boolean;
  /** When provided with onSelectModeChange, selection mode is controlled by the parent. */
  selectMode?: boolean;
  onSelectModeChange?: (next: boolean) => void;
}) {
  const [presenceById, setPresenceById] = useState<Record<string, PresenceSnap>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [internalSelectMode, setInternalSelectMode] = useState(false);
  const [bulkPending, startBulk] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  const controlled = typeof onSelectModeChange === "function";
  const activeSelectMode = controlled ? selectMode : internalSelectMode;

  // Reset row selection whenever selection mode turns on/off (incl. parent Cancel).
  const [selectionModeSnapshot, setSelectionModeSnapshot] = useState(activeSelectMode);
  if (selectionModeSnapshot !== activeSelectMode) {
    setSelectionModeSnapshot(activeSelectMode);
    setSelectedIds(new Set());
    setBulkError(null);
  }

  function setSelectMode(next: boolean) {
    if (controlled) onSelectModeChange(next);
    else setInternalSelectMode(next);
  }
  const refreshPresence = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/visitors/presence", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        visitors?: PresenceSnap[];
        guests?: PresenceSnap[];
      };
      const rows = Array.isArray(data.visitors)
        ? data.visitors
        : Array.isArray(data.guests)
          ? data.guests
          : null;
      if (!rows) return;
      setPresenceById((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          next[row.id] = row;
        }
        return next;
      });
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshPresence();
    }, GUEST_ADMIN_PRESENCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshPresence]);

  const rows = useMemo(
    () =>
      visitors.map((guest) => {
        const snap = presenceById[guest.id];
        return {
          ...guest,
          online: snap?.online ?? guest.online,
          lastSeenAt: snap?.lastSeenAt ?? guest.lastSeenAt,
        };
      }),
    [visitors, presenceById],
  );

  const visibleIds = rows.map((row) => row.id);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelectedIds(checked ? new Set(visibleIds) : new Set());
  }

  function handleBulkDelete() {
    if (!canDelete || bulkPending || selectedCount === 0) return;
    const countLabel = String(selectedCount);
    if (
      !window.confirm(
        `Permanently delete ${countLabel} selected visitor${selectedCount === 1 ? "" : "s"} and their associated visitor data? This cannot be undone.`,
      )
    ) {
      return;
    }
    const ids = [...selectedIds];
    setBulkError(null);
    startBulk(async () => {
      const result = await deleteGuestVisitorsAction(ids);
      if (!result.ok) {
        setBulkError(
          result.error === "forbidden"
            ? "Not allowed."
            : result.error || "Delete failed.",
        );
        return;
      }
      window.location.reload();
    });
  }

  if (rows.length === 0) {
    return (
      <p className="border border-dashed border-line bg-paper px-4 py-10 text-sm text-muted">
        No visitors match these filters.
      </p>
    );
  }

  const showSelectionChrome = canDelete && activeSelectMode;

  return (
    <div className="space-y-3">
      {!controlled && canDelete ? (
        <div className="flex flex-wrap items-center gap-3">
          {!activeSelectMode ? (
            <button
              type="button"
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-ink transition-colors hover:text-terracotta sm:min-h-9 ${adminFocusRing}`}
              onClick={() => setSelectMode(true)}
            >
              Select visitors
            </button>
          ) : (
            <button
              type="button"
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-muted transition-colors hover:text-ink sm:min-h-9 ${adminFocusRing}`}
              onClick={() => setSelectMode(false)}
            >
              Cancel selection
            </button>
          )}
        </div>
      ) : null}

      {showSelectionChrome ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          role="status"
        >
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-ink sm:min-h-9">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => togglePage(event.target.checked)}
              aria-label="Select page"
            />
            <span className="font-semibold">Select page</span>
          </label>
          {selectedCount > 0 ? (
            <>
              <span className="text-muted">{selectedCount} selected</span>
              <button
                type="button"
                disabled={bulkPending}
                onClick={handleBulkDelete}
                className={`inline-flex min-h-11 items-center font-semibold text-terracotta transition-colors hover:text-terracotta-dark disabled:opacity-60 sm:min-h-9 ${adminFocusRing}`}
                aria-label={`Delete ${selectedCount} selected visitor${selectedCount === 1 ? "" : "s"}`}
              >
                {bulkPending ? "Deleting…" : "Delete selected"}
              </button>
            </>
          ) : (
            <span className="text-muted">Select visitors on this page</span>
          )}
          {bulkError ? <p className="w-full text-sm text-terracotta">{bulkError}</p> : null}
        </div>
      ) : null}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border border-line bg-paper md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line bg-cream/40 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
            <tr>
              {showSelectionChrome ? (
                <th scope="col" className="w-10 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
              ) : null}
              <th scope="col" className="px-3 py-3">
                Visitor
              </th>
              <th scope="col" className="px-3 py-3">
                Source
              </th>
              <th scope="col" className="px-3 py-3">
                Landing / last page
              </th>
              <th scope="col" className="px-3 py-3">
                Last seen
              </th>
              <th scope="col" className="px-3 py-3">
                Approx. location
              </th>
              <th scope="col" className="px-3 py-3">
                Device
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((guest) => {
              const short = guest.visitorKey.slice(0, 8);
              return (
                <tr key={guest.id} className="align-top">
                  {showSelectionChrome ? (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedIds.has(guest.id)}
                        onChange={(event) => toggleOne(guest.id, event.target.checked)}
                        aria-label={`Select visitor ${short}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <PresenceDot online={guest.online} />
                      <Link
                        href={`/admin/visitors/${guest.id}`}
                        className={`font-mono font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
                      >
                        {short}
                      </Link>
                      <GuestKindBadge kind={guest.kind} label={guest.kindLabel} />
                      {guest.returning ? (
                        <span className="text-[0.65rem] uppercase tracking-wide text-muted">
                          Returning
                        </span>
                      ) : (
                        <span className="text-[0.65rem] uppercase tracking-wide text-muted">New</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      <span className="sr-only">Status: </span>
                      {guest.online ? "Online" : "Offline"}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-muted">{guest.sourceLabel}</td>
                  <td className="px-3 py-3">
                    <PagePair
                      landingPath={guest.landingPath}
                      landingTitle={guest.landingTitle}
                      lastPath={guest.lastPath}
                      lastPathTitle={guest.lastPathTitle}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">
                    {formatAdminShortDateTime(guest.lastSeenAt, new Date(), { includeYear: true })}
                  </td>
                  <td className="px-3 py-3 text-muted">{guest.location || "—"}</td>
                  <td className="px-3 py-3 text-muted">{guest.device || "—"}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/visitors/${guest.id}`}
                      className={`font-semibold text-terracotta hover:underline ${adminFocusRing}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {rows.map((guest) => {
          const short = guest.visitorKey.slice(0, 8);
          return (
            <li key={guest.id} className="border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {showSelectionChrome ? (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={selectedIds.has(guest.id)}
                      onChange={(event) => toggleOne(guest.id, event.target.checked)}
                      aria-label={`Select visitor ${short}`}
                    />
                  ) : null}
                  <PresenceDot online={guest.online} />
                  <Link
                    href={`/admin/visitors/${guest.id}`}
                    className={`font-mono font-semibold text-ink ${adminFocusRing}`}
                  >
                    {short}
                  </Link>
                  <GuestKindBadge kind={guest.kind} label={guest.kindLabel} />
                </div>
                <Link
                  href={`/admin/visitors/${guest.id}`}
                  className={`shrink-0 text-sm font-semibold text-terracotta ${adminFocusRing}`}
                >
                  View
                </Link>
              </div>
              <p className="mt-3 text-sm text-muted">
                {guest.sourceLabel}
                <span aria-hidden> · </span>
                {guest.online ? "Online" : "Offline"}
                <span aria-hidden> · </span>
                {guest.returning ? "Returning" : "New"}
              </p>
              <div className="mt-3">
                <PagePair
                  landingPath={guest.landingPath}
                  landingTitle={guest.landingTitle}
                  lastPath={guest.lastPath}
                  lastPathTitle={guest.lastPathTitle}
                />
              </div>
              <p className="mt-3 text-xs text-muted">
                {formatAdminShortDateTime(guest.lastSeenAt, new Date(), { includeYear: true })}
                {guest.location ? ` · ${guest.location}` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Owner-only Select visitors / Cancel selection — same left-aligned pattern as Reviews. */
export function VisitorsSelectModeToggle({
  canDelete,
  selectMode,
  onSelectModeChange,
}: {
  canDelete: boolean;
  selectMode: boolean;
  onSelectModeChange: (next: boolean) => void;
}) {
  if (!canDelete) return null;
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center text-sm font-semibold transition-colors sm:min-h-9 ${adminFocusRing} ${
        selectMode
          ? "text-muted hover:text-ink"
          : "text-ink hover:text-terracotta"
      }`}
      onClick={() => onSelectModeChange(!selectMode)}
      aria-pressed={selectMode}
    >
      {selectMode ? "Cancel selection" : "Select visitors"}
    </button>
  );
}
