import type { Garment, GarmentCategory } from "./types";

/** Fuzzy match a spoken phrase to a wardrobe garment (name/brand/color/tags). */
export function matchGarmentFromSpeech(
  speech: string,
  wardrobe: Garment[],
  category?: GarmentCategory
): Garment | null {
  const t = speech.toLowerCase().replace(/[^\w\s-]/g, " ");
  const pool = category
    ? wardrobe.filter((g) => g.category === category)
    : wardrobe;
  if (!pool.length) return null;

  const ranked = pool
    .map((g) => ({ g, score: scoreGarmentMatch(t, g) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 3 ? ranked[0].g : null;
}

function scoreGarmentMatch(speech: string, g: Garment): number {
  let score = 0;
  const name = g.name.toLowerCase();
  const brand = g.brand.toLowerCase();
  const tokens = [
    ...name.split(/\s+/),
    ...brand.split(/\s+/),
    ...g.colors.map((c) => c.toLowerCase()),
    ...g.tags.map((t) => t.toLowerCase()),
    g.fabric?.toLowerCase() || "",
  ].filter((t) => t.length > 2);

  for (const token of tokens) {
    if (speech.includes(token)) score += token.length > 5 ? 3 : 2;
  }

  // Multi-word name fragments
  if (name.length > 4 && speech.includes(name)) score += 6;
  if (brand.length > 2 && speech.includes(brand)) score += 4;

  return score;
}

export function inferCategoryFromSpeech(
  speech: string
): GarmentCategory | undefined {
  const t = speech.toLowerCase();
  if (/\b(sock|stocking|tights|hosiery)\b/.test(t)) return "accessory";
  if (/\b(shoe|shoes|boot|boots|loafer|sneaker|footwear|kicks)\b/.test(t))
    return "shoes";
  if (/\b(jean|trouser|pant|skirt|short|bottom)\b/.test(t)) return "bottom";
  if (/\b(shirt|top|blouse|knit|tee|sweater|polo|zip)\b/.test(t)) return "top";
  if (/\b(jacket|coat|blazer|outerwear|parka)\b/.test(t)) return "outerwear";
  if (/\b(dress|gown)\b/.test(t)) return "dress";
  if (/\b(bag|tote|handbag)\b/.test(t)) return "bag";
  if (
    /\b(belt|glass|frame|sunglass|watch|wrist|accessory|scarf|hat)\b/.test(t)
  )
    return "accessory";
  return undefined;
}
