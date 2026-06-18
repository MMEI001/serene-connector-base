import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const RITUAL_BODIES = [
  "Een momentje voor jezelf?",
  "De dag mag rusten.",
  "Adem in. Adem uit.",
];

function parseHHMM(s: string): { h: number; m: number } {
  const [hRaw, mRaw] = s.split(":");
  const h = Math.min(23, Math.max(0, Number(hRaw) || 0));
  const m = Math.min(59, Math.max(0, Number(mRaw) || 0));
  return { h, m };
}

function nextOccurrence(hhmm: string): number {
  const { h, m } = parseHHMM(hhmm);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("[ritual] sw register failed", err);
    return null;
  }
}

export async function requestRitualPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function fireRitualNotification() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const body = RITUAL_BODIES[Math.floor(Math.random() * RITUAL_BODIES.length)];
  const reg = await ensureServiceWorker();
  if (reg && "showNotification" in reg) {
    try {
      await reg.showNotification("Tijd om los te laten.", {
        body,
        icon: "/orb-icon.svg",
        badge: "/orb-icon.svg",
        tag: "hoofdrust-ritual",
        data: { url: "/laat-los" },
      });
      return;
    } catch (err) {
      console.warn("[ritual] showNotification failed", err);
    }
  }
  try {
    new Notification("Tijd om los te laten.", {
      body,
      icon: "/orb-icon.svg",
      tag: "hoofdrust-ritual",
    });
  } catch (err) {
    console.warn("[ritual] Notification fallback failed", err);
  }
}

/**
 * Schedules a local daily notification while the app is open.
 * Note: when the tab is closed, only true Web Push (with a push server)
 * can wake the browser — out of scope here. This is best-effort foreground.
 */
export function useDailyRitual(userId?: string) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    function clear() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    async function schedule() {
      if (cancelled) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("ritual_enabled, ritual_time")
        .eq("user_id", userId!)
        .maybeSingle();
      if (cancelled) return;
      clear();
      const d = data as { ritual_enabled?: boolean; ritual_time?: string } | null;
      if (!d?.ritual_enabled) return;
      void ensureServiceWorker();
      const delay = nextOccurrence(d.ritual_time || "19:30");
      timerRef.current = window.setTimeout(async () => {
        await fireRitualNotification();
        schedule();
      }, delay);
    }

    schedule();

    const onChange = () => {
      if (!cancelled) schedule();
    };
    window.addEventListener("hoofdrust:ritual-changed", onChange);

    return () => {
      cancelled = true;
      clear();
      window.removeEventListener("hoofdrust:ritual-changed", onChange);
    };
  }, [userId]);
}

export function notifyRitualChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hoofdrust:ritual-changed"));
  }
}
