import type {
  Formality,
  Garment,
  Outfit,
  TasteMemory,
  WeatherSnapshot,
} from "./types";
import type { OccasionProfile } from "./occasion-profile";
import { inferOccasionProfile } from "./occasion-profile";
import {
  inferCategoryFromSpeech,
  matchGarmentFromSpeech,
} from "./garment-match";

export type { OccasionProfile, TasteMemory };

const STYLE_PALETTES: Record<string, string[]> = {
  "old money": ["#1a1a1a", "#f5f0e6", "#2c3e2d", "#8b7355", "#c9a87c", "#4a5568"],
  "quiet luxury": ["#0b0b0c", "#e8e4dc", "#5c6b73", "#9a8f7a", "#2f2f2f"],
  streetwear: ["#111111", "#ffffff", "#ef4444", "#3b82f6", "#a3e635"],
  minimal: ["#111111", "#ffffff", "#737373", "#d4d4d4"],
  romantic: ["#f8e8e8", "#7c3a4a", "#d4a5a5", "#2d2a26"],
};

function scoreColorHarmony(outfitColors: string[], style: string): number {
  const palette =
    STYLE_PALETTES[style.toLowerCase()] || STYLE_PALETTES["quiet luxury"];
  let score = 0;
  for (const c of outfitColors) {
    const match = palette.some(
      (p) => p.toLowerCase() === c.toLowerCase() || similarHex(p, c)
    );
    if (match) score += 2;
    else score += 0.5;
  }
  return score;
}

function similarHex(a: string, b: string): boolean {
  try {
    const pa = parseInt(a.replace("#", ""), 16);
    const pb = parseInt(b.replace("#", ""), 16);
    const dr = Math.abs(((pa >> 16) & 255) - ((pb >> 16) & 255));
    const dg = Math.abs(((pa >> 8) & 255) - ((pb >> 8) & 255));
    const db = Math.abs((pa & 255) - (pb & 255));
    return dr + dg + db < 120;
  } catch {
    return false;
  }
}

function weatherFit(g: Garment, weather: WeatherSnapshot): number {
  let score = 1;
  if (weather.tempC < 8) {
    if (g.category === "outerwear") score += 3;
    if (g.fabric?.toLowerCase().includes("wool")) score += 2;
    if (g.season.includes("winter") || g.season.includes("all")) score += 1;
  } else if (weather.tempC < 16) {
    if (g.category === "outerwear") score += 1;
    if (
      g.season.includes("autumn") ||
      g.season.includes("spring") ||
      g.season.includes("all")
    )
      score += 1;
  } else if (weather.tempC > 24) {
    if (
      g.fabric?.toLowerCase().includes("linen") ||
      g.fabric?.toLowerCase().includes("cotton")
    )
      score += 2;
    if (g.category === "outerwear") score -= 2;
    if (g.season.includes("summer") || g.season.includes("all")) score += 1;
  }
  if (weather.precipChance > 50 && g.category === "shoes") {
    if (
      g.name.toLowerCase().includes("boot") ||
      g.fabric?.toLowerCase().includes("leather")
    )
      score += 2;
  }
  return score;
}

function formalityRank(f: Formality): number {
  const map: Record<Formality, number> = {
    casual: 1,
    smart_casual: 2,
    business: 3,
    formal: 4,
    black_tie: 5,
  };
  return map[f];
}

function formalityFit(g: Garment, target: Formality): number {
  const diff = Math.abs(formalityRank(g.formality) - formalityRank(target));
  return Math.max(0, 4 - diff);
}

function profileFit(g: Garment, profile: OccasionProfile): number {
  let score = 0;
  const blob =
    `${g.name} ${g.brand} ${g.tags.join(" ")} ${g.fabric || ""} ${g.colors.join(" ")}`.toLowerCase();
  for (const hint of profile.styleHints) {
    if (
      blob.includes(hint.toLowerCase()) ||
      g.tags.some((t) => t.toLowerCase().includes(hint.toLowerCase()))
    )
      score += 2;
  }
  for (const a of profile.avoid) {
    if (blob.includes(a.toLowerCase())) score -= 4;
  }
  if (profile.preferCategories.includes(g.category)) score += 1.5;
  return score;
}

function tastePenalty(g: Garment, taste?: TasteMemory): number {
  if (!taste) return 0;
  if (taste.rejectedIds.includes(g.id)) return -8;
  return 0;
}

function pickBest(
  items: Garment[],
  weather: WeatherSnapshot,
  style: string,
  formality: Formality,
  already: Garment[] = [],
  profile?: OccasionProfile,
  taste?: TasteMemory
): Garment | null {
  if (!items.length) return null;
  const ranked = [...items].sort((a, b) => {
    const sa =
      weatherFit(a, weather) +
      formalityFit(a, formality) +
      scoreColorHarmony(a.hexColors, style) +
      coherenceWithOutfit(a, already, formality, style) +
      (profile ? profileFit(a, profile) : 0) +
      tastePenalty(a, taste);
    const sb =
      weatherFit(b, weather) +
      formalityFit(b, formality) +
      scoreColorHarmony(b.hexColors, style) +
      coherenceWithOutfit(b, already, formality, style) +
      (profile ? profileFit(b, profile) : 0) +
      tastePenalty(b, taste);
    return sb - sa;
  });
  return ranked[0] || null;
}

function coherenceWithOutfit(
  candidate: Garment,
  already: Garment[],
  formality: Formality,
  style: string
): number {
  if (!already.length) {
    if (candidate.category === "bottom") {
      const isDark =
        candidate.colors.some((c) =>
          /charcoal|black|navy|grey|gray|indigo/.test(c.toLowerCase())
        ) || luminance(candidate.hexColors[0] || "#000") < 90;
      if (
        (formality === "business" ||
          formality === "formal" ||
          style.includes("quiet")) &&
        isDark
      ) {
        return 3;
      }
      if (
        /stone|khaki|beige|cream/.test(candidate.colors.join(" ").toLowerCase())
      ) {
        return formality === "casual" || formality === "smart_casual" ? 1 : -4;
      }
    }
    return 0;
  }

  let score = 0;
  for (const piece of already) {
    if (
      formalityRank(formality) >= 3 &&
      candidate.formality === "casual" &&
      piece.formality !== "casual"
    ) {
      score -= 4;
    }
    const a = luminance(candidate.hexColors[0] || "#888");
    const b = luminance(piece.hexColors[0] || "#888");
    if (Math.abs(a - b) < 70) score += 1;
    else if (
      piece.category === "top" &&
      candidate.category === "bottom" &&
      a < 80 &&
      b > 180
    )
      score += 2;
    else if (
      piece.category === "top" &&
      candidate.category === "bottom" &&
      a > 140 &&
      b > 180
    )
      score -= 3;
  }
  return score;
}

function luminance(hex: string): number {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  } catch {
    return 128;
  }
}

export interface SuggestInput {
  wardrobe: Garment[];
  weather: WeatherSnapshot;
  occasion: string;
  style?: string;
  excludeIds?: string[];
  swapCategory?: Garment["category"];
  currentOutfit?: Garment[];
  forceGarmentId?: string;
  profile?: OccasionProfile;
  taste?: TasteMemory;
}

/** Pick best look from the user's wardrobe only — never invents pieces. */
export function suggestOutfit(input: SuggestInput): Outfit {
  const profile =
    input.profile || inferOccasionProfile(input.occasion, input.style);
  const style =
    input.style ||
    input.taste?.preferredStyle ||
    profile.styleHints[0] ||
    "quiet luxury";
  const formality = profile.formality;
  const exclude = new Set([...(input.excludeIds || [])]);

  const pool = input.wardrobe.filter((g) => !exclude.has(g.id));
  const byCat = (cat: Garment["category"]) =>
    pool.filter((g) => g.category === cat);

  let selected: Garment[] = [];

  if (input.forceGarmentId && input.currentOutfit?.length) {
    const forced = input.wardrobe.find((g) => g.id === input.forceGarmentId);
    if (forced) {
      selected = input.currentOutfit.filter(
        (g) => g.category !== forced.category
      );
      selected.push(forced);
    } else {
      selected = [...(input.currentOutfit || [])];
    }
  } else if (input.swapCategory && input.currentOutfit?.length) {
    selected = input.currentOutfit.filter(
      (g) => g.category !== input.swapCategory
    );
    const replacement = pickBest(
      byCat(input.swapCategory).filter(
        (g) => !input.currentOutfit?.some((c) => c.id === g.id)
      ),
      input.weather,
      style,
      formality,
      selected,
      profile,
      input.taste
    );
    if (replacement) selected.push(replacement);
    else selected = input.currentOutfit;
  } else {
    const wantDress =
      profile.preferCategories.includes("dress") ||
      formalityRank(formality) >= 4;
    const dress = pickBest(
      byCat("dress"),
      input.weather,
      style,
      formality,
      [],
      profile,
      input.taste
    );
    if (dress && wantDress && formalityRank(formality) >= 3) {
      selected = [dress];
    } else {
      const top = pickBest(
        byCat("top"),
        input.weather,
        style,
        formality,
        [],
        profile,
        input.taste
      );
      if (top) selected.push(top);
      const bottom = pickBest(
        byCat("bottom"),
        input.weather,
        style,
        formality,
        selected,
        profile,
        input.taste
      );
      if (bottom) selected.push(bottom);
    }
    const outer = pickBest(
      byCat("outerwear"),
      input.weather,
      style,
      formality,
      selected,
      profile,
      input.taste
    );
    if (outer && input.weather.tempC < 18) selected.push(outer);
    const shoes = pickBest(
      byCat("shoes"),
      input.weather,
      style,
      formality,
      selected,
      profile,
      input.taste
    );
    if (shoes) selected.push(shoes);

    const accessories = byCat("accessory");
    const eyewear = pickBest(
      accessories.filter((g) =>
        /glass|frame|optic|sunglass|spec/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      input.weather,
      style,
      formality,
      selected,
      profile,
      input.taste
    );
    const watch = pickBest(
      accessories.filter((g) =>
        /watch|wrist|chrono|time/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      input.weather,
      style,
      formality,
      selected,
      profile,
      input.taste
    );
    const belt = pickBest(
      accessories.filter((g) =>
        /belt|strap/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      input.weather,
      style,
      formality,
      selected,
      profile,
      input.taste
    );
    if (eyewear) selected.push(eyewear);
    if (watch && watch.id !== eyewear?.id) selected.push(watch);
    if (
      belt &&
      belt.id !== eyewear?.id &&
      belt.id !== watch?.id &&
      formalityRank(formality) >= 2
    ) {
      selected.push(belt);
    }
    if (!eyewear && !watch && !belt) {
      const acc = pickBest(
        accessories,
        input.weather,
        style,
        formality,
        selected,
        profile,
        input.taste
      );
      if (acc) selected.push(acc);
    }
  }

  const colors = selected.flatMap((g) => g.hexColors);
  const name = `${style.charAt(0).toUpperCase() + style.slice(1)} for ${profile.label}`;
  const rationale = buildRationale(
    selected,
    input.weather,
    profile,
    style,
    formality,
    colors
  );

  return {
    id: `outfit_${Date.now()}`,
    userId: selected[0]?.userId || "local",
    name,
    occasion: profile.label,
    style,
    garmentIds: selected.map((g) => g.id),
    garments: selected,
    weatherSnapshot: input.weather,
    rationale,
    createdAt: new Date().toISOString(),
  };
}

function buildRationale(
  garments: Garment[],
  weather: WeatherSnapshot,
  profile: OccasionProfile,
  style: string,
  formality: Formality,
  _colors: string[]
) {
  const pieces = garments.map((g) => g.name).join(" + ");
  const why = profile.notes ? ` ${profile.notes}` : "";
  return `${pieces || "Add pieces to your wardrobe"} — ${formality.replace("_", " ")} for ${profile.label} (${Math.round(weather.tempC)}°C, ${weather.condition} in ${weather.location}).${why} Style: ${style}.`;
}

function inferOccasionFromSpeech(t: string): string {
  if (t.includes("birthday")) return "birthday";
  if (t.includes("in-law") || t.includes("inlaw") || t.includes("parent"))
    return "meeting the in-laws";
  if (t.includes("wedding") || t.includes("reception")) return "wedding";
  if (t.includes("interview") || t.includes("board")) return "job interview";
  if (
    t.includes("client") ||
    t.includes("office") ||
    t.includes("work") ||
    t.includes("meeting")
  )
    return "work meeting";
  if (t.includes("date") || t.includes("dinner") || t.includes("restaurant"))
    return "dinner date";
  if (t.includes("brunch") || t.includes("lunch")) return "brunch";
  if (t.includes("gym") || t.includes("workout")) return "gym";
  if (t.includes("travel") || t.includes("flight") || t.includes("airport"))
    return "travel day";
  if (t.includes("party") || t.includes("night out") || t.includes("club"))
    return "night out";
  if (t.includes("funeral") || t.includes("memorial")) return "funeral";
  if (t.includes("church") || t.includes("ceremony")) return "formal ceremony";
  const cleaned = t
    .replace(
      /^(i'm |i am |i have |i've got |today i'm |today i am |going to |heading to )/i,
      ""
    )
    .trim();
  if (cleaned.length > 3 && cleaned.length < 80) return cleaned;
  return "today";
}

export function isHighConfidenceVoiceIntent(transcript: string): boolean {
  const t = transcript.toLowerCase();
  const swapAsk =
    /\b(swap|change|replace|different|another|instead|don't like|dont like)\b/.test(
      t
    );
  const clearSuggest =
    /\b(dress me|outfit for|what should i wear|suggest)\b/.test(t) ||
    /\b(birthday|interview|wedding|dinner|meeting|gym|travel)\b/.test(t);
  const clearNav = /\b(wardrobe|closet|weather|why this|explain)\b/.test(t);
  if (/\b(open|go to|show|connect|photo|settings|billing|add|upload)\b/.test(t))
    return false;
  if (clearNav && !swapAsk) return true;
  if (swapAsk) return true;
  if (clearSuggest && t.length < 90) return true;
  return false;
}

export function parseVoiceIntent(transcript: string) {
  const t = transcript.toLowerCase();

  const shoeAsk =
    /\b(shoe|shoes|boot|boots|loafer|loafers|sneaker|sneakers|footwear|kicks)\b/.test(
      t
    );
  const swapAsk =
    /\b(swap|change|replace|different|another|new|instead|other)\b/.test(t) ||
    t.includes("don't like") ||
    t.includes("dont like");

  if (swapAsk || (shoeAsk && !t.includes("meeting"))) {
    let item = inferCategoryFromSpeech(t) || (shoeAsk ? "shoes" : "bottom");
    if (shoeAsk) item = "shoes";

    let style = "quiet luxury";
    if (t.includes("old money")) style = "old money";
    if (t.includes("street")) style = "streetwear";
    if (t.includes("minimal")) style = "minimal";
    if (t.includes("romantic")) style = "romantic";

    const occasion = inferOccasionFromSpeech(t);

    return {
      transcript,
      intent: "swap_item" as const,
      entities: {
        item,
        style,
        occasion,
        replaceWith: style,
        garmentQuery: transcript,
      },
      reply:
        item === "shoes"
          ? "Swapping your shoes from the wardrobe."
          : `Swapping your ${item} from the wardrobe.`,
      confidence: "high" as const,
    };
  }

  if (t.includes("old money") || t.includes("quiet luxury")) {
    const style = t.includes("old money") ? "old money" : "quiet luxury";
    return {
      transcript,
      intent: "change_style" as const,
      entities: { style },
      reply: `Refining the look to ${style}.`,
      confidence: "high" as const,
    };
  }

  if (t.includes("weather")) {
    return {
      transcript,
      intent: "weather_check" as const,
      entities: {},
      reply: "Here’s the weather for your look.",
      confidence: "high" as const,
    };
  }

  if (
    t.includes("why") &&
    (t.includes("look") || t.includes("outfit") || t.includes("this"))
  ) {
    return {
      transcript,
      intent: "explain_look" as const,
      entities: {},
      reply: "Explaining today’s look.",
      confidence: "high" as const,
    };
  }

  if (t.includes("wardrobe") || t.includes("closet")) {
    return {
      transcript,
      intent: "open_wardrobe" as const,
      entities: {},
      reply: "Opening your wardrobe.",
      confidence: "high" as const,
    };
  }

  const occasion = inferOccasionFromSpeech(t);
  const style = t.includes("old money")
    ? "old money"
    : t.includes("street")
      ? "streetwear"
      : "quiet luxury";

  return {
    transcript,
    intent: "suggest_outfit" as const,
    entities: { occasion, style },
    reply: `Choosing a look for ${occasion} from your wardrobe.`,
    confidence: "medium" as const,
  };
}

export { matchGarmentFromSpeech, inferCategoryFromSpeech };
