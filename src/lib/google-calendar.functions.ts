import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saveTokensSchema = z.object({
  providerToken: z.string().min(1),
  providerRefreshToken: z.string().min(1).nullable().optional(),
  expiresIn: z.number().int().positive().optional(),
});

export const saveGoogleTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveTokensSchema.parse(input))
  .handler(async ({ data, context }) => {
    const expiresAt = data.expiresIn
      ? new Date(Date.now() + data.expiresIn * 1000).toISOString()
      : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Preserve existing refresh_token if Google didn't return a new one
    let refreshToken = data.providerRefreshToken ?? null;
    if (!refreshToken) {
      const { data: existing } = await supabaseAdmin
        .from("calendar_connections")
        .select("refresh_token")
        .eq("user_id", context.userId)
        .eq("provider", "google")
        .maybeSingle();
      refreshToken = existing?.refresh_token ?? null;
    }

    const { error } = await supabaseAdmin
      .from("calendar_connections")
      .upsert(
        {
          user_id: context.userId,
          provider: "google",
          access_token: data.providerToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
        },
        { onConflict: "user_id,provider" },
      );

    if (error) {
      console.error("[google-calendar] save tokens failed", error);
      throw new Error("Kon koppeling niet opslaan");
    }

    return { ok: true };
  });

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth-credentials ontbreken op de server");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[google-calendar] refresh failed", res.status, text);
    throw new Error("Token verversen mislukt");
  }

  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };
}

export const fetchGoogleCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conn, error } = await supabaseAdmin
      .from("calendar_connections")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", context.userId)
      .eq("provider", "google")
      .maybeSingle();

    if (error) {
      console.error("[google-calendar] read connection failed", error);
      throw new Error("Kon koppeling niet ophalen");
    }
    if (!conn) {
      return { connected: false as const, calendars: [] };
    }

    let accessToken = conn.access_token;
    const expiresAt = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
    const isExpired = !expiresAt || expiresAt < Date.now() + 60_000;

    if (isExpired && conn.refresh_token) {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("calendar_connections")
        .update({ access_token: accessToken, expires_at: newExpiresAt })
        .eq("user_id", context.userId)
        .eq("provider", "google");
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (res.status === 401 || res.status === 403) {
      throw new Error("Geen toegang tot je agenda — probeer opnieuw te koppelen");
    }
    if (!res.ok) {
      const text = await res.text();
      console.error("[google-calendar] list failed", res.status, text);
      throw new Error("Kon agenda's niet ophalen");
    }

    const json = (await res.json()) as {
      items?: Array<{ id: string; summary: string; backgroundColor?: string }>;
    };

    const calendars = (json.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      backgroundColor: c.backgroundColor ?? null,
    }));

    return { connected: true as const, calendars };
  });

export const getCalendarPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_preferences")
      .select("calendar_id, enabled")
      .eq("user_id", context.userId);
    if (error) throw new Error("Voorkeuren konden niet geladen worden");
    return data ?? [];
  });

const setPrefSchema = z.object({
  calendarId: z.string().min(1).max(512),
  enabled: z.boolean(),
});

export const setCalendarPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setPrefSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_preferences")
      .upsert(
        {
          user_id: context.userId,
          calendar_id: data.calendarId,
          enabled: data.enabled,
        },
        { onConflict: "user_id,calendar_id" },
      );
    if (error) {
      console.error("[google-calendar] upsert preference failed", error);
      throw new Error("Kon voorkeur niet opslaan");
    }
    return { ok: true };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("calendar_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "google");
    return { ok: true };
  });
