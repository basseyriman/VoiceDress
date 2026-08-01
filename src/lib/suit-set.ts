import type { Garment } from "./types";

function blobOf(g: {
  name?: string;
  tags?: string[];
  brand?: string;
}): string {
  return `${g.name || ""} ${g.brand || ""} ${(g.tags || []).join(" ")}`
    .toLowerCase()
    .trim();
}

/**
 * Product photos that show jacket + matching trousers together (suit sets).
 * Stored as outerwear today — we expand a linked trousers piece so the look
 * can wear the full set or mix jacket / trousers separately.
 */
export function isSuitSetProduct(g: {
  name?: string;
  tags?: string[];
  brand?: string;
  category?: string;
  setRole?: string;
}): boolean {
  if (g.setRole === "jacket" || g.setRole === "trousers") return true;
  const t = blobOf(g);
  if ((g.tags || []).some((tag) => /suit[_-]?set/i.test(tag))) return true;
  // Double-breasted product shots are almost always a full suit on the hangers
  if (/double[- ]?breast/.test(t)) return true;
  // Explicit suit language (not swimsuit / tracksuit)
  if (/\bsuit\b/.test(t) && !/\b(swim|track|jump|play|cat)\s*suit\b/.test(t)) {
    return true;
  }
  // "Blazer & trousers" / "matching suit trousers" style titles
  if (
    /\b(blazer|sport\s*coat|suit\s*jacket)\b/.test(t) &&
    /\b(trousers?|pants?|matching|set)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

export function suitTrousersName(jacketName: string): string {
  const base = (jacketName || "Suit")
    .replace(/\b(double[- ]?breasted\s+)?(blazer|sport\s*coat|suit\s*jacket|jacket)\b/gi, "")
    .replace(/\bsuit\b/gi, "")
    .trim();
  const prefix = base || "Matching";
  return `${prefix} Suit Trousers`.replace(/\s+/g, " ").trim();
}

export function suitJacketName(name: string): string {
  const t = name || "Suit Jacket";
  if (/blazer|jacket|coat/i.test(t)) return t;
  return `${t.replace(/\bsuit\b/i, "").trim() || "Suit"} Jacket`.replace(/\s+/g, " ");
}

/** Find the other half of a linked suit set in the wardrobe. */
export function matchingSetMate(
  piece: Garment,
  wardrobe: Garment[]
): Garment | null {
  if (!piece.setId) return null;
  const want = piece.setRole === "jacket" ? "trousers" : "jacket";
  return (
    wardrobe.find(
      (g) =>
        g.id !== piece.id &&
        g.setId === piece.setId &&
        (g.setRole === want ||
          (want === "trousers" && g.category === "bottom") ||
          (want === "jacket" && g.category === "outerwear"))
    ) || null
  );
}

/**
 * Expand suit-set outerwear into jacket + linked trousers (same product image).
 * Idempotent — skips when trousers for that setId already exist.
 */
export function expandSuitSets<T extends Garment>(items: T[]): T[] {
  const out: T[] = [];
  const existingTrouserSetIds = new Set(
    items
      .filter(
        (g) =>
          g.setRole === "trousers" ||
          (g.category === "bottom" && g.setId)
      )
      .map((g) => g.setId)
      .filter(Boolean) as string[]
  );

  for (const g of items) {
    // Already a derived trousers half — keep as-is
    if (g.setRole === "trousers") {
      out.push(g);
      continue;
    }

    const suit =
      isSuitSetProduct(g) &&
      (g.category === "outerwear" ||
        g.category === "top" ||
        g.setRole === "jacket");

    if (!suit) {
      out.push(g);
      continue;
    }

    const setId = g.setId || g.id;
    const jacket: T = {
      ...g,
      category: "outerwear" as T["category"],
      name: suitJacketName(g.name),
      setId,
      setRole: "jacket",
      tags: Array.from(new Set([...(g.tags || []), "suit_set", "suit_jacket"])),
    };
    out.push(jacket);

    if (existingTrouserSetIds.has(setId)) continue;

    const trousersId = `${setId}__trousers`;
    if (
      items.some((x) => x.id === trousersId) ||
      out.some((x) => x.id === trousersId)
    ) {
      continue;
    }

    const trousers: T = {
      ...g,
      id: trousersId,
      name: suitTrousersName(g.name),
      category: "bottom" as T["category"],
      setId,
      setRole: "trousers",
      tags: Array.from(
        new Set([
          ...(g.tags || []),
          "suit_set",
          "suit_trousers",
          "derived_from_suit",
        ])
      ),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
    out.push(trousers);
    existingTrouserSetIds.add(setId);
  }

  return out;
}
