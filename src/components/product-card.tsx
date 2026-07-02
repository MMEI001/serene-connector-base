import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ExternalLink, ShoppingCart, Check, Loader2 } from "lucide-react";
import { addProductToShoppingList } from "@/lib/product-actions.functions";

export type ProductCardData = {
  name: string;
  url: string;
  store?: string;
  price?: string;
  image?: string;
  note?: string;
};

function fallbackHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function ProductCard({ data }: { data: ProductCardData }) {
  const addFn = useServerFn(addProductToShoppingList);
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const host = fallbackHost(data.url);

  const handleAdd = async () => {
    if (state !== "idle") return;
    setState("adding");
    try {
      await addFn({
        data: {
          name: data.name,
          url: data.url,
          store: data.store || null,
          price: data.price || null,
        },
      });
      setState("added");
      toast.success("Op je boodschappenlijst gezet.");
    } catch (err) {
      setState("idle");
      const msg = err instanceof Error ? err.message : "Kon het niet opslaan.";
      toast.error(msg);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/70 backdrop-blur-md border border-white/60 shadow-[0_2px_12px_rgba(139,126,115,0.08)] overflow-hidden">
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-3 p-3 hover:bg-white/60 transition-colors"
      >
        <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
          {data.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.image}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ShoppingCart className="h-6 w-6 text-muted-foreground/60" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
            <span className="truncate">{data.store || host}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground/90 line-clamp-2">
            {data.name}
          </div>
          {data.price && (
            <div className="mt-1 text-sm font-semibold text-foreground">{data.price}</div>
          )}
          {data.note && !data.price && (
            <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{data.note}</div>
          )}
        </div>
      </a>
      <div className="border-t border-white/60 p-2 flex justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={state !== "idle"}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground/90 disabled:bg-foreground/60 px-3 py-1.5 text-xs font-medium text-background transition-transform duration-200 active:scale-95"
        >
          {state === "adding" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Opslaan…
            </>
          ) : state === "added" ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Op je lijst
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              Toevoegen aan boodschappenlijst
            </>
          )}
        </button>
      </div>
    </div>
  );
}
