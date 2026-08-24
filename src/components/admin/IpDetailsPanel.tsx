"use client";

import { useEffect, useState } from "react";
import { IpDetailsCard } from "@/components/admin/IpDetailsCard";
import type { IpDetails } from "@/lib/ip-details";

export function IpDetailsPanel({ ip }: { ip: string }) {
  const [details, setDetails] = useState<IpDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void fetch(`/api/admin/ip?address=${encodeURIComponent(ip)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as IpDetails & { error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load IP details.");
        if (active) setDetails(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load IP details.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ip]);

  if (loading) {
    return (
      <div className="border border-line bg-paper px-4 py-6 text-sm text-muted">
        Loading details for {ip}…
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="border border-line bg-paper px-4 py-6 text-sm text-terracotta">
        {error || `Could not load details for ${ip}.`}
      </div>
    );
  }

  return <IpDetailsCard details={details} />;
}
