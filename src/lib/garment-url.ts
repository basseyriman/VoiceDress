/** Normalize UI paths so .png seed leftovers map to .jpg on disk. */
export function normalizeGarmentPublicUrl(imageUrl: string): string {
  if (!imageUrl.startsWith("/garments/")) return imageUrl;
  if (imageUrl.endsWith(".png")) return imageUrl.replace(/\.png$/i, ".jpg");
  return imageUrl.split("?")[0];
}
