import type { Garment, GarmentCategory } from "./types";
import { expandSuitSets } from "./suit-set";

type Named = {
  name?: string;
  tags?: string[];
  brand?: string;
  fabric?: string;
  texture?: string;
  category?: GarmentCategory | string;
};

function blobOf(g: Named): string {
  return `${g.name || ""} ${g.brand || ""} ${(g.tags || []).join(" ")} ${g.fabric || ""} ${g.texture || ""}`
    .toLowerCase()
    .trim();
}

/** Socks / stockings / tights — never footwear. */
export function isHosieryOrSocks(g: Named): boolean {
  const t = blobOf(g);
  if (
    /\b(socks?|stockings?|tights|hosiery|no-?show|ankle\s*socks?|crew\s*socks?|trainer\s*socks?|knee[- ]highs?|liner\s*socks?|footies?|ped\s*socks?|invisible\s*socks?|sock\s*liners?|shoe\s*liners?)\b/.test(
      t
    )
  ) {
    return true;
  }
  return isLikelySockPackMislabel(g);
}

/**
 * Sock liner multi-packs are often misnamed "Ballet Flat" / "Flats" by vision.
 * Real ballet flats are usually 1–2 colors + leather/suede language.
 */
export function isLikelySockPackMislabel(g: Named & { colors?: string[] }): boolean {
  const t = blobOf(g);
  const colors = g.colors || [];
  const multiColorPack = colors.length >= 4;
  const weakFlatName =
    /\b(ballet\s*flats?|flats?|slippers?|house\s*shoes?)\b/.test(t) &&
    !/\b(leather|suede|patent|nubuck|heel|wedge|strap|buckle|toe\s*cap)\b/.test(t);
  const packHints =
    /\b(pack|multi[- ]?pack|set of|liner|no-?show|invisible)\b/.test(t) ||
    multiColorPack;
  return Boolean(weakFlatName && packHints);
}

/** Jeans / trousers / shirts mistagged as shoes (e.g. denim named "Dress Shoes"). */
export function isApparelMislabeledAsShoes(g: Named): boolean {
  const t = blobOf(g);
  // Denim / bottoms evidence wins — even over a "Dress Shoes" title
  if (
    /\b(jeans?|denim|trousers?|chinos?|pants?|skirt|shorts?|joggers?|leggings?)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(shirt|blouse|tee|t-shirt|polo|sweater|jumper|hoodie|jacket|coat|blazer)\b/.test(
      t
    ) &&
    !/\b(dress\s*shoes?)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

/** Underwear / base layers that shouldn't dress as main apparel. */
export function isUnderwearOrLounge(g: Named): boolean {
  const t = blobOf(g);
  return /\b(boxers?|briefs?|underwear|lingerie|bra\b|panties|camisole\s*set)\b/.test(
    t
  );
}

/** Real shoes/boots — never trust a shoes label on shirts/jeans/socks. */
export function isRealFootwear(g: Named & { colors?: string[] }): boolean {
  if (isHosieryOrSocks(g) || isLikelySockPackMislabel(g)) return false;
  // Jeans named "Dress Shoes" must never count as footwear
  if (isApparelMislabeledAsShoes(g)) return false;
  const t = blobOf(g);
  // Category alone is not enough — sock packs get stored as shoes="Ballet Flat"
  if (g.category === "shoes") {
    if (/\b(ballet\s*flats?|\bflats?\b)\b/.test(t) && (g.colors?.length ?? 0) >= 4) {
      return false;
    }
    return true;
  }
  return /\b(shoes?|boots?|loafers?|sneakers?|trainers?|heels?|sandals?|oxford\s*shoes?|\boxfords\b|derbys?|brogues?|mules?|pumps?|espadrilles?|flats?|ballet\s*flats?|wedges?|stilettos?|slingbacks?|chelsea|derby|monk\s*strap)\b/.test(
    t
  );
}

/**
 * High-confidence category from name/tags.
 * Returns null when the text is ambiguous — keep existing category.
 */
export function inferCategoryFromText(
  name: string,
  tags: string[] = [],
  brand = ""
): GarmentCategory | null {
  const t = `${name} ${brand} ${tags.join(" ")}`.toLowerCase();
  if (!t.trim()) return null;

  // Order matters: hosiery → bottoms/denim → tops → shoes …
  if (
    /\b(socks?|stockings?|tights|hosiery|no-?show)\b/.test(t) ||
    isUnderwearOrLounge({ name, tags, brand })
  ) {
    return "accessory";
  }
  // Jeans / trousers BEFORE shoes — denim must never become "Dress Shoes"
  if (
    /\b(jeans?|denim|trousers?|pants?|chinos?|skirt|shorts?|joggers?|sweatpants?|leggings?|culottes?)\b/.test(
      t
    )
  ) {
    return "bottom";
  }
  // Shirt / top BEFORE footwear — "Oxford Shirt" must not become shoes
  if (
    /\b(shirt|tee|t-shirt|polo|blouse|knit|sweater|jumper|hoodie|crewneck|tank|vest|cardigan|camisole|bodysuit|quarter[- ]?zip)\b/.test(
      t
    )
  ) {
    if (/\b(hoodie|overshirt)\b/.test(t)) return "outerwear";
    return "top";
  }
  if (
    /\b(shoes?|boots?|loafers?|sneakers?|trainers?|heels?|sandals?|oxford\s*shoes?|\boxfords\b|derbys?|brogues?|mules?|pumps?|espadrilles?|flats?|ballet\s*flats?|wedges?|stilettos?|slingbacks?|chelsea\s*boots?)\b/.test(
      t
    )
  ) {
    return "shoes";
  }
  if (
    /\b(jumpsuit|romper|playsuit|catsuit|gown|maxi\s*dress|midi\s*dress|mini\s*dress|\bdress\b)\b/.test(
      t
    )
  ) {
    if (/\bdress\s*shirt\b|\bdress\s*shoe/.test(t)) {
      /* fall through */
    } else {
      return "dress";
    }
  }
  if (
    /\b(jacket|coat|blazer|parka|trench|overcoat|windbreaker|puffer|anorak|bomber|peacoat|raincoat)\b/.test(
      t
    )
  ) {
    return "outerwear";
  }
  if (/\b(bag|tote|handbag|clutch|backpack|crossbody|purse)\b/.test(t)) {
    return "bag";
  }
  if (
    /\b(belt|watch|glasses?|sunglasses?|scarf|hat|cap|beanie|jewelry|jewellery|necklace|bracelet|earring|tie\b|cufflink|ring\b)\b/.test(
      t
    )
  ) {
    return "accessory";
  }
  return null;
}

const CONFLICTS: Array<{
  when: GarmentCategory;
  inferred: GarmentCategory;
  reason: string;
}> = [
  { when: "shoes", inferred: "accessory", reason: "hosiery_or_small_goods" },
  { when: "shoes", inferred: "top", reason: "shirt_as_shoes" },
  { when: "shoes", inferred: "bottom", reason: "trousers_as_shoes" },
  { when: "top", inferred: "outerwear", reason: "jacket_as_top" },
  { when: "top", inferred: "bottom", reason: "trousers_as_top" },
  { when: "top", inferred: "dress", reason: "dress_as_top" },
  { when: "top", inferred: "shoes", reason: "footwear_as_top" },
  { when: "bottom", inferred: "shoes", reason: "footwear_as_bottom" },
  { when: "accessory", inferred: "shoes", reason: "footwear_as_accessory" },
  { when: "shoes", inferred: "outerwear", reason: "coat_as_shoes" },
  { when: "dress", inferred: "top", reason: "shirt_as_dress" },
];

function shouldOverride(
  current: GarmentCategory,
  inferred: GarmentCategory,
  g: Named
): boolean {
  if (current === inferred) return false;
  if (isHosieryOrSocks(g) || isUnderwearOrLounge(g)) {
    return inferred === "accessory";
  }
  // Always fix shirts (etc.) wrongly stored as shoes
  if (current === "shoes" && (inferred === "top" || inferred === "bottom")) {
    return true;
  }
  if (inferred === "shoes" && isRealFootwear({ ...g, category: "shoes" })) {
    return current !== "shoes";
  }
  return CONFLICTS.some((c) => c.when === current && c.inferred === inferred);
}

/**
 * Canonical category fix for live wardrobe / commerce / looks.
 * Prefer name evidence over a wrong stored/LLM category.
 */
export function sanitizeGarmentCategory<
  T extends {
    name?: string;
    tags?: string[];
    brand?: string;
    fabric?: string;
    texture?: string;
    colors?: string[];
    category: GarmentCategory;
  },
>(g: T): T {
  if (isHosieryOrSocks(g) || isLikelySockPackMislabel(g)) {
    const name =
      isLikelySockPackMislabel(g) && !/\bsock/i.test(g.name || "")
        ? "No-Show Socks"
        : g.name;
    return {
      ...g,
      name,
      category: "accessory",
      tags: Array.from(
        new Set([...(g.tags || []), "hosiery", "not_footwear"])
      ),
    };
  }

  // Jeans / denim mistagged as shoes (common vision error: "Dress Shoes")
  if (g.category === "shoes" && isApparelMislabeledAsShoes(g)) {
    const t = blobOf(g);
    const asBottom = /\b(jeans?|denim|trousers?|pants?|chinos?|skirt|shorts?)\b/.test(
      t
    );
    const asTop = /\b(shirt|tee|t-shirt|polo|blouse|sweater|jumper)\b/.test(t);
    return {
      ...g,
      category: asTop && !asBottom ? "top" : "bottom",
      name:
        /^(dress\s*)?shoes?$/i.test((g.name || "").trim()) && asBottom
          ? /\bjeans?\b/.test(t)
            ? "Jeans"
            : "Trousers"
          : g.name,
      tags: Array.from(
        new Set([...(g.tags || []), "corrected_apparel_as_shoes"])
      ),
    };
  }

  const inferred = inferCategoryFromText(
    g.name || "",
    g.tags || [],
    g.brand || ""
  );
  // Also pass fabric into inference via tags blob
  const inferredWithFabric = inferCategoryFromText(
    g.name || "",
    [...(g.tags || []), g.fabric || "", g.texture || ""].filter(Boolean),
    g.brand || ""
  );
  const best = inferredWithFabric || inferred;
  if (!best) {
    return g;
  }
  if (shouldOverride(g.category, best, g)) {
    return { ...g, category: best };
  }
  return g;
}

/** Alias used by older call sites. */
export const normalizeGarmentCategory = sanitizeGarmentCategory;

export function sanitizeWardrobe<T extends Garment>(items: T[]): T[] {
  return expandSuitSets(items.map((g) => sanitizeGarmentCategory(g)));
}

/** Heuristic when LLM unavailable — never returns shoes for socks. */
export function categorizeFromTitle(title: string): GarmentCategory {
  return inferCategoryFromText(title) || "top";
}

/**
 * Strip invalid footwear from a look and attach real shoes when the wardrobe has them.
 */
export function ensureLookHasFootwear(
  selected: Garment[],
  wardrobe: Garment[],
  pickShoes: (pool: Garment[], already: Garment[]) => Garment | null
): Garment[] {
  let next = selected.filter(
    (g) => !(g.category === "shoes" && !isRealFootwear(g))
  );
  next = next.map(sanitizeGarmentCategory);
  // Hosiery never rides along as a styled "ON YOU" accessory by default
  next = next.filter((g) => !isHosieryOrSocks(g) && !isUnderwearOrLounge(g));

  const hasShoes = next.some((g) => isRealFootwear(g));
  if (hasShoes) return next;

  const shoePool = sanitizeWardrobe(wardrobe).filter(
    (g) => isRealFootwear(g) && !next.some((s) => s.id === g.id)
  );
  const shoes = pickShoes(shoePool, next);
  if (shoes) next = [...next, sanitizeGarmentCategory(shoes)];
  return next;
}

/** Self-check used by unit tests / CI script. Throws on failure. */
export function assertGarmentCategoryGuards(): void {
  const cases: Array<{ name: string; expect: GarmentCategory }> = [
    { name: "No-Show Socks", expect: "accessory" },
    { name: "Black Ankle Socks 5-Pack", expect: "accessory" },
    { name: "Sheer Stockings", expect: "accessory" },
    { name: "White Oxford Shirt", expect: "top" },
    { name: "Men's Dress Shirt", expect: "top" },
    { name: "Black Oxford Shoes", expect: "shoes" },
    { name: "Cognac Leather Loafers", expect: "shoes" },
    { name: "Suede Chelsea Boots", expect: "shoes" },
    { name: "White Leather Sneakers", expect: "shoes" },
    { name: "Black Stiletto Heels", expect: "shoes" },
    { name: "Nude Ballet Flats", expect: "shoes" },
    { name: "Gold Wedge Sandals", expect: "shoes" },
    { name: "Navy Wool Blazer", expect: "outerwear" },
    { name: "Indigo Slim Jeans", expect: "bottom" },
    { name: "Pleated Midi Skirt", expect: "bottom" },
    { name: "Ivory Ribbed Quarter-Zip", expect: "top" },
    { name: "Silk Blouse", expect: "top" },
    { name: "Black Midi Dress", expect: "dress" },
    { name: "Linen Jumpsuit", expect: "dress" },
    { name: "Gold Rimless Glasses", expect: "accessory" },
    { name: "Leather Belt", expect: "accessory" },
    { name: "Black Tote Bag", expect: "bag" },
    { name: "Satin Clutch", expect: "bag" },
  ];

  for (const c of cases) {
    const got = categorizeFromTitle(c.name);
    if (got !== c.expect) {
      throw new Error(`categorizeFromTitle("${c.name}") → ${got}, want ${c.expect}`);
    }
  }

  const fixed = sanitizeGarmentCategory({
    name: "No-Show Socks",
    tags: ["footwear"],
    category: "shoes" as GarmentCategory,
  });
  if (fixed.category !== "accessory") {
    throw new Error("sanitizeGarmentCategory failed to fix socks→accessory");
  }

  const shirtFix = sanitizeGarmentCategory({
    name: "White Oxford Shirt",
    tags: [],
    category: "shoes" as GarmentCategory,
  });
  if (shirtFix.category !== "top") {
    throw new Error("sanitizeGarmentCategory failed to fix oxford shirt→top");
  }

  if (isRealFootwear({ name: "No-Show Socks", category: "shoes" })) {
    throw new Error("isRealFootwear must reject socks");
  }
  if (isRealFootwear({ name: "White Oxford Shirt", category: "shoes" })) {
    throw new Error("isRealFootwear must reject oxford shirt");
  }
  if (!isRealFootwear({ name: "Cognac Loafers", category: "shoes" })) {
    throw new Error("isRealFootwear must accept loafers");
  }

  const jeansAsShoes = sanitizeGarmentCategory({
    name: "Dress Shoes",
    tags: ["denim", "blue"],
    fabric: "denim",
    category: "shoes" as GarmentCategory,
  });
  if (jeansAsShoes.category !== "bottom" || isRealFootwear(jeansAsShoes)) {
    throw new Error("denim mistagged as Dress Shoes must become bottom");
  }

  const pack = sanitizeGarmentCategory({
    name: "Ballet Flat",
    tags: [],
    colors: ["black", "beige", "grey", "pink", "white"],
    category: "shoes" as GarmentCategory,
  });
  if (pack.category !== "accessory" || isRealFootwear(pack)) {
    throw new Error("multi-color Ballet Flat pack must not count as shoes");
  }
  if (!isRealFootwear({ name: "Nude Ballet Flats", category: "shoes", colors: ["nude"] })) {
    throw new Error("real single-color ballet flats must still count as shoes");
  }
}
