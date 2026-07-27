/** Shared Style DNA options — onboarding + settings. */
export const STYLE_LOOKS = [
  {
    id: "old money",
    label: "Old money",
    blurb: "Heritage polish. Tailored, quiet, never flashy.",
  },
  {
    id: "quiet luxury",
    label: "Quiet luxury",
    blurb: "Soft luxury. Fine fabric, no logos, effortless ease.",
  },
  {
    id: "minimal",
    label: "Minimal",
    blurb: "Clean lines. Fewer pieces, sharper silhouette.",
  },
  {
    id: "streetwear",
    label: "Streetwear",
    blurb: "Modern edge. Casual confidence with intention.",
  },
  {
    id: "romantic",
    label: "Romantic",
    blurb: "Soft polish. Fluid lines, elevated ease, date-night ready.",
  },
] as const;

export type StyleLookId = (typeof STYLE_LOOKS)[number]["id"];

export const STYLE_OPTION_IDS = STYLE_LOOKS.map((s) => s.id);

/** Primary style for scoring / labels — explicit voice override, else DNA. */
export function resolvePrimaryStyle(
  stylePrefs?: string[] | null,
  explicit?: string | null
): string {
  const said = explicit?.trim().toLowerCase();
  if (said) return said;
  if (stylePrefs?.length) return stylePrefs[0]!;
  return "quiet luxury";
}

/** Put the user’s style DNA ahead of occasion defaults. */
export function blendStyleHints(
  stylePrefs: string[] | undefined,
  occasionHints: string[]
): string[] {
  return Array.from(
    new Set([...(stylePrefs || []), ...occasionHints].filter(Boolean))
  ).slice(0, 5);
}
