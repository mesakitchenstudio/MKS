"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function NewsletterUnsubscribeBeacon({
  status,
}: {
  status: "unsubscribed" | "already" | "invalid";
}) {
  useEffect(() => {
    trackEvent("newsletter_unsubscribe", { placement: status });
  }, [status]);

  return null;
}
