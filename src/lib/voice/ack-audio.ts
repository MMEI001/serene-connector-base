// Pre-recorded "instant acknowledgement" clips. Bypassen ElevenLabs zodat
// HoofdRust binnen enkele ms hoorbaar reageert nadat de gebruiker stopt
// met praten — terwijl transcriptie + AI + TTS op de achtergrond lopen.

const ACK_SOURCES = [
  "/audio/ack/momentje.mp3",
  "/audio/ack/even_kijken.mp3",
  "/audio/ack/ik_denk_mee.mp3",
  "/audio/ack/ik_kijk_even.mp3",
];

let pool: HTMLAudioElement[] | null = null;
let current: HTMLAudioElement | null = null;

function ensurePool() {
  if (pool || typeof Audio === "undefined") return pool;
  pool = ACK_SOURCES.map((src) => {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = 0.85;
    return a;
  });
  return pool;
}

/** Preload zo vroeg mogelijk (bv. bij mount van de orb). */
export function preloadAckAudio() {
  ensurePool();
}

/**
 * Speel direct een korte erkenning af. Retourneert een stop-functie die
 * je aanroept zodra het echte antwoord (ElevenLabs/TTS) begint.
 */
export function playAcknowledgement(): () => void {
  const items = ensurePool();
  if (!items || items.length === 0) return () => {};

  stopAcknowledgement();

  const clip = items[Math.floor(Math.random() * items.length)];
  try {
    clip.currentTime = 0;
  } catch {
    /* sommige browsers gooien voor het eerste decode */
  }
  current = clip;

  const playPromise = clip.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      // Autoplay/permission fail — stil falen, dit is alleen UX-verrijking.
    });
  }

  return stopAcknowledgement;
}

export function stopAcknowledgement() {
  if (!current) return;
  try {
    current.pause();
    current.currentTime = 0;
  } catch {
    /* noop */
  }
  current = null;
}
