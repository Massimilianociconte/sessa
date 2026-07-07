"use client";

import { useEffect } from "react";
import { trackEcommerceEvent, type EcommerceEventPayload } from "@/lib/analytics";

export default function AnalyticsBeacon({
  event,
  payload
}: {
  event: string;
  payload: EcommerceEventPayload;
}) {
  useEffect(() => {
    trackEcommerceEvent(event, payload);
  }, [event, payload]);

  return null;
}
