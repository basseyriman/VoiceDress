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
    preferCategories.push("dress", "outerwear", "shoes", "accessory", "bag");
    avoid.push("sneakers", "denim", "hoodies", "jeans");
    notes = "Black-tie / gala — polished and restrained.";
  } else if (o.includes("wedding") || o.includes("reception")) {
    // Guest look: formal — dress or tailored separates both valid
    formality = "formal";
    styleHints.push("quiet luxury", "old money");
    preferCategories.push(
      "dress",
      "outerwear",
      "top",
      "bottom",
      "shoes",
      "accessory",
      "bag"
    );
    avoid.push("sneakers", "denim", "jeans", "hoodies", "knit", "quarter-zip");
    notes = "Wedding guest — tailored, elevated, no casual denim.";
  } else if (
    o.includes("funeral") ||
    o.includes("memorial") ||
    o.includes("wake")
  ) {
    formality = "formal";
    styleHints.push("minimal", "quiet luxury");
    preferCategories.push("dress", "top", "bottom", "shoes", "outerwear");
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
    preferCategories.push("dress", "top", "bottom", "shoes", "bag");
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
    preferCategories.push("dress", "top", "bottom", "shoes", "bag");
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
    preferCategories.push("dress", "top", "bottom", "shoes", "accessory", "bag");
    notes = "Celebratory but wearable — elevated, not costume.";
  } else if (
    o.includes("proper dinner") ||
    o.includes("dinner date") ||
    (o.includes("dinner") &&
      (o.includes("first") || o.includes("haven't") || o.includes("havent")))
  ) {
    formality = "business";
    styleHints.push("quiet luxury", "old money", "romantic");
    preferCategories.push(
      "dress",
      "top",
      "bottom",
      "outerwear",
      "shoes",
      "accessory",
      "bag"
    );
    avoid.push("sneakers", "denim", "jeans");
    notes = "High-value evening dinner — elevated, intentional.";
  } else if (
    o.includes("dinner") ||
    o.includes("date") ||
    o.includes("restaurant") ||
    o.includes("brunch") ||
    o.includes("lunch")
  ) {
    formality = "smart_casual";
    styleHints.push("quiet luxury", "old money", "romantic");
    preferCategories.push("dress", "top", "bottom", "shoes", "accessory", "bag");
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
    avoid.push("leather dress shoes", "blazer", "heels");
    notes = "Movement first — breathable and practical.";
  } else if (
    o.includes("travel") ||
    o.includes("flight") ||
    o.includes("airport") ||
    o.includes("train")
  ) {
    formality = "smart_casual";
    styleHints.push("minimal", "quiet luxury");
    preferCategories.push("dress", "top", "bottom", "outerwear", "shoes", "bag");
    notes = "Comfort for transit with a polished silhouette.";
  } else if (o.includes("cocktail") || o.includes("black tie") || o.includes("gala")) {
    formality = "formal";
    styleHints.push("romantic", "quiet luxury", "old money");
    preferCategories.push(
      "dress",
      "top",
      "bottom",
      "outerwear",
      "shoes",
      "accessory",
      "bag"
    );
    notes = "Elevated evening — jacket or dress-forward.";
  } else if (
    o.includes("party") ||
    o.includes("night out") ||
    o.includes("club") ||
    o.includes("drinks") ||
    o.includes("drink with") ||
    o.includes("pub")
  ) {
    formality = "smart_casual";
    styleHints.push("romantic", "quiet luxury");
    preferCategories.push("dress", "top", "bottom", "shoes", "accessory", "bag");
    notes = "Evening presence — intentional finishing pieces.";
  } else if (
    o.includes("church") ||
    o.includes("ceremony") ||
    o.includes("graduation")
  ) {
    formality = "formal";
    styleHints.push("quiet luxury", "old money");
    preferCategories.push("dress", "top", "bottom", "shoes", "bag", "accessory");
    notes = "Ceremonial — respectful and polished.";
  } else if (
    o.includes("beach") ||
    o.includes("holiday") ||
    o.includes("vacation") ||
    o.includes("picnic")
  ) {
    formality = "casual";
    styleHints.push("minimal", "romantic");
    preferCategories.push("dress", "top", "bottom", "shoes", "bag");
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
