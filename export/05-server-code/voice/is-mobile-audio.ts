/**
 * Detecteert of we op een mobile/iOS device draaien waar losse
 * acknowledgement-audio de main reply blokkeert. Tijdelijke workaround:
 * op deze devices slaan we de ack over en spelen we alleen de hoofdreply.
 *
 * SSR-safe: returnt `false` als `window` niet bestaat.
 */

export type MobileAudioReason = "ios" | "mobile" | null;

export function detectMobileAudio(): MobileAudioReason {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }
  const ua = navigator.userAgent || "";
  // iPadOS 13+ doet zich voor als Mac; check op touch.
  const isIPadOS =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || isIPadOS;
  if (isIOS) return "ios";

  const isMobileUA = /Android|Mobile|Opera Mini|IEMobile|BlackBerry/i.test(ua);
  let coarsePointer = false;
  try {
    coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  } catch {
    // ignore
  }
  if (isMobileUA || coarsePointer) return "mobile";
  return null;
}

export function shouldSkipAckAudio(): MobileAudioReason {
  return detectMobileAudio();
}
