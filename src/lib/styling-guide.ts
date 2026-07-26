import type { Formality, Garment, WeatherSnapshot } from "@/lib/types";

export type StylingGuide = {
  /** Short bullets for UI */
  steps: string[];
  /** One speakable paragraph */
  spoken: string;
  /** Tight prompt for post-try-on style polish */
  tryOnPrompt: string;
};

function isShirt(g: Garment) {
  return /shirt|oxford|blouse|poplin|button[- ]?down/i.test(
    `${g.name} ${g.tags.join(" ")} ${g.fabric || ""}`
  );
}

function isKnitTop(g: Garment) {
  return /knit|crew|merino|cashmere|turtleneck|quarter[- ]?zip|sweater|jumper/i.test(
    `${g.name} ${g.tags.join(" ")} ${g.fabric || ""}`
  );
}

function isTrousers(g: Garment) {
  return /trouser|chino|pant|wool/i.test(`${g.name} ${g.tags.join(" ")}`);
}

function isJeans(g: Garment) {
  return /jean|denim/i.test(`${g.name} ${g.tags.join(" ")}`);
}

function isBoot(g: Garment) {
  return /boot|chelsea|derby/i.test(`${g.name} ${g.tags.join(" ")}`);
}

function isCoat(g: Garment) {
  return /coat|overcoat|parka|puffer/i.test(`${g.name} ${g.tags.join(" ")}`);
}

function isBlazer(g: Garment) {
  return /blazer|sport coat|jacket/i.test(`${g.name} ${g.tags.join(" ")}`);
}

function pick<T>(options: T[], seed: number): T {
  return options[Math.abs(seed) % options.length]!;
}

/**
 * Local fallback stylist notes — varied phrasing so repeats don’t feel scripted.
 * Prefer `/api/outfit/styling` (LLM) when a key is available.
 */
export function buildStylingGuide(input: {
  garments: Garment[];
  weather: WeatherSnapshot;
  formality: Formality;
  style: string;
  occasion: string;
  varietySeed?: number;
}): StylingGuide {
  const { garments, weather, formality, style, occasion } = input;
  const seed = input.varietySeed ?? Date.now();
  const top = garments.find((g) => g.category === "top");
  const bottom = garments.find((g) => g.category === "bottom");
  const outer = garments.find((g) => g.category === "outerwear");
  const shoes = garments.find((g) => g.category === "shoes");
  const dress = garments.find((g) => g.category === "dress");
  const eyewear = garments.find(
    (g) =>
      g.category === "accessory" &&
      /glass|frame|optic|sunglass|spec/i.test(`${g.name} ${g.tags.join(" ")}`)
  );
  const watch = garments.find(
    (g) =>
      g.category === "accessory" &&
      /watch|wrist|chrono|time/i.test(`${g.name} ${g.tags.join(" ")}`)
  );

  const steps: string[] = [];

  if (dress) {
    steps.push(
      pick(
        [
          `Let the ${dress.name} lead — keep the line smooth, nothing fighting it.`,
          `The ${dress.name} is the whole story; keep accessories quiet around it.`,
        ],
        seed
      )
    );
  }

  if (top && bottom) {
    if (isShirt(top) && (isTrousers(bottom) || isJeans(bottom))) {
      if (formality === "casual") {
        steps.push(
          pick(
            [
              `Soft front-tuck the ${top.name} — intentional, not fussy.`,
              `Wear the ${top.name} mostly out, with just a hint of tuck for shape.`,
            ],
            seed + 1
          )
        );
      } else {
        steps.push(
          pick(
            [
              `Clean tuck on the ${top.name} — that waistline is the polish.`,
              `Shirt fully in; the ${bottom.name} should sit sharp at the hip.`,
              `Tuck hard, then smooth once — dinner-date discipline.`,
            ],
            seed + 1
          )
        );
      }
    } else if (isKnitTop(top) && bottom) {
      steps.push(
        pick(
          [
            `Let the ${top.name} skim, not swamp — hem clean over the ${bottom.name}.`,
            `Keep the ${top.name} close to the body so the ${bottom.name} still reads.`,
          ],
          seed + 1
        )
      );
    } else {
      steps.push(`Build from the ${top.name} into the ${bottom.name}.`);
    }
  } else if (top) {
    steps.push(`Start with the ${top.name} as your base.`);
  }

  if (bottom && shoes) {
    if (isBoot(shoes)) {
      steps.push(
        pick(
          [
            `Light break on the ${bottom.name} over the ${shoes.name} — no puddle.`,
            `Hem kisses the ${shoes.name}; leave a whisper of sock if it shows.`,
          ],
          seed + 2
        )
      );
    } else {
      steps.push(
        `Hem of the ${bottom.name} should meet the ${shoes.name} cleanly.`
      );
    }
  }

  if (outer) {
    if (isCoat(outer)) {
      if (weather.tempC <= 8) {
        steps.push(`Button the ${outer.name} — tonight it’s armour, not theatre.`);
      } else {
        steps.push(
          pick(
            [
              `Wear the ${outer.name} open so the outfit underneath still speaks.`,
              `Coat open on arrival — it’s presence, not a cocoon.`,
            ],
            seed + 3
          )
        );
      }
    } else if (isBlazer(outer)) {
      steps.push(
        pick(
          [
            `One button standing in the ${outer.name}; undo when you sit.`,
            `Leave the ${outer.name} easy and open — less boardroom, more dinner.`,
          ],
          seed + 3
        )
      );
    } else {
      steps.push(`Layer the ${outer.name} over the top as your shell.`);
    }
  }

  if (eyewear) {
    steps.push(
      pick(
        [
          `Frames on — ${eyewear.name}, level, light, done.`,
          `The ${eyewear.name} finish the face; don’t fuss with them mid-night.`,
        ],
        seed + 4
      )
    );
  }
  if (watch) {
    steps.push(
      pick(
        [
          `${watch.name} on the visible wrist — snug, not choking.`,
          `One flash of the ${watch.name} when you reach for a glass — that’s enough.`,
        ],
        seed + 5
      )
    );
  }

  if (!steps.length) {
    steps.push(`Keep it ${style} for ${occasion} — edit once, then stop.`);
  }

  const spoken = pick(
    [
      `For ${occasion}: ${steps.slice(0, 3).join(" ")}`,
      `Here’s the move. ${steps.slice(0, 3).join(" ")}`,
      `I’d wear it like this. ${steps.slice(0, 3).join(" ")}`,
    ],
    seed + 6
  );

  const tryOnBits: string[] = [];
  if (top && bottom && isShirt(top) && formality !== "casual") {
    tryOnBits.push(`the ${top.name} is neatly tucked into the ${bottom.name}`);
  } else if (top && bottom && isShirt(top)) {
    tryOnBits.push(
      `the ${top.name} has a soft front tuck into the ${bottom.name}`
    );
  }
  if (outer && isCoat(outer) && weather.tempC > 8) {
    tryOnBits.push(`the ${outer.name} is worn open`);
  } else if (outer && isCoat(outer)) {
    tryOnBits.push(`the ${outer.name} is closed for warmth`);
  } else if (outer && isBlazer(outer) && formality !== "casual") {
    tryOnBits.push(`the ${outer.name} is buttoned once`);
  } else if (outer) {
    tryOnBits.push(`the ${outer.name} is layered open over the top`);
  }
  if (bottom && shoes) {
    tryOnBits.push(`hem breaks cleanly over the ${shoes.name}`);
  }

  const tryOnPrompt = [
    "Edit ONLY how the existing clothes sit on this exact same person.",
    "Keep the EXACT same face, identity, body, pose, lighting, background, and framing.",
    "Do not change garment colors, fabrics, or swap items.",
    tryOnBits.length
      ? `Styling: ${tryOnBits.join("; ")}.`
      : `Keep a clean ${style} wear for ${occasion}.`,
    "Photoreal, natural fabric drape, no text overlays.",
  ].join(" ");

  return { steps, spoken, tryOnPrompt };
}
