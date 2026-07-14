/**
 * Alias & doorgeefluik naar de centrale Voice Service (`src/lib/voice/voice-service.ts`).
 * Behouden voor backwards compatibility met bestaande componenten.
 */

export {
  speak as speakText,
  speak,
  stopVoice as stopCurrentAudio,
  stopVoice,
  DEFAULT_VOICE_ID,
  DEFAULT_VOICE_QUALITY,
  resetVoicePreferenceCache,
  setVoicePreferenceCache,
  setVoiceIdCache,
  setVoiceQualityCache,
} from "@/lib/voice/voice-service";
export type { VoiceQuality } from "@/lib/voice/voice-service";
