/**
 * Alias & doorgeefluik naar de centrale Voice Service (`src/lib/voice/voice-service.ts`).
 * Vervangt de oude statische MP3-pool door gecachte ElevenLabs TTS in de exacte
 * stem van de gebruiker.
 */

export {
  prewarmVoiceCache as preloadAckAudio,
  playAcknowledgement,
  stopAcknowledgement,
} from "@/lib/voice/voice-service";
