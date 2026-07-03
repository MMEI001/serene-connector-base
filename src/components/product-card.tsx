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
  const [imgOk, setImgOk] = useState(Boolean(data.image));
  const host = fallbackHost(data.url);
  const store = (data.store || host).trim();

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
    <div className="w-full max-w-sm rounded-3xl bg-white/80 backdrop-blur-md border border-white/70 shadow-[0_4px_24px_rgba(139,126,115,0.10)] overflow-hidden flex flex-col">
      {/* Grote productfoto */}
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-stone-100 to-stone-200 overflow-hidden">
        {data.image && imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image}
            alt={data.name}
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <ShoppingCart className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
        )}
        {store && (
          <div className="absolute top-3 left-3 rounded-full bg-white/90 backdrop-blur px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground/80 shadow-sm">
            {store}
          </div>
        )}
        {data.price && (
          <div className="absolute bottom-3 right-3 rounded-full bg-foreground/90 text-background px-3 py-1 text-sm font-semibold shadow-sm">
            {data.price}
          </div>
        )}
      </div>

      {/* Inhoud */}
      <div className="p-4 flex flex-col gap-2">
        <h3 className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2">
          {data.name}
        </h3>
        {data.note && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {data.note}
          </p>
        )}
      </div>

      {/* Acties */}
      <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={state !== "idle"}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground/90 hover:bg-foreground disabled:bg-foreground/60 px-4 py-2.5 text-sm font-medium text-background transition-all duration-200 active:scale-[0.98]"
        >
          {state === "adding" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Opslaan…
            </>
          ) : state === "added" ? (
            <>
              <Check className="h-4 w-4" />
              Op je lijst
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Toevoegen aan boodschappenlijst
            </>
          )}
        </button>
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/60 hover:bg-white/80 border border-stone-200/70 px-4 py-2 text-xs font-medium text-foreground/80 transition-colors"
        >
          Bekijk product
          <ExternalLink className="h-3 w-3 opacity-70" />
        </a>
      </div>
    </div>
  );
}
