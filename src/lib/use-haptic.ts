/**
 * useHaptic — simple wrapper around navigator.vibrate with semantic patterns.
 * Silently no-ops on unsupported devices (iOS Safari, desktop, etc).
 */
export function useHaptic() {
  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        /* ignore — some browsers throw on disallowed contexts */
      }
    }
  };

  return {
    light: () => vibrate(10),
    medium: () => vibrate(25),
    success: () => vibrate([50, 30, 50]),
    release: () => vibrate([100, 30, 200]),
    error: () => vibrate([200, 100, 200]),
  };
}
