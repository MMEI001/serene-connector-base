/**
 * Conversation Engine — begrijpt wat de gebruiker écht wil.
 *
 * Sprint 5: continuation-aware. Als er een lopende Experience-state is en
 * de huidige zin lijkt op aanvullende info (bv. "het is een meisje van
 * acht"), bouwen we direct een synthetische Conversation in plaats van
 * de classifier te raadplegen — geen API-call, geen kans op een verkeerde
 * intent, en we houden de experience-context vast.
 */

import { processVoiceInput, type BrainHistoryEntry } from "@/lib/voice/process-voice-input";
import type { UserPersona } from "@/lib/voice/persona";
import type { Conversation } from "./types";
import type { GiftEventInput } from "./experiences/gift-event";
import {
  extractFieldsFromUtterance,
  looksLikeContinuation,
  mergeGiftData,
} from "./experiences/continuation";
import type { ExperienceState } from "./experiences/state-store";

export type UnderstandOptions = {
  state?: ExperienceState | null;
  contextSummary?: string | null;
  history?: BrainHistoryEntry[];
};

export type UnderstandResult = Conversation & {
  /** True als deze turn als vervolg op een lopende Experience is afgehandeld. */
  isContinuation: boolean;
  /** Samengevoegde gift-data als experience=gift_event (handig voor pipeline). */
  giftData?: GiftEventInput;
};

const STATIC_META = {
  model: "continuation/no-llm",
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

export async function understand(
  text: string,
  persona: UserPersona,
  opts: UnderstandOptions = {},
): Promise<UnderstandResult> {
  const state = opts.state ?? null;

  // Continuation-pad: lopende experience + korte aanvullende zin.
  if (
    state &&
    state.kind === "gift_event" &&
    looksLikeContinuation(text, state.askedField)
  ) {
    const extracted = extractFieldsFromUtterance(text, state.askedField);
    const merged = mergeGiftData(state.data, extracted);

    return {
      text,
      isContinuation: true,
      giftData: merged,
      primary: "assistant_chat",
      assistantReply: undefined,
      actions: [
        {
          intent: "assistant_chat",
          payload: {
            reply: "",
            experience: "gift_event",
            experience_data: merged,
            is_continuation: true,
          },

          confidence: 0.9,
        },
      ],
      meta: STATIC_META,
    };
  }

  // Normaal pad — classifier.
  const { actions, meta } = await processVoiceInput(text, persona);
  const primary = actions[0];

  let assistantReply: string | undefined;
  if (primary?.intent === "assistant_chat") {
    const raw = primary.payload.reply;
    assistantReply =
      typeof raw === "string" && raw.trim() ? raw.trim() : "Ik denk met je mee.";
  }

  return {
    text,
    actions,
    primary: primary?.intent ?? "release",
    assistantReply,
    isContinuation: false,
    meta,
  };
}
