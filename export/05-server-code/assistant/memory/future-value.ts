/**
 * Future Value Score — intern signaal hoe waardevol een herinnering is
 * voor toekomstige ondersteuning. 0..1.
 *
 * Heuristisch in v1: categorie bepaalt de basisscore, met kleine
 * correcties voor tijdelijkheid van de waarde. Niet zichtbaar voor de
 * gebruiker — de Memory Engine gebruikt het later om te prioriteren als
 * veel informatie beschikbaar is.
 */

import type { MemoryCategory } from "./types";

const BASE_BY_CATEGORY: Record<MemoryCategory, number> = {
  child_interest: 0.9,
  child_activity: 0.85,
  hobby: 0.8,
  pet: 0.8,
  family_member: 0.8,
  food_preference: 0.75,
  shop_preference: 0.7,
  travel_preference: 0.65,
  gift_preference: 0.65,
  reminder_preference: 0.7,
  planning_preference: 0.7,
  shopping_preference: 0.65,
  favorite: 0.55,
  other: 0.3,
};

const TEMPORARY_HINTS = [
  "vandaag",
  "morgen",
  "deze week",
  "vanavond",
  "vanmiddag",
  "volgende week",
  "straks",
  "zo meteen",
];

export function scoreFutureValue(
  category: MemoryCategory,
  value: string,
): number {
  let score = BASE_BY_CATEGORY[category] ?? 0.4;
  const lower = value.toLowerCase();
  if (TEMPORARY_HINTS.some((h) => lower.includes(h))) {
    score -= 0.45;
  }
  if (lower.length > 80) score -= 0.1;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}
