import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/laat-los/$id/")({
  ssr: false,
  head: () => ({ meta: [{ title: "HoofdRust — Laat los" }] }),
  component: LetGoDetailPage,
});

type Item = {
  id: string;
  content: string;
  status: "active" | "archived" | "processed";
  created_at: string;
};

function formatCreated(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function LetGoDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("let_go_items")
        .select("id, content, status, created_at")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) console.error("[let_go detail]", error);
      setItem(data as Item | null);
      setLoading(false);
    })();
  }, [id, user]);

  const handleArchive = async () => {
    if (!user || !item) return;
    setBusy(true);
    const { error } = await supabase
      .from("let_go_items")
      .update({ status: "archived" })
      .eq("id", item.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      console.error("[let_go archive]", error);
      toast.error("Dit lukte nu even niet. Probeer het zo nog eens.");
      return;
    }
    toast.success("Item gearchiveerd.");
    navigate({ to: "/laat-los" });
  };

  const handleDelete = async () => {
    if (!user || !item) return;
    setBusy(true);
    const { error } = await supabase
      .from("let_go_items")
      .delete()
      .eq("id", item.id)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      console.error("[let_go delete]", error);
      toast.error("Het verwijderen lukte niet. Je item is niet weggehaald.");
      return;
    }
    toast.success("Het item is verwijderd.");
    navigate({ to: "/laat-los" });
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Link to="/laat-los" className="text-sm text-muted-foreground hover:text-foreground">
          ← Terug
        </Link>
      </div>

      {loading ? (
        <Card className="rounded-3xl border-border/60 bg-card/80 p-6 shadow-sm">
          <Skeleton className="h-4 w-1/3 rounded-full" />
          <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
        </Card>
      ) : !item ? (
        <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
          Dit item konden we niet vinden.
        </Card>
      ) : (
        <>
          <Card className="rounded-3xl border-border/60 bg-card/80 p-8 shadow-sm">
            <p className="text-xs text-muted-foreground">
              Bewaard op {formatCreated(item.created_at)}
              {item.status === "archived" ? " · gearchiveerd" : ""}
            </p>
            <p className="mt-5 whitespace-pre-wrap text-base leading-relaxed text-foreground/90">
              {item.content}
            </p>
          </Card>

          <div className="mt-8 flex gap-3">
            {item.status === "active" && (
              <Button
                size="lg"
                variant="outline"
                className="flex-1 rounded-full"
                onClick={handleArchive}
                disabled={busy}
              >
                Archiveren
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Verwijderen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Weet je zeker dat je dit wilt verwijderen?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Dit kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={busy}
                    className="rounded-full bg-destructive/90 text-destructive-foreground hover:bg-destructive"
                  >
                    {busy ? "Verwijderen…" : "Verwijderen"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </AppShell>
  );
}
