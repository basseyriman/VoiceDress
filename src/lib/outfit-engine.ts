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
  parseSwapSpeech,
} from "./garment-match";
import { buildStylingGuide } from "./styling-guide";
import {
  blendStyleHints,
  resolvePrimaryStyle,
} from "./style-options";
import {
  isHosieryOrSocks,
  isRealFootwear,
  ensureLookHasFootwear,
  sanitizeWardrobe,
  isSoftKnitLayer,
  isStructuredOuterwear,
} from "./commerce";
import { matchingSetMate } from "./suit-set";

export type { OccasionProfile, TasteMemory };

const STYLE_PALETTES: Record<string, string[]> = {
  "old money": ["#1a1a1a", "#f5f0e6", "#2c3e2d", "#8b7355", "#c9a87c", "#4a5568"],
  "quiet luxury": ["#0b0b0c", "#e8e4dc", "#5c6b73", "#9a8f7a", "#2f2f2f"],
  streetwear: ["#111111", "#ffffff", "#ef4444", "#3b82f6", "#a3e635"],
  minimal: ["#111111", "#ffffff", "#737373", "#d4d4d4"],
  romantic: ["#f8e8e8", "#7c3a4a", "#d4a5a5", "#2d2a26"],
};

function scoreColorHarmonyForStyle(
  outfitColors: string[],
  style: string
): number {
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

/** Best palette match across the user’s style DNA (not just one label). */
function scoreColorHarmony(
  outfitColors: string[],
  style: string,
  stylePrefs?: string[]
): number {
  const styles = Array.from(
    new Set([style, ...(stylePrefs || [])].filter(Boolean))
  );
  let best = 0;
  for (const s of styles) {
    best = Math.max(best, scoreColorHarmonyForStyle(outfitColors, s));
  }
  return best;
}

/**
 * Bias garment picks toward the looks the user said they resonate with.
 * Occasion still drives formality; DNA steers which pieces feel “them.”
 */
function styleDnaFit(g: Garment, stylePrefs?: string[]): number {
  if (!stylePrefs?.length) return 0;
  const blob =
    `${g.name} ${g.brand} ${g.tags.join(" ")} ${g.fabric || ""} ${g.colors.join(" ")}`.toLowerCase();
  let score = 0;

  for (const pref of stylePrefs) {
    const p = pref.toLowerCase();
    if (
      blob.includes(p) ||
      g.tags.some((t) => t.toLowerCase().includes(p))
    ) {
      score += 3.5;
    }
  }

  const wantsStreet = stylePrefs.some((s) => /street/.test(s));
  const wantsHeritage = stylePrefs.some((s) =>
    /old money|quiet luxury/.test(s)
  );
  const wantsMinimal = stylePrefs.some((s) => /minimal/.test(s));

  if (wantsHeritage && !wantsStreet) {
    if (/street|hoodie|sneaker|distressed|graphic|neon/.test(blob)) score -= 3.5;
    if (/jean|denim/.test(blob) && g.formality === "casual") score -= 2.5;
    if (
      /tailored|oxford|blazer|loafer|wool|cashmere|classic|boardroom|old money|quiet luxury/.test(
        blob
      )
    ) {
      score += 2.5;
    }
  }

  if (wantsStreet && !wantsHeritage) {
    if (/jean|denim|sneaker|hoodie|street|casual/.test(blob)) score += 3;
    if (
      (/blazer|loafer|oxford|overcoat|formal/.test(blob) ||
        g.formality === "formal" ||
        g.formality === "business") &&
      g.category !== "shoes"
    ) {
      score -= 1.5;
    }
  }

  if (wantsMinimal) {
    if (/minimal|clean|simple|plain|white|black|grey|gray|ivory|stone/.test(blob))
      score += 1.5;
    if (/loud|graphic|neon|logo/.test(blob)) score -= 2;
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
  const t = weather.tempC;
  const fabric = (g.fabric || "").toLowerCase();
  const name = g.name.toLowerCase();
  const isCoat =
    g.category === "outerwear" ||
    /coat|overcoat|parka|puffer|wool coat/.test(name);
  const isLightLayer =
    /blazer|overshirt|cardigan|field jacket|denim jacket/.test(name);
  const isKnit = /wool|cashmere|merino|knit|turtleneck/.test(
    `${fabric} ${name}`
  );
  const isAiry = /linen|cotton|camp|short sleeve|tee/.test(`${fabric} ${name}`);

  if (t <= 6) {
    if (isCoat) score += 4;
    if (isKnit) score += 2;
    if (g.season.includes("winter") || g.season.includes("all")) score += 1;
    if (isAiry) score -= 2;
  } else if (t <= 12) {
    if (isCoat) score += 3;
    if (isLightLayer) score += 1;
    if (isKnit) score += 2;
    if (g.season.includes("winter") || g.season.includes("autumn")) score += 1;
  } else if (t <= 16) {
    // Cool dinner / evening — jacket over coat
    if (isLightLayer) score += 3;
    if (isCoat) score += 1;
    if (isKnit) score += 1;
    if (
      g.season.includes("autumn") ||
      g.season.includes("spring") ||
      g.season.includes("all")
    )
      score += 1;
  } else if (t <= 22) {
    if (isCoat) score -= 2;
    if (isLightLayer) score += 1;
    if (isAiry) score += 1;
  } else {
    // Hot weather (>22C / 71F)
    if (isAiry) score += 3;
    // Hard penalty for coats/jackets in hot weather
    if (isCoat || g.category === "outerwear") score -= 20; 
    // Hard penalty for heavy knits / turtlenecks in hot weather
    if (isKnit && !isAiry) score -= 10;
    if (g.season.includes("summer") || g.season.includes("all")) score += 1;
  }
  if (weather.precipChance > 50 && g.category === "shoes") {
    if (name.includes("boot") || fabric.includes("leather")) score += 2;
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

/**
 * Google-stylist style recency: hard-suppress last major garments,
 * softer suppress for shoes/accessories so looks rotate.
 */
function recencyPenalty(g: Garment, taste?: TasteMemory): number {
  const last = taste?.wearLog?.[0];
  if (!last?.garmentIds?.length) return 0;
  if (!last.garmentIds.includes(g.id)) return 0;

  const hours =
    (Date.now() - new Date(last.at).getTime()) / (1000 * 60 * 60);
  // Only apply “yesterday / last look” rules within ~36h
  if (Number.isFinite(hours) && hours > 36) return 0;

  if (g.category === "top" || g.category === "bottom" || g.category === "dress") {
    return -14; // near hard-block; pickBest still falls back if wardrobe is tiny
  }
  if (g.category === "shoes" || g.category === "accessory") {
    return -4;
  }
  if (g.category === "outerwear") return -12;
  return -3;
}

/** Soft demotion so re-asks / weather what-ifs don't freeze on the same look. */
function freshLookPenalty(
  g: Garment,
  demoteIds?: string[],
  demotePenalty = -6
): number {
  if (!demoteIds?.length) return 0;
  return demoteIds.includes(g.id) ? demotePenalty : 0;
}

type ToneBand = "light" | "mid" | "dark";

function toneBand(g: Garment): ToneBand {
  const lum = luminance(g.hexColors[0] || "#888");
  const blob = `${g.colors.join(" ")} ${g.name}`.toLowerCase();
  if (
    lum >= 180 ||
    /white|ivory|cream|stone|beige|khaki|sand|champagne/.test(blob)
  ) {
    return "light";
  }
  if (
    lum <= 90 ||
    /black|charcoal|navy|espresso|ink|indigo|dark/.test(blob)
  ) {
    return "dark";
  }
  return "mid";
}

/** Light+light / dark+dark preferred; washed mid-clash demoted. */
function toneHarmony(top: Garment, bottom: Garment): number {
  const a = toneBand(top);
  const b = toneBand(bottom);
  if (a === "light" && b === "light") return 2.5;
  if (a === "dark" && b === "dark") return 2.2;
  if (a === "light" && b === "dark") return 1.2;
  if (a === "dark" && b === "light") return 0.8;
  if (a === "mid" || b === "mid") return 0.6;
  return 0.3;
}

type MetalTone = "gold" | "silver" | "rose" | "none";

function metalTone(g: Garment): MetalTone {
  const blob =
    `${g.name} ${g.colors.join(" ")} ${g.tags.join(" ")} ${g.fabric || ""}`.toLowerCase();
  if (/rose\s*gold|rosegold|pink gold/.test(blob)) return "rose";
  if (/gold|cognac|brass|champagne|gilt/.test(blob)) return "gold";
  if (/silver|steel|chrome|platinum|white gold|rhodium/.test(blob))
    return "silver";
  const hex = (g.hexColors[0] || "").toLowerCase();
  if (/^#(c9a87c|d4af37|b76e79|c4a484)/.test(hex)) return "gold";
  if (/^#(c0c0c0|a8a8a8|e8e8e8|b0b0b0)/.test(hex)) return "silver";
  return "none";
}

/** Old-money rule: accessory metals should agree (watch, frames, buckle). */
function metalSyncScore(candidate: Garment, already: Garment[]): number {
  if (candidate.category !== "accessory") return 0;
  const mine = metalTone(candidate);
  if (mine === "none") return 0;
  const others = already
    .filter((g) => g.category === "accessory")
    .map(metalTone)
    .filter((m) => m !== "none");
  if (!others.length) return 0.5;
  if (others.every((m) => m === mine)) return 2.5;
  return -5;
}

function scoreGarment(
  g: Garment,
  weather: WeatherSnapshot,
  style: string,
  formality: Formality,
  already: Garment[],
  profile?: OccasionProfile,
  taste?: TasteMemory,
  demoteIds?: string[],
  demotePenalty = -6,
  stylePrefs?: string[]
) {
  let score =
    weatherFit(g, weather) +
    formalityFit(g, formality) +
    scoreColorHarmony(g.hexColors, style, stylePrefs) +
    coherenceWithOutfit(g, already, formality, style) +
    (profile ? profileFit(g, profile) : 0) +
    styleDnaFit(g, stylePrefs) +
    tastePenalty(g, taste) +
    recencyPenalty(g, taste) +
    freshLookPenalty(g, demoteIds, demotePenalty) +
    metalSyncScore(g, already);

  const top = already.find((x) => x.category === "top");
  if (top && g.category === "bottom") {
    score += toneHarmony(top, g);
  }
  const bottom = already.find((x) => x.category === "bottom");
  if (bottom && g.category === "top") {
    score += toneHarmony(g, bottom);
  }

  return score;
}

function pickBest(
  items: Garment[],
  weather: WeatherSnapshot,
  style: string,
  formality: Formality,
  already: Garment[] = [],
  profile?: OccasionProfile,
  taste?: TasteMemory,
  demoteIds?: string[],
  demotePenalty = -6,
  stylePrefs?: string[]
): Garment | null {
  if (!items.length) return null;
  const score = (g: Garment) =>
    scoreGarment(
      g,
      weather,
      style,
      formality,
      already,
      profile,
      taste,
      demoteIds,
      demotePenalty,
      stylePrefs
    );
  const ranked = [...items].sort((a, b) => score(b) - score(a));
  const best = ranked[0]!;
  const topScore = score(best);
  // Among near-ties, rotate so the same dinner date isn’t always identical
  const contenders = ranked
    .filter((g) => score(g) >= topScore - 1.75)
    .slice(0, 3);
  if (contenders.length <= 1) return best;
  return contenders[Math.floor(Math.random() * contenders.length)]!;
}

const SPOKEN_TEMP_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  "twenty one": 21,
  "twenty two": 22,
  "twenty three": 23,
  "twenty four": 24,
  "twenty five": 25,
};

/** Pull a spoken / hypothetical temperature from voice ("16 degrees", "feeling cold"). */
export function parseSpokenWeather(transcript: string): {
  tempC: number;
  label: string;
  hypothetical: boolean;
} | null {
  const t = transcript.toLowerCase();
  const hypothetical =
    /\b(what if|if it (was|were|is)|suppose|imagine|say it('?s| is)|around)\b/.test(
      t
    );

  const num = t.match(
    /(\d{1,2}(?:\.\d)?)\s*(°|degrees?|celsius|centigrade|\bc\b)/i
  );
  if (num) {
    const tempC = Math.round(Number(num[1]));
    if (!Number.isNaN(tempC) && tempC >= -10 && tempC <= 45) {
      return {
        tempC,
        label: `${tempC}°C`,
        hypothetical,
      };
    }
  }

  for (const [word, tempC] of Object.entries(SPOKEN_TEMP_WORDS)) {
    if (
      new RegExp(`\\b${word}\\s*(degrees?|celsius|°)?\\b`).test(t) &&
      (hypothetical || /\bdegrees?\b/.test(t) || /\b°/.test(t))
    ) {
      return { tempC, label: `${tempC}°C`, hypothetical: true };
    }
  }

  if (/\b(freezing|freezing cold|bitter cold)\b/.test(t)) {
    return { tempC: 2, label: "freezing", hypothetical };
  }
  if (/\b(feeling cold|i('?m| am) cold|so cold|really cold|quite cold)\b/.test(t)) {
    return { tempC: 7, label: "cold", hypothetical };
  }
  if (/\b(chilly|cool out|a bit cold|cooler)\b/.test(t)) {
    return { tempC: 12, label: "chilly", hypothetical };
  }
  if (/\b(feeling hot|i('?m| am) hot|sweltering|heatwave)\b/.test(t)) {
    return { tempC: 28, label: "hot", hypothetical };
  }
  if (/\b(feeling warm|too warm|muggy)\b/.test(t)) {
    return { tempC: 24, label: "warm", hypothetical };
  }

  return null;
}

export function applySpokenWeather(
  base: WeatherSnapshot,
  spoken: ReturnType<typeof parseSpokenWeather>
): WeatherSnapshot {
  if (!spoken) return base;
  return {
    ...base,
    tempC: spoken.tempC,
    condition: spoken.hypothetical
      ? `as if ${spoken.label}`
      : `${spoken.label}, ${base.condition}`,
  };
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
  const blobOf = (g: Garment) =>
    `${g.name} ${g.brand} ${(g.tags || []).join(" ")}`.toLowerCase();
  const isCasualTee = (g: Garment) =>
    g.category === "top" &&
    /\b(t-?shirt|tee|graphic|basic\s*t)\b/.test(blobOf(g));
  const isSuitPiece = (g: Garment) =>
    Boolean(g.setId) ||
    /\b(suit|double[- ]?breast|blazer|tuxedo|suit\s*trousers|matching\s*suit)\b/.test(
      blobOf(g)
    );

  for (const piece of already) {
    // Hard veto: two soft knits in one look (sweater under sweater)
    if (
      isSoftKnitLayer(candidate) &&
      isSoftKnitLayer(piece) &&
      (candidate.category === "outerwear" ||
        piece.category === "outerwear" ||
        candidate.category === "top" ||
        piece.category === "top")
    ) {
      score -= 20;
    }
    // Hard veto: basic tee + suit / double-breasted (travel-day disaster)
    if (
      (isCasualTee(candidate) && isSuitPiece(piece)) ||
      (isCasualTee(piece) && isSuitPiece(candidate))
    ) {
      score -= 24;
    }
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
  /** Looks the user resonates with — drives DNA-aware scoring. */
  stylePrefs?: string[];
  excludeIds?: string[];
  /** Soft-demote these ids so a re-ask can produce a different look. */
  demoteIds?: string[];
  /** Penalty applied to demoteIds (default -6). Use a larger negative when the occasion changes. */
  demotePenalty?: number;
  swapCategory?: Garment["category"];
  /** When set with swapCategory, remove this exact piece (not every item in the category). */
  replaceGarmentId?: string;
  currentOutfit?: Garment[];
  forceGarmentId?: string;
  profile?: OccasionProfile;
  taste?: TasteMemory;
}

/** True when the new ask is a meaningfully different event than the last look. */
export function occasionMeaningfullyChanged(
  previous?: string | null,
  next?: string | null
): boolean {
  if (!previous || !next) return false;
  const a = previous.toLowerCase().trim();
  const b = next.toLowerCase().trim();
  if (a === b) return false;
  const pa = inferOccasionProfile(a);
  const pb = inferOccasionProfile(b);
  if (pa.formality !== pb.formality) return true;
  const markers = [
    "wedding",
    "dinner",
    "date",
    "interview",
    "office",
    "work",
    "gym",
    "travel",
    "party",
    "funeral",
    "brunch",
    "birthday",
  ];
  for (const m of markers) {
    if (a.includes(m) !== b.includes(m)) return true;
  }
  return a.slice(0, 24) !== b.slice(0, 24);
}

/** Pick best look from the user's wardrobe only — never invents pieces. */
export function suggestOutfit(input: SuggestInput): Outfit {
  const stylePrefs = input.stylePrefs?.length
    ? input.stylePrefs
    : undefined;
  const baseProfile =
    input.profile ||
    inferOccasionProfile(
      input.occasion,
      resolvePrimaryStyle(stylePrefs, input.style)
    );
  const profile: OccasionProfile = {
    ...baseProfile,
    styleHints: blendStyleHints(stylePrefs, baseProfile.styleHints),
  };
  // Live guard: fix socks-as-shoes and other mis-tags before scoring
  const wardrobe = sanitizeWardrobe(input.wardrobe);
  const currentOutfit = input.currentOutfit
    ? sanitizeWardrobe(input.currentOutfit)
    : undefined;
  // DNA first — do not let last outfit / occasion defaults erase what they chose
  const style = resolvePrimaryStyle(stylePrefs, input.style);
  const formality = profile.formality;
  const exclude = new Set([...(input.excludeIds || [])]);
  const demotePenalty = input.demotePenalty ?? -6;
  const demote = input.demoteIds;

  // Hard-block yesterday’s major pieces when the wardrobe has alternatives
  if (!input.forceGarmentId && !input.swapCategory) {
    const lastIds = new Set(input.taste?.wearLog?.[0]?.garmentIds || []);
    const lastAt = input.taste?.wearLog?.[0]?.at;
    const hours = lastAt
      ? (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60)
      : 999;
    if (lastIds.size && hours <= 36) {
      for (const cat of ["top", "bottom", "dress"] as const) {
        const inCat = wardrobe.filter((g) => g.category === cat);
        const fresh = inCat.filter((g) => !lastIds.has(g.id));
        if (fresh.length >= 1) {
          for (const g of inCat) {
            if (lastIds.has(g.id)) exclude.add(g.id);
          }
        }
      }
    }
  }

  const pool = wardrobe.filter((g) => !exclude.has(g.id));
  const byCat = (cat: Garment["category"]) =>
    pool.filter((g) => g.category === cat);

  const pick = (
    items: Garment[],
    already: Garment[] = []
  ): Garment | null =>
    pickBest(
      items,
      input.weather,
      style,
      formality,
      already,
      profile,
      input.taste,
      demote,
      demotePenalty,
      stylePrefs
    );

  let selected: Garment[] = [];

  if (input.forceGarmentId && currentOutfit?.length) {
    const forced = wardrobe.find((g) => g.id === input.forceGarmentId);
    if (forced) {
      // Replace only one piece of that category (keep other accessories)
      const replaceId =
        input.replaceGarmentId ||
        input.demoteIds?.[0] ||
        currentOutfit.find((g) => g.category === forced.category)?.id;
      selected = replaceId
        ? currentOutfit.filter((g) => g.id !== replaceId)
        : currentOutfit.filter((g) => g.category !== forced.category);
      if (!selected.some((g) => g.id === forced.id)) selected.push(forced);
    } else {
      selected = [...currentOutfit];
    }
  } else if (input.swapCategory && currentOutfit?.length) {
    const replaceId =
      input.replaceGarmentId ||
      input.demoteIds?.[0] ||
      currentOutfit.find((g) => g.category === input.swapCategory)?.id;
    selected = replaceId
      ? currentOutfit.filter((g) => g.id !== replaceId)
      : currentOutfit.filter((g) => g.category !== input.swapCategory);
    const swapPool =
      input.swapCategory === "shoes"
        ? byCat("shoes").filter((g) => isRealFootwear(g))
        : byCat(input.swapCategory);
    const replacement = pick(
      swapPool.filter((g) => !currentOutfit.some((c) => c.id === g.id)),
      selected
    );
    if (replacement) selected.push(replacement);
    else selected = currentOutfit;
  } else {
    const dressPool = byCat("dress");
    const dress = pick(dressPool, []);
    const top = pick(byCat("top"), []);
    const bottom = pick(byCat("bottom"), top ? [top] : []);
    const dressFriendly =
      profile.preferCategories.includes("dress") ||
      formalityRank(formality) >= 4 ||
      stylePrefs?.some((s) => /romantic/i.test(s)) ||
      /wedding|party|brunch|dinner|date|cocktail|gala|black.?tie|ceremony|graduation|church|anniversary|birthday/i.test(
        `${profile.label} ${input.occasion || ""}`
      );
    // Prefer a dress when the wardrobe has one and the occasion fits —
    // or when separates aren't available. Men with only shirts/trousers still win via scoring.
    const preferDress =
      !!dress &&
      (profile.preferCategories.includes("dress") ||
        (dressFriendly && formalityRank(formality) >= 2) ||
        (!top && !bottom) ||
        (dressFriendly && !bottom));

    if (preferDress && dress) {
      selected = [dress];
    } else {
      if (top) selected.push(top);
      if (bottom) selected.push(bottom);
      if (!selected.length && dress) selected = [dress];
    }
    const outerPool = byCat("outerwear").filter((g) => !isSoftKnitLayer(g));
    const topIsKnit = selected.some(
      (g) => g.category === "top" && isSoftKnitLayer(g)
    );
    // Never stack sweater + sweater. Over a knit top, only structured jackets.
    const outerCandidates = topIsKnit
      ? outerPool.filter((g) => isStructuredOuterwear(g))
      : outerPool;
    // Mild formal / quiet luxury: prefer blazer over heavy coat or soft cardigan
    const mildFormal =
      input.weather.tempC > 18 && formalityRank(formality) >= 3;
    const quietDressy =
      /quiet|old money|dinner|date|business/i.test(
        `${profile.label} ${style} ${input.occasion || ""}`
      ) || formalityRank(formality) >= 3;
    const lightOuter = (mildFormal || quietDressy
      ? outerCandidates.filter(
          (g) =>
            /blazer|sport\s*coat|suit\s*jacket|jacket/i.test(
              `${g.name} ${(g.tags || []).join(" ")}`
            ) || !/overcoat|parka|puffer|wool coat/i.test(g.name)
        )
      : outerCandidates
    ).filter((g) => !isSoftKnitLayer(g));
    const outer = pick(
      lightOuter.length ? lightOuter : outerCandidates,
      selected
    );
    // Weather layers when cool; dressier events keep a blazer/coat even when mild.
    // Smart-casual parties only add outerwear when cooler so one navy blazer
    // doesn’t stick on every mild suggestion.
    const wantOuterForOccasion =
      formalityRank(formality) >= 3 ||
      profile.preferCategories.includes("outerwear");
    const coolForOuter =
      formalityRank(formality) <= 2
        ? input.weather.tempC < 15
        : input.weather.tempC < 19;
    // Skip outer entirely if the only options would double up soft knits
    if (
      outer &&
      !isSoftKnitLayer(outer) &&
      (coolForOuter || wantOuterForOccasion)
    ) {
      selected.push(outer);
    }

    // Suit sets: matching jacket+trousers only when the look is dressy enough.
    // Never force a cream suit onto a travel tee / casual top.
    const selectedTop = selected.find((g) => g.category === "top");
    const topTooCasualForSuit =
      !!selectedTop &&
      (selectedTop.formality === "casual" ||
        /\b(t-?shirt|tee|graphic|hoodie|polo)\b/i.test(
          `${selectedTop.name} ${(selectedTop.tags || []).join(" ")}`
        ));
    const allowSuitSet =
      formalityRank(formality) >= 3 &&
      !topTooCasualForSuit &&
      !/travel|flight|airport|gym|workout/i.test(
        `${profile.label} ${input.occasion || ""}`
      );

    const selectedOuter = selected.find((g) => g.category === "outerwear");
    if (
      allowSuitSet &&
      selectedOuter?.setId &&
      selectedOuter.setRole === "jacket"
    ) {
      const mate = matchingSetMate(selectedOuter, wardrobe);
      if (mate && mate.category === "bottom") {
        const otherBottom = selected.find((g) => g.category === "bottom");
        if (!otherBottom) {
          selected.push(mate);
        } else if (otherBottom.setId !== selectedOuter.setId) {
          selected = selected.map((g) =>
            g.category === "bottom" ? mate : g
          );
        }
      }
    } else if (allowSuitSet) {
      // Trousers-only path: auto-add jacket only when formal.
      const selectedBottom = selected.find((g) => g.category === "bottom");
      if (
        selectedBottom?.setRole === "trousers" &&
        selectedBottom.setId &&
        !selected.some((g) => g.category === "outerwear") &&
        formalityRank(formality) >= 3
      ) {
        const mate = matchingSetMate(selectedBottom, wardrobe);
        if (mate && mate.category === "outerwear") selected.push(mate);
      }
    } else if (
      // Drop suit halves that snuck in with a casual top / travel day
      topTooCasualForSuit ||
      /travel|flight|airport/i.test(`${profile.label} ${input.occasion || ""}`)
    ) {
      const isSuitHalf = (g: Garment) =>
        Boolean(g.setId) ||
        /\b(suit|double[- ]?breast|matching\s*suit)\b/i.test(
          `${g.name} ${(g.tags || []).join(" ")}`
        );
      selected = selected.filter((g) => {
        if (!isSuitHalf(g)) return true;
        // Keep non-apparel suit mis-tags out of top/shoes; strip jacket + trousers
        return g.category !== "outerwear" && g.category !== "bottom";
      });
      // If we stripped the bottom, put back a non-suit bottom
      if (!selected.some((g) => g.category === "bottom")) {
        const casualBottom = pick(
          byCat("bottom").filter((g) => !isSuitHalf(g)),
          selected
        );
        if (casualBottom) selected.push(casualBottom);
      }
    }

    const shoes = pick(
      byCat("shoes").filter((g) => isRealFootwear(g)),
      selected
    );
    if (shoes) selected.push(shoes);

    const accessories = byCat("accessory").filter(
      (g) => !isHosieryOrSocks(g)
    );
    const eyewear = pick(
      accessories.filter((g) =>
        /glass|frame|optic|sunglass|spec/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      selected
    );
    const watch = pick(
      accessories.filter((g) =>
        /watch|wrist|chrono|time/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      selected
    );
    const jewelry = pick(
      accessories.filter((g) =>
        /necklace|bracelet|earring|jewelry|jewellery|ring\b/i.test(
          `${g.name} ${g.tags.join(" ")}`
        )
      ),
      selected
    );
    const belt = pick(
      accessories.filter((g) =>
        /belt|strap/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      selected
    );
    if (eyewear) selected.push(eyewear);
    if (watch && watch.id !== eyewear?.id) selected.push(watch);
    // Dress / romantic looks: jewelry before belt
    const wearingDress = selected.some((g) => g.category === "dress");
    if (
      jewelry &&
      jewelry.id !== eyewear?.id &&
      jewelry.id !== watch?.id &&
      (wearingDress || formalityRank(formality) >= 2)
    ) {
      selected.push(jewelry);
    }
    if (
      belt &&
      !wearingDress &&
      belt.id !== eyewear?.id &&
      belt.id !== watch?.id &&
      belt.id !== jewelry?.id &&
      formalityRank(formality) >= 2
    ) {
      selected.push(belt);
    }
    if (!eyewear && !watch && !belt && !jewelry) {
      const acc = pick(accessories, selected);
      if (acc) selected.push(acc);
    }

    // Bags only when the style profile asks for them — never force a clutch
    // from a dress product shot into every look.
    if (profile.preferCategories.includes("bag")) {
      const bag = pick(byCat("bag"), selected);
      if (bag) selected.push(bag);
    }
  }

  // Final live guard: every look gets real shoes when the wardrobe has them.
  // Never run this on surgical swaps — it was rewriting shoes mid-swap.
  if (!input.swapCategory && !input.forceGarmentId && !input.replaceGarmentId) {
    selected = ensureLookHasFootwear(selected, wardrobe, (pool, already) =>
      pick(pool, already)
    );
  }

  const colors = selected.flatMap((g) => g.hexColors);
  const name = `${style.charAt(0).toUpperCase() + style.slice(1)} for ${profile.label}`;
  const styling = buildStylingGuide({
    garments: selected,
    weather: input.weather,
    formality,
    style,
    occasion: profile.label,
    varietySeed: Date.now() % 11,
  });
  const rationale = buildRationale(
    selected,
    input.weather,
    profile,
    style,
    formality,
    colors,
    styling.steps
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
    stylingSteps: styling.steps,
    stylingGuide: styling.spoken,
    stylingTryOnPrompt: styling.tryOnPrompt,
    createdAt: new Date().toISOString(),
  };
}

function buildRationale(
  garments: Garment[],
  weather: WeatherSnapshot,
  profile: OccasionProfile,
  style: string,
  formality: Formality,
  _colors: string[],
  stylingSteps?: string[]
) {
  const pieces = garments.map((g) => g.name).join(" + ");
  const why = profile.notes ? ` ${profile.notes}` : "";
  const how =
    stylingSteps && stylingSteps.length
      ? ` How to wear it: ${stylingSteps.slice(0, -1).join(" — ")}.`
      : "";
  return `${pieces || "Add pieces to your wardrobe"} — ${formality.replace("_", " ")} for ${profile.label} (${Math.round(weather.tempC)}°C, ${weather.condition} in ${weather.location}).${why} Style: ${style}.${how}`;
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
  if (
    /\b(drinks?|pub|cocktail|wine bar|bar crawl)\b/.test(t) ||
    (/\bfriends\b/.test(t) &&
      /\b(drink|drinks|pub|bar|out|going|meet)\b/.test(t))
  ) {
    return "drinks with friends";
  }
  if (t.includes("funeral") || t.includes("memorial")) return "funeral";
  if (t.includes("church") || t.includes("ceremony")) return "formal ceremony";

  // Weather / what-if questions are not occasions
  if (
    /\b(what if|degrees|°|feeling cold|feeling hot|suggest|what would you wear)\b/.test(
      t
    ) &&
    !/\b(birthday|wedding|dinner|date|meeting|interview|gym|travel|party|drinks?|pub)\b/.test(
      t
    )
  ) {
    return "today";
  }

  const cleaned = t
    .replace(
      /^(i'm |i am |i have |i've got |today i'm |today i am |going to |heading to )/i,
      ""
    )
    .replace(
      /\b(if it (was|were|is)|what if|suggest|what would you( suggest| wear)?|can you help me( pick| choose)?|pick (an |a )?outfit|from my (wardrobe|closet)|feeling cold|feeling hot|\d+\s*degrees?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 3 && cleaned.length < 80) return cleaned;
  return "today";
}

export function isHighConfidenceVoiceIntent(transcript: string): boolean {
  const t = transcript.toLowerCase();
  // Conversational follow-ups need the stylist LLM — never keyword-shortcut them
  if (isOutfitConversation(transcript)) return false;

  const swapAsk =
    /\b(swap|change|replace|different|another|instead|don't like|dont like)\b/.test(
      t
    ) && !isOutfitConversation(transcript);
  const wantsOutfit = wantsOutfitSuggestion(t);
  const clearSuggest =
    wantsOutfit ||
    /\b(birthday|interview|wedding|dinner|meeting|gym|travel|drinks?|drink|pub|bar)\b/.test(
      t
    ) ||
    /\b(feeling cold|feeling hot|degrees|°)\b/.test(t);
  const weatherOnly = isWeatherOnlyAsk(transcript);
  const clearNav =
    weatherOnly ||
    (/\b(why this|explain (this |the |my )?(look|outfit))\b/.test(t) &&
      !wantsOutfit) ||
    (wantsOpenWardrobe(t) && !wantsOutfit);
  if (
    /\b(go to|connect|photo|settings|billing|add|upload)\b/.test(t) &&
    !wantsOutfit
  )
    return false;
  if (clearNav && !swapAsk) return true;
  if (swapAsk && !/\b(too |thick|belt|sock|stocking|should i|what about)\b/.test(t))
    return true;
  if (clearSuggest && t.length < 200) return true;
  return false;
}

/**
 * Follow-up chat about the current look (fabric vs weather, belt, confidence…)
 * — not a fresh occasion suggest, and not a weather dump.
 */
export function isOutfitConversation(transcript: string): boolean {
  const t = transcript.toLowerCase().trim();
  if (!t) return false;
  // Fresh occasion / dress-me asks are suggestions, not chat
  if (wantsOutfitSuggestion(t)) return false;
  // "I'm going for drinks/dinner…" must dress a look — not open look-chat
  if (
    /^i('?m| am)\b/.test(t) &&
    /\b(going|heading|off to|have (a |an )?|meeting|drinks?|drink|dinner|wedding|travel|party|date|brunch)\b/.test(
      t
    )
  ) {
    return false;
  }
  if (
    /\b(going|heading|off to|wedding|dinner|interview|meeting|drinks?|date)\b/.test(
      t
    ) &&
    /\b(what|wear|outfit|suggest|pick|help|should i)\b/.test(t)
  ) {
    return false;
  }
  // Weather what-ifs should re-suggest, not chat
  if (parseSpokenWeather(t) || /\b(what if|feeling cold|feeling hot|degrees|°)\b/.test(t)) {
    return false;
  }
  if (wantsOpenWardrobe(t)) return false;
  if (isWeatherOnlyAsk(t)) return false;

  return (
    /\?/.test(t) ||
    /^(why|how|what|which|is|are|should|can|do|does|will|would|am i)\b/.test(
      t
    ) ||
    // "I'm unsure / I'm wearing…" follow-ups — not "I'm going out"
    (/^i('?m| am)\b/.test(t) &&
      /\b(unsure|not sure|thinking|wondering|wearing|tucking|worried|confident)\b/.test(
        t
      )) ||
    /\b(too (thick|thin|hot|cold|warm|much|dressy|casual)|thick|heavy|light enough|for the weather|what about|should i|do i (need|wear|put|tuck)|am i (tuck|wearing)|tuck(ing|ed)?|untuck|shirt|belt|sock|stockings?|tights|tie|confident|sure about|keep the|swap the|change the|instead of|how (do|should|to) (i )?wear|sleeve|button|layer)\b/.test(
      t
    )
  );
}

/**
 * When a look is already on screen, prefer stylist chat for how-to-wear follow-ups
 * (tuck, belt, fabric) so we never dump weather or re-roll the outfit.
 */
export function shouldPreferOutfitChat(
  transcript: string,
  hasLook: boolean
): boolean {
  if (!hasLook) return false;
  const t = transcript.toLowerCase().trim();
  if (!t) return false;
  if (isWeatherOnlyAsk(t)) return false;
  if (wantsOpenWardrobe(t)) return false;
  if (
    wantsOutfitSuggestion(t) &&
    /\b(going|heading|off to|wedding|dinner|interview|meeting|drinks?|birthday)\b/.test(
      t
    )
  ) {
    return false;
  }
  if (isOutfitConversation(t)) return true;
  // Don't steal weather what-ifs or occasion asks into chat
  if (parseSpokenWeather(t) || wantsOutfitSuggestion(t)) return false;
  return /\b(tuck|untuck|shirt|oxford|knit|rib|trouser|belt|sock|stocking|sleeve|hem|button|layer|how to wear|wear it|this look|the look)\b/.test(
    t
  );
}

/** True when the user is asking for a look, not just browsing pieces. */
export function wantsOutfitSuggestion(t: string): boolean {
  const s = t.toLowerCase();
  return (
    /\b(dress me|outfit for|what should i wear|suggest|what would you|pick (an |a |my )?outfit|help me (pick|choose|find)|choose (an |a )?outfit|recommend (an |a )?outfit|put (me )?together|style me)\b/.test(
      s
    ) ||
    (/\b(outfit|look|wear|dress)\b/.test(s) &&
      /\b(help|pick|choose|suggest|recommend|from (my )?(wardrobe|closet)|for (a |the |my )?)\b/.test(
        s
      )) ||
    (/\b(going|heading|off to|i('?m| am) going)\b/.test(s) &&
      /\b(wear|outfit|dress|look|clothes|wardrobe|closet)\b/.test(s)) ||
    // Natural occasion speech: "I'm going for a drink with friends"
    (/\b(going|heading|off to|i('?m| am) going|i have (a |an )?)\b/.test(s) &&
      /\b(drink|drinks|dinner|meeting|wedding|travel|party|date|brunch|interview|work|pub|bar)\b/.test(
        s
      ))
  );
}

/** Navigate to wardrobe only when they clearly want the page, not a suggestion. */
export function wantsOpenWardrobe(t: string): boolean {
  const s = t.toLowerCase();
  if (wantsOutfitSuggestion(s)) return false;
  if (
    /\b(outfit|wear|suggest|pick|dinner|wedding|drinks?|date|meeting)\b/.test(s)
  ) {
    return false;
  }
  if (
    /\b(open|show|go to|take me to|see)\b/.test(s) &&
    /\b(wardrobe|closet)\b/.test(s)
  ) {
    return true;
  }
  return (
    /^(open |show )?(my )?(wardrobe|closet)\.?$/.test(s.trim()) ||
    s.trim() === "wardrobe" ||
    s.trim() === "closet"
  );
}

export function isWeatherOnlyAsk(transcript: string): boolean {
  const t = transcript.toLowerCase();
  return (
    /\b(what('?s| is) the weather|how('?s| is) the weather|weather (today|like|outside|report)|check (the )?weather|tell me the weather)\b/.test(
      t
    ) || /^\s*weather\s*\.?$/.test(t)
  );
}

export function parseVoiceIntent(transcript: string) {
  const t = transcript.toLowerCase();
  const spokenWeather = parseSpokenWeather(transcript);

  const shoeAsk =
    /\b(shoe|shoes|boot|boots|loafer|loafers|sneaker|sneakers|footwear|kicks|heels?|pumps?|flats?|sandals?|wedges?|mules?|stilettos?)\b/.test(
      t
    );
  const swapAsk =
    /\b(swap|change|replace|different|another|instead|don't like|dont like)\b/.test(
      t
    );
  // Only treat footwear as a swap when they clearly want a different pair
  const shoeSwap =
    shoeAsk &&
    (swapAsk ||
      /\b(swap|change|different|other|new)\s+(the\s+)?(shoe|shoes|boot|boots|heels?|pumps?|flats?)\b/.test(
        t
      ) ||
      /\b(shoe|shoes|boot|boots|heels?|pumps?|flats?)\b.*\b(swap|change|different|don't like|dont like)\b/.test(
        t
      ));

  if (swapAsk || shoeSwap) {
    const swap = parseSwapSpeech(transcript);
    let item =
      swap.category ||
      inferCategoryFromSpeech(t) ||
      (shoeAsk ? "shoes" : "bottom");
    if (shoeAsk && shoeSwap) item = "shoes";

    let style: string | undefined;
    if (t.includes("old money")) style = "old money";
    else if (t.includes("street")) style = "streetwear";
    else if (t.includes("minimal")) style = "minimal";
    else if (t.includes("romantic")) style = "romantic";
    else if (t.includes("quiet luxury")) style = "quiet luxury";

    const occasion = inferOccasionFromSpeech(t);

    return {
      transcript,
      intent: "swap_item" as const,
      entities: {
        item,
        style,
        occasion,
        replaceWith: style,
        // Target only — never the full sentence (that matches the worn piece)
        garmentQuery: swap.targetQuery || swap.sourceQuery || transcript,
        sourceQuery: swap.sourceQuery,
        tempC: spokenWeather?.tempC,
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
      entities: { style, tempC: spokenWeather?.tempC },
      reply: `Refining the look to ${style}.`,
      confidence: "high" as const,
    };
  }

  const weatherOnlyAsk = isWeatherOnlyAsk(transcript);
  if (weatherOnlyAsk) {
    return {
      transcript,
      intent: "weather_check" as const,
      entities: {},
      reply: "Here’s the weather for your look.",
      confidence: "high" as const,
    };
  }

  // Stylist conversation about the current look (before generic suggest)
  if (isOutfitConversation(transcript)) {
    return {
      transcript,
      intent: "chat_look" as const,
      entities: {},
      reply: "Talking through the look with you.",
      confidence: "medium" as const,
    };
  }

  if (
    t.includes("why") &&
    (t.includes("look") ||
      t.includes("outfit") ||
      t.includes("this") ||
      t.includes("suggest") ||
      t.includes("choose") ||
      t.includes("pick") ||
      t.includes("dress"))
  ) {
    return {
      transcript,
      intent: "explain_look" as const,
      entities: {},
      reply: "Explaining today’s look.",
      confidence: "high" as const,
    };
  }

  if (wantsOpenWardrobe(t)) {
    return {
      transcript,
      intent: "open_wardrobe" as const,
      entities: {},
      reply: "Opening your wardrobe.",
      confidence: "high" as const,
    };
  }

  const occasion = inferOccasionFromSpeech(t);
  // Only set style when they said it — otherwise DNA from onboarding/settings wins
  const style = t.includes("old money")
    ? "old money"
    : t.includes("street")
      ? "streetwear"
      : t.includes("minimal")
        ? "minimal"
        : t.includes("quiet luxury")
          ? "quiet luxury"
          : undefined;
  const tempNote = spokenWeather
    ? spokenWeather.hypothetical
      ? ` as if it were ${spokenWeather.label}`
      : ` for ${spokenWeather.label} conditions`
    : "";

  return {
    transcript,
    intent: "suggest_outfit" as const,
    entities: {
      occasion,
      style,
      tempC: spokenWeather?.tempC,
      weatherLabel: spokenWeather?.label,
      freshLook: Boolean(
        spokenWeather ||
          /\b(what if|another|different|instead|again)\b/.test(t)
      ),
    },
    reply: `Of course — let's get you right for ${occasion}${tempNote}.`,
    confidence: "high" as const,
  };
}

export {
  matchGarmentFromSpeech,
  inferCategoryFromSpeech,
  parseSwapSpeech,
  isClearPieceSwap,
} from "./garment-match";
