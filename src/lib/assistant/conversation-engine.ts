/**
 * Conversation Engine — begrijpt wat de gebruiker écht wil.
 * Sprint 1: dunne wrapper rond de bestaande Gemini-classifier.
 */

import { processVoiceInput } from "@/lib/voice/process-voice-input";
import type { UserPersona } from "@/lib/voice/persona";
import type { Conversation } from "./types";

export async function understand(text: string, persona: UserPersona): Promise<Conversation> {
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
    meta,
  };
}
