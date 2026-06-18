import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";
import { TimeAwareBackground } from "./time-aware-background";
import { useDailyRitual } from "@/lib/daily-ritual";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        navigate({ to: "/onboarding" });
        return;
      }
      setCheckingProfile(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, navigate]);

  useDailyRitual(user?.id);

  if (loading || !user || checkingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-primary/40" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-28">
      <TimeAwareBackground />
      <AppHeader />
      <main
        key={location.pathname}
        className="mx-auto max-w-2xl px-5 py-10 animate-page-enter"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
