import type { Formality, Garment, Outfit, WeatherSnapshot } from "./types";

const STYLE_PALETTES: Record<string, string[]> = {
  "old money": ["#1a1a1a", "#f5f0e6", "#2c3e2d", "#8b7355", "#c9a87c", "#4a5568"],
  "quiet luxury": ["#0b0b0c", "#e8e4dc", "#5c6b73", "#9a8f7a", "#2f2f2f"],
  streetwear: ["#111111", "#ffffff", "#ef4444", "#3b82f6", "#a3e635"],
  minimal: ["#111111", "#ffffff", "#737373", "#d4d4d4"],
  romantic: ["#f8e8e8", "#7c3a4a", "#d4a5a5", "#2d2a26"],
};

function scoreColorHarmony(outfitColors: string[], style: string): number {
  const palette = STYLE_PALETTES[style.toLowerCase()] || STYLE_PALETTES["quiet luxury"];
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
    if (g.season.includes("autumn") || g.season.includes("spring") || g.season.includes("all"))
      score += 1;
  } else if (weather.tempC > 24) {
    if (g.fabric?.toLowerCase().includes("linen") || g.fabric?.toLowerCase().includes("cotton"))
      score += 2;
    if (g.category === "outerwear") score -= 2;
    if (g.season.includes("summer") || g.season.includes("all")) score += 1;
  }
  if (weather.precipChance > 50 && g.category === "shoes") {
    if (g.name.toLowerCase().includes("boot") || g.fabric?.toLowerCase().includes("leather"))
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

function inferFormality(occasion: string): Formality {
  const o = occasion.toLowerCase();
  if (o.includes("wedding") || o.includes("gala") || o.includes("black tie")) return "black_tie";
  if (o.includes("board") || o.includes("interview") || o.includes("presentation") || o.includes("in-law") || o.includes("inlaw"))
    return "formal";
  if (o.includes("office") || o.includes("meeting") || o.includes("work") || o.includes("client"))
    return "business";
  if (o.includes("dinner") || o.includes("date") || o.includes("brunch")) return "smart_casual";
  return "casual";
}

function pickBest(
  items: Garment[],
  weather: WeatherSnapshot,
  style: string,
  formality: Formality
): Garment | null {
  if (!items.length) return null;
  const ranked = [...items].sort((a, b) => {
    const sa =
      weatherFit(a, weather) +
      formalityFit(a, formality) +
      scoreColorHarmony(a.hexColors, style);
    const sb =
      weatherFit(b, weather) +
      formalityFit(b, formality) +
      scoreColorHarmony(b.hexColors, style);
    return sb - sa;
  });
  return ranked[0] || null;
}

export interface SuggestInput {
  wardrobe: Garment[];
  weather: WeatherSnapshot;
  occasion: string;
  style?: string;
  excludeIds?: string[];
  swapCategory?: Garment["category"];
  currentOutfit?: Garment[];
}

export function suggestOutfit(input: SuggestInput): Outfit {
  const style = input.style || "quiet luxury";
  const formality = inferFormality(input.occasion);
  const pool = input.wardrobe.filter((g) => !input.excludeIds?.includes(g.id));

  const byCat = (cat: Garment["category"]) => pool.filter((g) => g.category === cat);

  let selected: Garment[] = [];

  if (input.swapCategory && input.currentOutfit?.length) {
    selected = input.currentOutfit.filter((g) => g.category !== input.swapCategory);
    const replacement = pickBest(
      byCat(input.swapCategory).filter(
        (g) => !input.currentOutfit?.some((c) => c.id === g.id)
      ),
      input.weather,
      style,
      formality
    );
    if (replacement) selected.push(replacement);
    else selected = input.currentOutfit;
  } else {
    const dress = pickBest(byCat("dress"), input.weather, style, formality);
    if (dress && formalityRank(formality) >= 3) {
      selected = [dress];
    } else {
      const top = pickBest(byCat("top"), input.weather, style, formality);
      const bottom = pickBest(byCat("bottom"), input.weather, style, formality);
      if (top) selected.push(top);
      if (bottom) selected.push(bottom);
    }
    const outer = pickBest(byCat("outerwear"), input.weather, style, formality);
    if (outer && input.weather.tempC < 18) selected.push(outer);
    const shoes = pickBest(byCat("shoes"), input.weather, style, formality);
    if (shoes) selected.push(shoes);
    const acc = pickBest(byCat("accessory"), input.weather, style, formality);
    if (acc) selected.push(acc);
  }

  const colors = selected.flatMap((g) => g.hexColors);
  const name = `${style.charAt(0).toUpperCase() + style.slice(1)} for ${input.occasion}`;
  const rationale = buildRationale(selected, input.weather, input.occasion, style, formality, colors);

  return {
    id: `outfit_${Date.now()}`,
    userId: selected[0]?.userId || "local",
    name,
    occasion: input.occasion,
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
  occasion: string,
  style: string,
  formality: Formality,
  colors: string[]
) {
  const pieces = garments.map((g) => `${g.brand} ${g.name}`).join(", ");
  return `For ${occasion} in ${weather.location} (${Math.round(weather.tempC)}°C, ${weather.condition}), this ${style} edit stays ${formality.replace("_", " ")} while coordinating ${colors.slice(0, 3).join(", ") || "neutral tones"}. Selected: ${pieces || "build your wardrobe to unlock suggestions"}.`;
}

export function parseVoiceIntent(transcript: string) {
  const t = transcript.toLowerCase();
  if (t.includes("swap") || t.includes("change") || t.includes("replace") || t.includes("instead")) {
    let item = "bottom";
    if (t.includes("jean") || t.includes("trouser") || t.includes("pant") || t.includes("skirt"))
      item = "bottom";
    if (t.includes("shirt") || t.includes("top") || t.includes("blouse") || t.includes("knit"))
      item = "top";
    if (t.includes("shoe") || t.includes("boot") || t.includes("loafer")) item = "shoes";
    if (t.includes("jacket") || t.includes("coat") || t.includes("blazer")) item = "outerwear";

    let style = "quiet luxury";
    if (t.includes("old money")) style = "old money";
    if (t.includes("street")) style = "streetwear";
    if (t.includes("minimal")) style = "minimal";
    if (t.includes("romantic")) style = "romantic";

    let occasion = "today";
    if (t.includes("in-law") || t.includes("inlaw") || t.includes("parent"))
      occasion = "meeting the in-laws";
    if (t.includes("work") || t.includes("office") || t.includes("meeting"))
      occasion = "work meeting";
    if (t.includes("date") || t.includes("dinner")) occasion = "dinner date";
    if (t.includes("wedding")) occasion = "wedding";

    return {
      transcript,
      intent: "swap_item" as const,
      entities: { item, style, occasion, replaceWith: style },
      reply: `Understood. Swapping your ${item} toward a ${style} look for ${occasion}.`,
    };
  }

  if (t.includes("old money") || t.includes("quiet luxury") || t.includes("style")) {
    const style = t.includes("old money") ? "old money" : "quiet luxury";
    return {
      transcript,
      intent: "change_style" as const,
      entities: { style },
      reply: `Refining the look to ${style}.`,
    };
  }

  if (t.includes("weather")) {
    return {
      transcript,
      intent: "weather_check" as const,
      entities: {},
      reply: "Checking live weather for today's suggestion.",
    };
  }

  if (t.includes("wardrobe") || t.includes("closet")) {
    return {
      transcript,
      intent: "open_wardrobe" as const,
      entities: {},
      reply: "Opening your wardrobe.",
    };
  }

  let occasion = "today";
  if (t.includes("in-law") || t.includes("parent")) occasion = "meeting the in-laws";
  if (t.includes("work") || t.includes("meeting")) occasion = "work meeting";
  if (t.includes("date")) occasion = "dinner date";

  return {
    transcript,
    intent: "suggest_outfit" as const,
    entities: { occasion, style: t.includes("old money") ? "old money" : "quiet luxury" },
    reply: `Composing a weather-aware outfit for ${occasion}.`,
  };
}
