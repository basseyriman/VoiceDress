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

  // Common spoken aliases
  if (/\b(t-?shirt|tee)\b/.test(speech) && /\b(t-?shirt|tee)\b/.test(name)) {
    score += 5;
  }
  if (/\b(sweater|jumper|knit|zip)\b/.test(speech) && /\b(sweater|jumper|knit|zip)\b/.test(name)) {
    score += 3;
  }

  return score;
}

export function inferCategoryFromSpeech(
  speech: string
): GarmentCategory | undefined {
  const t = speech.toLowerCase();
  if (/\b(sock|stocking|tights|hosiery)\b/.test(t)) return "accessory";
  if (
    /\b(shoe|shoes|boot|boots|loafer|sneaker|footwear|kicks|heel|pump|flat|sandal|wedge|mule|stiletto)\b/.test(
      t
    )
  )
    return "shoes";
  if (/\b(jean|trouser|pant|skirt|short|bottom|legging|culotte)\b/.test(t))
    return "bottom";
  if (
    /\b(t-?shirt|tee|shirt|top|blouse|knit|sweater|jumper|polo|zip|camisole|hoodie)\b/.test(
      t
    )
  )
    return "top";
  if (/\b(jacket|coat|blazer|outerwear|parka)\b/.test(t)) return "outerwear";
  if (/\b(dress|gown|jumpsuit|romper)\b/.test(t)) return "dress";
  if (/\b(bag|tote|handbag|clutch|purse)\b/.test(t)) return "bag";
  if (
    /\b(belt|glass|frame|sunglass|watch|wrist|accessory|scarf|hat|necklace|earring|bracelet)\b/.test(
      t
    )
  )
    return "accessory";
  return undefined;
}

export type ParsedSwapSpeech = {
  /** Piece currently on them that they want removed */
  sourceQuery?: string;
  /** Piece they want instead */
  targetQuery?: string;
  category?: GarmentCategory;
  /** True when speech is clearly a single-piece swap, not a new look */
  isSwap: boolean;
};

/**
 * Parse "change the zip sweater to a t-shirt" into source + target.
 * Matching the full sentence against the wardrobe often picks the SOURCE
 * (already worn) instead of the TARGET — which then re-dresses everything.
 */
export function parseSwapSpeech(speech: string): ParsedSwapSpeech {
  const raw = speech.toLowerCase().trim();
  if (!raw) return { isSwap: false };

  const swapVerb =
    /\b(swap|change|replace|switch)\b/.test(raw) ||
    /\b(don't like|dont like|instead of)\b/.test(raw);

  // "change X to Y" / "swap X for Y" / "replace X with Y"
  const toMatch = raw.match(
    /\b(?:change|swap|replace|switch)\s+(?:out\s+)?(?:the\s+|my\s+|this\s+|that\s+)?(.+?)\s+(?:to|for|with|into)\s+(?:a\s+|an\s+|the\s+|my\s+|some\s+)?(.+?)(?:\s+please)?[.?!]*$/i
  );
  if (toMatch) {
    const sourceQuery = cleanSwapPhrase(toMatch[1]);
    const targetQuery = cleanSwapPhrase(toMatch[2]);
    return {
      sourceQuery: sourceQuery || undefined,
      targetQuery: targetQuery || undefined,
      category:
        inferCategoryFromSpeech(sourceQuery) ||
        inferCategoryFromSpeech(targetQuery),
      isSwap: true,
    };
  }

  // "instead of the sweater, a t-shirt" / "t-shirt instead of the sweater"
  const instead = raw.match(
    /\b(.+?)\s+instead of\s+(?:the\s+|my\s+|this\s+)?(.+?)(?:\s+please)?[.?!]*$/i
  );
  if (instead) {
    const targetQuery = cleanSwapPhrase(instead[1].replace(/^(can you|could you|please)\s+/i, ""));
    const sourceQuery = cleanSwapPhrase(instead[2]);
    return {
      sourceQuery: sourceQuery || undefined,
      targetQuery: targetQuery || undefined,
      category:
        inferCategoryFromSpeech(sourceQuery) ||
        inferCategoryFromSpeech(targetQuery),
      isSwap: true,
    };
  }

  if (!swapVerb) return { isSwap: false };

  // "change the shoes" / "swap the top" — category only
  const catOnly = raw.match(
    /\b(?:change|swap|replace|switch)\s+(?:the\s+|my\s+|this\s+)?(.+?)(?:\s+please)?[.?!]*$/i
  );
  const phrase = cleanSwapPhrase(catOnly?.[1] || raw);
  return {
    targetQuery: phrase || undefined,
    sourceQuery: phrase || undefined,
    category: inferCategoryFromSpeech(phrase || raw),
    isSwap: true,
  };
}

function cleanSwapPhrase(s: string): string {
  return s
    .replace(
      /^(can you|could you|please|just|maybe|the|my|this|that|a|an)\s+/gi,
      ""
    )
    .replace(
      /\b(please|thanks|thank you|for me|on me|from the wardrobe)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Clear single-piece swap — should never re-suggest a full new look. */
export function isClearPieceSwap(transcript: string): boolean {
  const parsed = parseSwapSpeech(transcript);
  if (!parsed.isSwap) return false;
  // "change my whole look" / "change the outfit" are full re-suggests
  if (
    /\b(whole look|entire look|full look|new look|outfit|everything)\b/i.test(
      transcript
    ) &&
    !parsed.targetQuery
  ) {
    return false;
  }
  return Boolean(
    parsed.category ||
      parsed.targetQuery ||
      parsed.sourceQuery ||
      /\b(swap|change|replace)\b/i.test(transcript)
  );
}
