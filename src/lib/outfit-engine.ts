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
import { buildStylingGuide } from "./styling-guide";
import {
  blendStyleHints,
  resolvePrimaryStyle,
} from "./style-options";

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
    if (isAiry) score += 3;
    if (isCoat) score -= 4;
    if (isKnit && !isAiry) score -= 1;
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

/** Soft demotion so re-asks / weather what-ifs don't freeze on the same look. */
function freshLookPenalty(
  g: Garment,
  demoteIds?: string[],
  demotePenalty = -6
): number {
  if (!demoteIds?.length) return 0;
  return demoteIds.includes(g.id) ? demotePenalty : 0;
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
  return (
    weatherFit(g, weather) +
    formalityFit(g, formality) +
    scoreColorHarmony(g.hexColors, style, stylePrefs) +
    coherenceWithOutfit(g, already, formality, style) +
    (profile ? profileFit(g, profile) : 0) +
    styleDnaFit(g, stylePrefs) +
    tastePenalty(g, taste) +
    freshLookPenalty(g, demoteIds, demotePenalty)
  );
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
  /** Looks the user resonates with — drives DNA-aware scoring. */
  stylePrefs?: string[];
  excludeIds?: string[];
  /** Soft-demote these ids so a re-ask can produce a different look. */
  demoteIds?: string[];
  /** Penalty applied to demoteIds (default -6). Use a larger negative when the occasion changes. */
  demotePenalty?: number;
  swapCategory?: Garment["category"];
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
  // DNA first — do not let last outfit / occasion defaults erase what they chose
  const style = resolvePrimaryStyle(stylePrefs, input.style);
  const formality = profile.formality;
  const exclude = new Set([...(input.excludeIds || [])]);
  const demotePenalty = input.demotePenalty ?? -6;
  const demote = input.demoteIds;

  const pool = input.wardrobe.filter((g) => !exclude.has(g.id));
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
    const replacement = pick(
      byCat(input.swapCategory).filter(
        (g) => !input.currentOutfit?.some((c) => c.id === g.id)
      ),
      selected
    );
    if (replacement) selected.push(replacement);
    else selected = input.currentOutfit;
  } else {
    const wantDress =
      profile.preferCategories.includes("dress") ||
      formalityRank(formality) >= 4;
    const dress = pick(byCat("dress"), []);
    if (dress && wantDress && formalityRank(formality) >= 3) {
      selected = [dress];
    } else {
      const top = pick(byCat("top"), []);
      if (top) selected.push(top);
      const bottom = pick(byCat("bottom"), selected);
      if (bottom) selected.push(bottom);
    }
    const outerPool = byCat("outerwear");
    // Mild formal events: prefer a blazer/jacket over a heavy coat
    const mildFormal =
      input.weather.tempC > 18 && formalityRank(formality) >= 3;
    const lightOuter = mildFormal
      ? outerPool.filter(
          (g) =>
            /blazer|jacket|overshirt|cardigan/i.test(g.name) ||
            !/overcoat|parka|puffer|wool coat/i.test(g.name)
        )
      : outerPool;
    const outer = pick(
      lightOuter.length ? lightOuter : outerPool,
      selected
    );
    // Weather layers when cool; formal events keep a blazer/coat even when mild
    const wantOuterForOccasion =
      formalityRank(formality) >= 3 ||
      profile.preferCategories.includes("outerwear");
    if (
      outer &&
      (input.weather.tempC < 19 || wantOuterForOccasion)
    ) {
      selected.push(outer);
    }
    const shoes = pick(byCat("shoes"), selected);
    if (shoes) selected.push(shoes);

    const accessories = byCat("accessory");
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
    const belt = pick(
      accessories.filter((g) =>
        /belt|strap/i.test(`${g.name} ${g.tags.join(" ")}`)
      ),
      selected
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
      const acc = pick(accessories, selected);
      if (acc) selected.push(acc);
    }
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
  if (t.includes("funeral") || t.includes("memorial")) return "funeral";
  if (t.includes("church") || t.includes("ceremony")) return "formal ceremony";

  // Weather / what-if questions are not occasions
  if (
    /\b(what if|degrees|°|feeling cold|feeling hot|suggest|what would you wear)\b/.test(
      t
    ) &&
    !/\b(birthday|wedding|dinner|date|meeting|interview|gym|travel|party)\b/.test(
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
      /\b(if it (was|were|is)|what if|suggest|what would you( suggest| wear)?|feeling cold|feeling hot|\d+\s*degrees?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
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
    /\b(dress me|outfit for|what should i wear|suggest|what would you)\b/.test(
      t
    ) ||
    /\b(birthday|interview|wedding|dinner|meeting|gym|travel)\b/.test(t) ||
    /\b(feeling cold|feeling hot|degrees|°)\b/.test(t);
  const weatherOnly =
    /\bweather\b/.test(t) &&
    !/\b(suggest|wear|outfit|dress|what if|degrees|°)\b/.test(t);
  const clearNav =
    weatherOnly || /\b(wardrobe|closet|why this|explain)\b/.test(t);
  if (/\b(open|go to|show|connect|photo|settings|billing|add|upload)\b/.test(t))
    return false;
  if (clearNav && !swapAsk) return true;
  if (swapAsk) return true;
  if (clearSuggest && t.length < 120) return true;
  return false;
}

export function parseVoiceIntent(transcript: string) {
  const t = transcript.toLowerCase();
  const spokenWeather = parseSpokenWeather(transcript);

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
        garmentQuery: transcript,
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

  const weatherOnlyAsk =
    /\bweather\b/.test(t) &&
    !spokenWeather &&
    !/\b(suggest|wear|outfit|dress me|what if|what would)\b/.test(t);
  if (weatherOnlyAsk) {
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
    reply: `Choosing a look for ${occasion}${tempNote} from your wardrobe.`,
    confidence: "high" as const,
  };
}

export { matchGarmentFromSpeech, inferCategoryFromSpeech };
