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

/**
 * How to wear the selected pieces — spoken, written, and try-on polish.
 * Deterministic from wardrobe + weather + formality (no invented garments).
 */
export function buildStylingGuide(input: {
  garments: Garment[];
  weather: WeatherSnapshot;
  formality: Formality;
  style: string;
  occasion: string;
}): StylingGuide {
  const { garments, weather, formality, style, occasion } = input;
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
    steps.push(`Wear the ${dress.name} as the base — clean drape, no bunching.`);
  }

  if (top && bottom) {
    if (isShirt(top) && (isTrousers(bottom) || isJeans(bottom))) {
      if (formality === "casual") {
        steps.push(
          `Leave the ${top.name} untucked, or do a soft front tuck into the ${bottom.name}.`
        );
      } else {
        steps.push(
          `Tuck the ${top.name} fully into the ${bottom.name} for a clean waistline.`
        );
      }
    } else if (isKnitTop(top) && bottom) {
      if (weather.tempC <= 12 || /zip|turtle/i.test(top.name)) {
        steps.push(
          `Wear the ${top.name} as your warmth layer — half-zip or neat neckline — over a clean fall into the ${bottom.name}.`
        );
      } else {
        steps.push(
          `Let the ${top.name} sit neatly over the ${bottom.name}; keep the hem smooth, not billowy.`
        );
      }
    } else {
      steps.push(`Layer the ${top.name} with the ${bottom.name} as your base.`);
    }
  } else if (top) {
    steps.push(`Start with the ${top.name} as your base layer.`);
  }

  if (bottom && shoes) {
    if (isBoot(shoes) && isJeans(bottom)) {
      steps.push(
        `Break the ${bottom.name} cleanly over the ${shoes.name} — slight stack, not puddled.`
      );
    } else if (isBoot(shoes) && isTrousers(bottom)) {
      steps.push(
        `Keep a light break on the ${bottom.name} over the ${shoes.name}.`
      );
    } else {
      steps.push(
        `Hem of the ${bottom.name} should kiss the ${shoes.name} — no pooling.`
      );
    }
  }

  if (outer) {
    if (isCoat(outer)) {
      if (weather.tempC <= 8) {
        steps.push(
          `Close the ${outer.name} over everything for warmth — collar up if it’s windy.`
        );
      } else if (weather.tempC <= 16) {
        steps.push(
          `Wear the ${outer.name} open over the look so the outfit underneath still reads.`
        );
      } else {
        steps.push(
          `Drape the ${outer.name} open — more polish than insulation.`
        );
      }
    } else if (isBlazer(outer)) {
      if (formality === "business" || formality === "formal") {
        steps.push(
          `Button the ${outer.name} once when standing; unbutton when you sit.`
        );
      } else {
        steps.push(`Leave the ${outer.name} open for an easy, intentional line.`);
      }
    } else {
      steps.push(`Layer the ${outer.name} over your top as the outer shell.`);
    }
  }

  if (eyewear) {
    steps.push(`Finish with the ${eyewear.name} on — keep them level and light.`);
  }
  if (watch) {
    steps.push(`Wear the ${watch.name} on your most visible wrist, snug not tight.`);
  }

  if (!steps.length) {
    steps.push(
      `Wear the pieces as a clean ${style} look for ${occasion} — nothing forced.`
    );
  } else {
    steps.push(
      `Overall: ${style} energy for ${occasion} at ${Math.round(weather.tempC)}°C.`
    );
  }

  const spoken = [
    `Here’s how to wear it.`,
    ...steps.slice(0, -1).map((s) => s.replace(/\s+/g, " ").trim()),
    steps[steps.length - 1],
  ].join(" ");

  const tryOnBits: string[] = [];
  if (top && bottom && isShirt(top) && formality !== "casual") {
    tryOnBits.push(
      `the ${top.name} is neatly tucked into the ${bottom.name}`
    );
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
    tryOnBits.push(
      `trousers/hem break cleanly over the ${shoes.name}`
    );
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
