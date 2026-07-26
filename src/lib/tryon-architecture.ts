/**
 * Virtual try-on architecture (VoiceDress)
 * ------------------------------------
 * Apparel only via fal FASHN — best at keeping YOUR face/body.
 *
 * OpenAI image edit and fal Kontext CAN add shoes/glasses/watch, but both
 * rewrite identity (you start looking like you, end looking like someone else).
 * Those pieces stay in the suggested look list until we have a likeness-safe path.
 *
 * Server still has OpenAI + Kontext finish code for experiments:
 *   TRYON_FINISH_PROVIDER=openai|kontext
 * but the client does not call stage:"finish" by default.
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

/** Full suggested look for the UI (includes shoes + accessories). */
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

/** Only pieces fal FASHN can dress onto your body. */
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
  return isApparelTryOnCategory(category);
}
