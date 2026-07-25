/**
 * Virtual try-on architecture (VoiceDress)
 * ------------------------------------
 * Full suggested look on the body — nothing left as a “wishlist”.
 *
 * 1. Apparel (top / bottom / dress / outerwear) → fal FASHN (keeps you).
 * 2. Shoes → glasses → watch → fal Kontext with product photos.
 * 3. Never run a separate “face restore” pass (that was snapping back to
 *    the original undressed photo). If a finish piece fails, keep the
 *    already-dressed result and continue.
 */

export const TRYON_APPAREL_CATEGORIES = [
  "top",
  "dress",
  "bottom",
  "outerwear",
] as const;

export const TRYON_FINISH_CATEGORIES = ["shoes", "accessory"] as const;

export function isApparelTryOnCategory(category: string) {
  return (TRYON_APPAREL_CATEGORIES as readonly string[]).includes(category);
}

export function isFinishTryOnCategory(category: string) {
  return (TRYON_FINISH_CATEGORIES as readonly string[]).includes(category);
}

export function lookPiecesForTryOn<
  T extends { category: string; name?: string; tags?: string[] },
>(garments: T[]) {
  const apparelOrder = ["top", "dress", "bottom", "outerwear"] as const;
  const apparel = apparelOrder
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean) as T[];
  const shoes = garments.find((g) => g.category === "shoes");
  const accessories = garments.filter((g) => g.category === "accessory");
  const isWatch = (g: T) =>
    /watch|wrist|chrono|time/i.test(`${g.name || ""} ${(g.tags || []).join(" ")}`);
  const isEye = (g: T) =>
    /glass|frame|optic|sunglass|spec/i.test(
      `${g.name || ""} ${(g.tags || []).join(" ")}`
    );
  const eyewear = accessories.filter(isEye);
  const watches = accessories.filter(isWatch);
  const other = accessories.filter((g) => !isEye(g) && !isWatch(g));
  return [
    ...apparel,
    ...(shoes ? [shoes] : []),
    ...eyewear,
    ...watches,
    ...other,
  ];
}

export function apparelForTryOn<T extends { category: string }>(garments: T[]) {
  const order = ["top", "dress", "bottom", "outerwear"] as const;
  return order
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean)
    .slice(0, 2) as T[];
}

export function finishingPieces<T extends { category: string }>(garments: T[]) {
  return garments.filter((g) =>
    (TRYON_FINISH_CATEGORIES as readonly string[]).includes(g.category)
  );
}

export function isBodyTryOnCategory(category: string) {
  return isApparelTryOnCategory(category) || isFinishTryOnCategory(category);
}
