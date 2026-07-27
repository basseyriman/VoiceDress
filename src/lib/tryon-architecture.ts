/**
 * Virtual try-on architecture (VoiceDress)
 * ------------------------------------
 * 1. Apparel — top+bottom collage + outerwear in one client request.
 *    Outerwear prefers Kontext jacket-layer (suits must not replace trousers);
 *    client always restores lower body from the pre-jacket frame.
 * 2. Finish — shoes/watch/bag/glasses in one request; client locks trousers + face.
 */

import { isHosieryOrSocks } from "@/lib/commerce";

export const TRYON_APPAREL_CATEGORIES = [
  "top",
  "dress",
  "bottom",
  "outerwear",
] as const;

export const TRYON_FINISH_CATEGORIES = ["shoes", "accessory", "bag"] as const;

/** Max pieces sent in the apparel stage (base + outerwear). */
export const TRYON_APPAREL_MAX_PIECES = 3;

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
  const shoes = garments.find(
    (g) => g.category === "shoes" && !isHosieryOrSocks(g)
  );
  const bag = garments.find((g) => g.category === "bag");
  const accessories = garments.filter(
    (g) => g.category === "accessory" && !isHosieryOrSocks(g)
  );
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
    ...(bag ? [bag] : []),
    ...eyewear,
    ...watches,
    ...other,
  ];
}

/**
 * Pieces for the apparel stage. Always keeps outerwear when present —
 * previously `.slice(0, 2)` dropped blazers/coats and left them "pending".
 */
export function apparelForTryOn<T extends { category: string }>(garments: T[]) {
  const order = ["top", "dress", "bottom", "outerwear"] as const;
  const all = order
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean) as T[];

  if (all.length <= TRYON_APPAREL_MAX_PIECES) return all;

  const outer = all.find((g) => g.category === "outerwear");
  const base = all
    .filter((g) => g.category !== "outerwear")
    .slice(0, TRYON_APPAREL_MAX_PIECES - (outer ? 1 : 0));
  return outer ? [...base, outer] : base;
}

export function finishingPieces<
  T extends { category: string; name?: string; tags?: string[] },
>(garments: T[]) {
  return garments.filter((g) => {
    if (!isFinishTryOnCategory(g.category)) return false;
    if (isHosieryOrSocks(g)) return false;
    return true;
  });
}

export function isBodyTryOnCategory(category: string) {
  return (
    isApparelTryOnCategory(category) || isFinishTryOnCategory(category)
  );
}
