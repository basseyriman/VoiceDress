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
] as const;

export type StyleLookId = (typeof STYLE_LOOKS)[number]["id"];

export const STYLE_OPTION_IDS = STYLE_LOOKS.map((s) => s.id);
