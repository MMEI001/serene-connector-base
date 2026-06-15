import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { syncAllIcsCalendars } from "@/lib/ics-calendar.functions";

/**
 * Fire-and-forget background refresh of all linked ICS calendars when the
 * app boots and the user is signed in. Non-blocking; errors are logged.
 */
export function IcsBackgroundSync() {
  const { user } = useAuth();
  const syncAll = useServerFn(syncAllIcsCalendars);
  const ran = useRef(false);

  useEffect(() => {
    if (!user || ran.current) return;
    ran.current = true;
    syncAll().catch((e) => {
      console.warn("[ics] background sync failed", e);
    });
  }, [user, syncAll]);

  return null;
}
