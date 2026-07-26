import { z } from "zod";
import type { Formality, GarmentCategory } from "./types";

export const occasionProfileSchema = z.object({
  label: z.string(),
  formality: z.enum([
    "casual",
    "smart_casual",
    "business",
    "formal",
    "black_tie",
  ]),
  styleHints: z.array(z.string()),
  avoid: z.array(z.string()),
  preferCategories: z.array(
    z.enum([
      "top",
      "bottom",
      "outerwear",
      "shoes",
      "accessory",
      "dress",
      "bag",
    ])
  ),
  notes: z.string(),
});

export type OccasionProfile = z.infer<typeof occasionProfileSchema>;

/** Keyword fallback when no AI key — never invents garments. */
export function inferOccasionProfile(
  occasion: string,
  styleHint?: string
): OccasionProfile {
  const o = occasion.toLowerCase();
  let formality: Formality = "casual";
  const styleHints: string[] = [];
  const avoid: string[] = [];
  const preferCategories: GarmentCategory[] = [];
  let notes = "";

  if (o.includes("black tie") || o.includes("black-tie") || o.includes("gala")) {
    formality = "black_tie";
    styleHints.push("quiet luxury", "old money");
    preferCategories.push("dress", "outerwear", "shoes", "accessory");
    avoid.push("sneakers", "denim", "hoodies", "jeans");
    notes = "Black-tie / gala — polished and restrained.";
  } else if (o.includes("wedding") || o.includes("reception")) {
    // Guest look: formal, not tuxedo-only — prefer blazer + tailored pieces
    formality = "formal";
    styleHints.push("quiet luxury", "old money");
    preferCategories.push("outerwear", "top", "bottom", "shoes", "accessory");
    avoid.push("sneakers", "denim", "jeans", "hoodies", "knit", "quarter-zip");
    notes = "Wedding guest — tailored, elevated, no casual denim.";
  } else if (
    o.includes("funeral") ||
    o.includes("memorial") ||
    o.includes("wake")
  ) {
    formality = "formal";
    styleHints.push("minimal", "quiet luxury");
    avoid.push("bright colors", "loud patterns", "sneakers");
    notes = "Somber, dark, respectful.";
  } else if (
    o.includes("interview") ||
    o.includes("board") ||
    o.includes("presentation") ||
    o.includes("in-law") ||
    o.includes("inlaw") ||
    o.includes("parent")
  ) {
    formality = "formal";
    styleHints.push("quiet luxury", "old money");
    preferCategories.push("top", "bottom", "shoes");
    avoid.push("streetwear", "distressed denim");
    notes = "First impressions — tailored and composed.";
  } else if (
    o.includes("office") ||
    o.includes("meeting") ||
    o.includes("work") ||
    o.includes("client") ||
    o.includes("conference")
  ) {
    formality = "business";
    styleHints.push("quiet luxury", "minimal");
    preferCategories.push("top", "bottom", "shoes");
    notes = "Professional day — clean lines.";
  } else if (
    o.includes("birthday") ||
    o.includes("anniversary") ||
    o.includes("celebration")
  ) {
    formality = o.includes("dinner") || o.includes("restaurant")
      ? "smart_casual"
      : "smart_casual";
    styleHints.push("quiet luxury", "romantic");
    preferCategories.push("top", "bottom", "shoes", "accessory");
    notes = "Celebratory but wearable — elevated, not costume.";
  } else if (
    o.includes("dinner") ||
    o.includes("date") ||
    o.includes("restaurant") ||
    o.includes("brunch") ||
    o.includes("lunch")
  ) {
    formality = "smart_casual";
    styleHints.push("quiet luxury", "old money");
    notes = "Social dining — put-together without stiff formality.";
  } else if (
    o.includes("gym") ||
    o.includes("workout") ||
    o.includes("run") ||
    o.includes("yoga")
  ) {
    formality = "casual";
    styleHints.push("streetwear", "minimal");
    preferCategories.push("top", "bottom", "shoes");
    avoid.push("leather dress shoes", "blazer");
    notes = "Movement first — breathable and practical.";
  } else if (
    o.includes("travel") ||
    o.includes("flight") ||
    o.includes("airport") ||
    o.includes("train")
  ) {
    formality = "smart_casual";
    styleHints.push("minimal", "quiet luxury");
    preferCategories.push("top", "bottom", "outerwear", "shoes");
    notes = "Comfort for transit with a polished silhouette.";
  } else if (
    o.includes("party") ||
    o.includes("night out") ||
    o.includes("club") ||
    o.includes("cocktail") ||
    o.includes("drinks") ||
    o.includes("drink with") ||
    o.includes("pub")
  ) {
    formality = "smart_casual";
    styleHints.push("romantic", "quiet luxury");
    preferCategories.push("top", "bottom", "shoes", "accessory");
    notes = "Evening presence — intentional finishing pieces.";
  } else if (
    o.includes("church") ||
    o.includes("ceremony") ||
    o.includes("graduation")
  ) {
    formality = "formal";
    styleHints.push("quiet luxury", "old money");
    notes = "Ceremonial — respectful and polished.";
  } else if (
    o.includes("beach") ||
    o.includes("holiday") ||
    o.includes("vacation") ||
    o.includes("picnic")
  ) {
    formality = "casual";
    styleHints.push("minimal", "romantic");
    notes = "Relaxed setting — light fabrics and ease.";
  }

  if (styleHint) styleHints.unshift(styleHint);
  if (!styleHints.length) styleHints.push(styleHint || "quiet luxury");

  return {
    label: occasion.trim() || "today",
    formality,
    styleHints: Array.from(new Set(styleHints)).slice(0, 4),
    avoid,
    preferCategories,
    notes: notes || `Look suited to ${occasion}.`,
  };
}
