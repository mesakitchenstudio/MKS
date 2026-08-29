"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteGuestVisitorsAction } from "@/app/admin/actions";
import { PresenceDot } from "@/components/admin/MemberPresence";
import { RemoveGuestVisitorButton } from "@/components/admin/RemoveGuestVisitorButton";
import { adminFocusRing, adminLinkClass, adminTableHeadClass } from "@/lib/admin-ui";
import { formatAdminShortDateTime } from "@/lib/datetime";
import { classifyGuestClient, guestDeviceClientLabel, isBotUserAgent } from "@/lib/guest-client";
import { guestPathTitle } from "@/lib/guest-path-labels";
import {
  formatGuestPresenceLabel,
  GUEST_ADMIN_PRESENCE_POLL_MS,
  isGuestOnlineFromPresence,
} from "@/lib/guest-tracking";
import { formatCountryCityLocation } from "@/lib/request-meta";

type GuestRow = {
  id: string;
  visitorKey: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  lastPath: string;
  userAgent: string;
  country?: string | null;
  city?: string | null;
  online?: boolean;
};

type PopularPath = {
  path: string;
  title: string;
  views: number;
};

type Summary = {
  onlineNow: number;
  visitorsLast7Days: number;
  pageViewsLast7Days: number;
};

const botBadgeClass =
  "inline-flex rounded-full bg-sand px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ink";

function onlineLabel(count: number) {
  return count === 1 ? "1 visitor online" : `${count} visitors online`;
}

function bulkDeleteConfirmMessage(count: number) {
  const label = count === 1 ? "this visitor" : `these ${count} visitors`;
  return `Delete ${label} and all recorded page views? This action cannot be undone.`;
}

function VisitorSelectCheckbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      className={`size-4 shrink-0 rounded-sm border-line text-terracotta accent-terracotta ${adminFocusRing}`}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function VisitorsTable({
  visitors,
  popularPaths,
  summary,
  recipeTitles = {},
}: {
  visitors: GuestRow[];
  popularPaths: PopularPath[];
  summary: Summary;
  recipeTitles?: Record<string, string>;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkError, setBulkError] = useState("");
  const [bulkPending, startBulkDelete] = useTransition();
  const titles = useMemo(() => new Map(Object.entries(recipeTitles)), [recipeTitles]);
  const [presenceById, setPresenceById] = useState<
    Record<string, { online: boolean; lastSeenAt: string }>
  >(() => {
    const initial: Record<string, { online: boolean; lastSeenAt: string }> = {};
    for (const guest of visitors) {
      initial[guest.id] = {
        online: Boolean(guest.online),
        lastSeenAt:
          typeof guest.lastSeenAt === "string"
            ? guest.lastSeenAt
            : new Date(guest.lastSeenAt).toISOString(),
      };
    }
    return initial;
  });

  useEffect(() => {
    const next: Record<string, { online: boolean; lastSeenAt: string }> = {};
    for (const guest of visitors) {
      next[guest.id] = {
        online: Boolean(guest.online),
        lastSeenAt:
          typeof guest.lastSeenAt === "string"
            ? guest.lastSeenAt
            : new Date(guest.lastSeenAt).toISOString(),
      };
    }
    setPresenceById(next);
  }, [visitors]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/admin/visitors/presence", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          visitors?: { id: string; online: boolean; lastSeenAt: string }[];
        };
        if (!data.visitors || cancelled) return;
        setPresenceById((current) => {
          const merged = { ...current };
          for (const row of data.visitors!) {
            merged[row.id] = { online: row.online, lastSeenAt: row.lastSeenAt };
          }
          return merged;
        });
        setNow(Date.now());
      } catch {
        // Keep last known presence if the poll fails.
      }
    }

    void poll();
    const pollTimer = window.setInterval(() => void poll(), GUEST_ADMIN_PRESENCE_POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearInterval(tick);
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...visitors].sort((left, right) => {
        const leftSeen = presenceById[left.id]?.lastSeenAt || left.lastSeenAt;
        const rightSeen = presenceById[right.id]?.lastSeenAt || right.lastSeenAt;
        return new Date(rightSeen).getTime() - new Date(leftSeen).getTime();
      }),
    [visitors, presenceById],
  );

  const liveOnlineCount = useMemo(
    () =>
      sorted.filter((guest) => {
        if (isBotUserAgent(guest.userAgent)) return false;
        const patch = presenceById[guest.id];
        return isGuestOnlineFromPresence(
          {
            online: patch?.online ?? guest.online,
            lastSeenAt: patch?.lastSeenAt ?? guest.lastSeenAt,
          },
          now,
        );
      }).length,
    [sorted, now, presenceById],
  );

  const [showAllPopular, setShowAllPopular] = useState(false);
  const popularPreviewLimit = 5;
  const visiblePopular = showAllPopular
    ? popularPaths
    : popularPaths.slice(0, popularPreviewLimit);
  const canTogglePopular = popularPaths.length > popularPreviewLimit;

  const visibleIds = useMemo(() => sorted.map((guest) => guest.id), [sorted]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);

  function toggleGuest(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds(checked ? new Set(visibleIds) : new Set());
  }

  function handleBulkDelete() {
    if (bulkPending || selectedCount === 0) return;
    if (!window.confirm(bulkDeleteConfirmMessage(selectedCount))) return;

    setBulkError("");
    const ids = [...selectedIds];
    startBulkDelete(async () => {
      const result = await deleteGuestVisitorsAction(ids);
      if (!result.ok) {
        if (result.error === "not-found") {
          setBulkError("No matching visitors found.");
        } else if (result.error === "missing") {
          setBulkError("Select at least one visitor.");
        } else {
          setBulkError("Could not delete visitors. Try again.");
        }
        return;
      }
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryMetric value={liveOnlineCount} label="Online now" />
        <SummaryMetric
          value={summary.visitorsLast7Days}
          label="Visitors"
          hint="Last 7 days"
        />
        <SummaryMetric
          value={summary.pageViewsLast7Days}
          label="Page views"
          hint="Last 7 days"
        />
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink">Popular pages</h2>
        <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Last 7 days
        </p>
        {popularPaths.length ? (
          <>
            <ul className="mt-3 divide-y divide-line border border-line bg-paper">
              {visiblePopular.map((item) => (
                <li
                  key={item.path}
                  className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{item.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[0.65rem] text-muted">
                      {item.path}
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs text-muted">
                    {item.views} {item.views === 1 ? "view" : "views"}
                  </span>
                </li>
              ))}
            </ul>
            {canTogglePopular ? (
              <button
                type="button"
                className={`mt-2 text-sm ${adminLinkClass} ${adminFocusRing}`}
                aria-expanded={showAllPopular}
                onClick={() => setShowAllPopular((value) => !value)}
              >
                {showAllPopular ? "Show less" : "View all"}
              </button>
            ) : null}
          </>
        ) : (
          <p className="mt-3 border border-dashed border-line bg-paper px-4 py-6 text-sm text-muted">
            No page views from anonymous visitors in the last 7 days.
          </p>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div>
            <h2 className="font-serif text-xl text-ink">Recent visitors</h2>
            <p className="mt-1 text-sm text-muted">Times in GMT</p>
          </div>
          <p className="text-sm text-muted">
            <span className="inline-flex items-center gap-2 font-semibold text-ink">
              <PresenceDot online={liveOnlineCount > 0} pulse={liveOnlineCount > 0} />
              {onlineLabel(liveOnlineCount)}
            </span>
            <span className="mt-0.5 block text-xs sm:mt-0 sm:ml-2 sm:inline">
              Live presence · Updates automatically
            </span>
          </p>
        </div>

        {sorted.length === 0 ? (
          <p className="mt-4 border border-dashed border-line bg-paper px-4 py-8 text-sm text-muted">
            No anonymous visitors yet. Open the public site while signed out to generate traffic.
          </p>
        ) : (
          <>
            {selectedCount > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-line bg-paper px-4 py-3">
                <p className="text-sm font-semibold text-ink">
                  {selectedCount} selected
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={bulkPending}
                    aria-busy={bulkPending}
                    className={`text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-60 ${adminFocusRing}`}
                    onClick={handleBulkDelete}
                  >
                    {bulkPending ? "Deleting…" : "Delete selected"}
                  </button>
                  <button
                    type="button"
                    disabled={bulkPending}
                    className={`text-sm text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 ${adminFocusRing}`}
                    onClick={() => {
                      setBulkError("");
                      setSelectedIds(new Set());
                    }}
                  >
                    Clear selection
                  </button>
                </div>
                {bulkError ? (
                  <p className="w-full text-sm text-terracotta">{bulkError}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 hidden border border-line bg-paper md:block">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[3rem]" />
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[21%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className={adminTableHeadClass}>
                  <tr>
                    <th className="px-3 py-3 font-medium">
                      <VisitorSelectCheckbox
                        checked={allVisibleSelected}
                        disabled={bulkPending}
                        label={
                          allVisibleSelected
                            ? "Deselect all visitors"
                            : "Select all visitors"
                        }
                        onChange={toggleAllVisible}
                      />
                      {someVisibleSelected && !allVisibleSelected ? (
                        <span className="sr-only">Some visitors selected</span>
                      ) : null}
                    </th>
                    <th className="px-3 py-3 font-medium">Visitor</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Current / last page</th>
                    <th className="px-3 py-3 font-medium">First seen</th>
                    <th className="px-3 py-3 font-medium">Last seen</th>
                    <th className="px-3 py-3 font-medium">Location</th>
                    <th className="px-3 py-3 font-medium">Device / client</th>
                    <th className="px-3 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((guest) => (
                    <VisitorTableRow
                      key={guest.id}
                      guest={guest}
                      now={now}
                      presence={presenceById[guest.id]}
                      recipeTitles={titles}
                      selected={selectedIds.has(guest.id)}
                      selectionDisabled={bulkPending}
                      onSelectedChange={(checked) => toggleGuest(guest.id, checked)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-4 space-y-3 md:hidden">
              {sorted.map((guest) => (
                <VisitorMobileCard
                  key={guest.id}
                  guest={guest}
                  now={now}
                  presence={presenceById[guest.id]}
                  recipeTitles={titles}
                  selected={selectedIds.has(guest.id)}
                  selectionDisabled={bulkPending}
                  onSelectedChange={(checked) => toggleGuest(guest.id, checked)}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function SummaryMetric({
  value,
  label,
  hint,
}: {
  value: number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="border border-line bg-paper px-4 py-3">
      <p className="font-serif text-3xl leading-none text-ink">{value}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function PageCell({ path, recipeTitles }: { path: string; recipeTitles: Map<string, string> }) {
  if (!path) {
    return <span className="text-muted">—</span>;
  }
  const title = guestPathTitle(path, recipeTitles);
  const showPath = title !== path;
  return (
    <div className="min-w-0">
      <p className="break-words text-sm leading-snug text-ink">{title}</p>
      {showPath ? (
        <p className="mt-0.5 break-words font-mono text-[0.65rem] leading-snug text-muted">{path}</p>
      ) : null}
    </div>
  );
}

function LocationCell({ country, city }: { country?: string | null; city?: string | null }) {
  const label = formatCountryCityLocation({ country: country || "", city: city || "" });
  return (
    <span className="block truncate text-xs leading-snug text-muted" title={label === "—" ? undefined : label}>
      {label}
    </span>
  );
}

function VisitorTableRow({
  guest,
  now,
  presence,
  recipeTitles,
  selected,
  selectionDisabled,
  onSelectedChange,
}: {
  guest: GuestRow;
  now: number;
  presence?: { online: boolean; lastSeenAt: string };
  recipeTitles: Map<string, string>;
  selected: boolean;
  selectionDisabled: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const lastSeen = presence?.lastSeenAt ?? guest.lastSeenAt;
  const online = isGuestOnlineFromPresence(
    {
      online: presence?.online ?? guest.online,
      lastSeenAt: lastSeen,
    },
    now,
  );
  const status = formatGuestPresenceLabel(
    {
      online: presence?.online ?? guest.online,
      lastSeenAt: lastSeen,
    },
    now,
  );
  const shortKey = guest.visitorKey.slice(0, 8);
  const client = classifyGuestClient(guest.userAgent);
  const deviceClient = guestDeviceClientLabel(guest.userAgent);

  return (
    <tr className="border-t border-line align-top hover:bg-cream/40">
      <td className="px-3 py-3">
        <VisitorSelectCheckbox
          checked={selected}
          disabled={selectionDisabled}
          label={`Select Guest ${shortKey}`}
          onChange={onSelectedChange}
        />
      </td>
      <td className="px-3 py-3">
        <Link href={`/admin/visitors/${guest.id}`} className={`block min-w-0 ${adminFocusRing}`}>
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink transition-colors hover:text-terracotta">
              Guest {shortKey}
            </span>
            {client.kind === "bot" ? <span className={botBadgeClass}>Bot</span> : null}
          </span>
        </Link>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-2 text-sm text-ink">
          <PresenceDot online={online} />
          <span className="leading-snug">{status}</span>
        </span>
      </td>
      <td className="px-3 py-3">
        <PageCell path={guest.lastPath} recipeTitles={recipeTitles} />
      </td>
      <td className="px-3 py-3 text-xs leading-snug text-muted">
        {formatAdminShortDateTime(guest.firstSeenAt)}
      </td>
      <td className="px-3 py-3 text-xs leading-snug text-muted">
        {formatAdminShortDateTime(lastSeen)}
      </td>
      <td className="px-3 py-3">
        <LocationCell country={guest.country} city={guest.city} />
      </td>
      <td className="px-3 py-3 text-xs leading-snug text-muted">
        <span className="block truncate" title={guest.userAgent}>
          {deviceClient}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="inline-flex flex-col items-end gap-1">
          <span className="inline-flex items-center justify-end gap-3">
            <Link
              href={`/admin/visitors/${guest.id}`}
              className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
            >
              View
            </Link>
            <RemoveGuestVisitorButton id={guest.id} disabled={selectionDisabled} />
          </span>
        </span>
      </td>
    </tr>
  );
}

function VisitorMobileCard({
  guest,
  now,
  presence,
  recipeTitles,
  selected,
  selectionDisabled,
  onSelectedChange,
}: {
  guest: GuestRow;
  now: number;
  presence?: { online: boolean; lastSeenAt: string };
  recipeTitles: Map<string, string>;
  selected: boolean;
  selectionDisabled: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const lastSeen = presence?.lastSeenAt ?? guest.lastSeenAt;
  const online = isGuestOnlineFromPresence(
    {
      online: presence?.online ?? guest.online,
      lastSeenAt: lastSeen,
    },
    now,
  );
  const status = formatGuestPresenceLabel(
    {
      online: presence?.online ?? guest.online,
      lastSeenAt: lastSeen,
    },
    now,
  );
  const shortKey = guest.visitorKey.slice(0, 8);
  const client = classifyGuestClient(guest.userAgent);
  const deviceClient = guestDeviceClientLabel(guest.userAgent);
  const location = formatCountryCityLocation({
    country: guest.country || "",
    city: guest.city || "",
  });

  return (
    <li className="border border-line bg-paper px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <VisitorSelectCheckbox
            checked={selected}
            disabled={selectionDisabled}
            label={`Select Guest ${shortKey}`}
            onChange={onSelectedChange}
          />
          <div className="min-w-0">
            <Link
              href={`/admin/visitors/${guest.id}`}
              className={`inline-flex flex-wrap items-center gap-2 font-semibold text-ink hover:text-terracotta ${adminFocusRing}`}
            >
              Guest {shortKey}
              {client.kind === "bot" ? <span className={botBadgeClass}>Bot</span> : null}
            </Link>
            <p className="mt-1 inline-flex items-center gap-2 text-sm text-ink">
              <PresenceDot online={online} />
              {status}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            href={`/admin/visitors/${guest.id}`}
            className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
          >
            View
          </Link>
          <RemoveGuestVisitorButton id={guest.id} disabled={selectionDisabled} />
        </div>
      </div>
      <div className="mt-2">
        <PageCell path={guest.lastPath} recipeTitles={recipeTitles} />
      </div>
      <p className="mt-2 truncate text-xs text-muted" title={location === "—" ? undefined : location}>
        {location}
      </p>
      <p className="mt-1 truncate text-xs text-muted" title={guest.userAgent}>
        {deviceClient}
      </p>
      <p className="mt-1 text-xs text-muted">
        First {formatAdminShortDateTime(guest.firstSeenAt)} · Last{" "}
        {formatAdminShortDateTime(lastSeen)}
      </p>
    </li>
  );
}
