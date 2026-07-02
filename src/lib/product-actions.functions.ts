import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { handleNote } from "@/lib/voice/handlers/note";

type Input = {
  name: string;
  url: string;
  store?: string | null;
  price?: string | null;
};

/**
 * Zet één product uit een web-antwoord op de boodschappenlijst.
 * Gebruikt de bestaande `notes`-tabel via de gedeelde note-handler.
 */
export const addProductToShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Partial<Input>;
    if (typeof i.name !== "string" || !i.name.trim()) {
      throw new Error("name is required");
    }
    if (typeof i.url !== "string" || !/^https?:\/\//i.test(i.url)) {
      throw new Error("valid url is required");
    }
    return {
      name: i.name.trim().slice(0, 200),
      url: i.url,
      store: typeof i.store === "string" ? i.store.trim() : null,
      price: typeof i.price === "string" ? i.price.trim() : null,
    } satisfies Input;
  })
  .handler(async ({ data, context }) => {
    const parts: string[] = [];
    if (data.store) parts.push(data.store);
    if (data.price) parts.push(data.price);
    parts.push(data.url);
    const content = parts.join(" — ");

    const result = await handleNote(
      { supabase: context.supabase, userId: context.userId },
      { title: data.name, content, text: content },
    );

    if (result.status !== "completed") {
      throw new Error(result.error || result.confirmation || "kon product niet opslaan");
    }
    return { ok: true, id: result.ref?.id ?? null };
  });
