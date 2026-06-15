import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-ics")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { syncAllCalendarsAdmin } = await import(
            "@/lib/ics-calendar.server"
          );
          const result = await syncAllCalendarsAdmin();
          return Response.json({ success: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[sync-ics cron]", msg);
          return Response.json(
            { success: false, error: msg },
            { status: 500 },
          );
        }
      },
    },
  },
});
