/**
 * Persistent Memory v1 — typecontracten.
 *
 * Strikt categorisch vocabulaire (zie SQL enum public.memory_category).
 * Geen vrije sleutels, geen ruwe transcripts.
 */

export type MemoryCategory =
  | "child_interest"
  | "child_activity"
  | "favorite"
  | "reminder_preference"
  | "shop_preference"
  | "hobby"
  | "gift_preference"
  | "planning_preference"
  | "shopping_preference"
  | "travel_preference"
  | "food_preference"
  | "pet"
  | "family_member"
  | "other";

export type MemoryStatus =
  | "pending_confirmation"
  | "active"
  | "rejected"
  | "archived";

/** Eén kandidaat zoals geëxtraheerd door de classifier. Nog niet opgeslagen. */
export type MemoryCandidate = {
  /** Onderwerp, bv. "dochter", "Sophie", null als algemeen. */
  subject: string | null;
  category: MemoryCategory;
  /** Korte, generieke waarde, bv. "paarden", "vega", "vrijdag 09:00". */
  value: string;
  /** Vertrouwen in extractie (0..1). */
  confidence: number;
  /** Toekomstige waarde voor hergebruik (0..1) — Future Value Score. */
  futureValue: number;
  /** Korte natuurlijke zin om bevestiging te vragen. */
  confirmQuestion: string;
};

/** Opgeslagen memory zoals teruggelezen uit de DB. */
export type MemoryRecord = {
  id: string;
  subject: string | null;
  category: MemoryCategory;
  value: string;
  confidence: number;
  futureValue: number;
  status: MemoryStatus;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
};
