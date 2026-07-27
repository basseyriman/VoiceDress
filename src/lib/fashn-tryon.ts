/**
 * FASHN Try-On Max — direct API (api.fashn.ai)
 * Better fidelity than fal’s hosted FASHN v1.6 shortcut.
 * Docs: https://docs.fashn.ai/api-reference/tryon-max
 */

export type FashnTryResult =
  | { ok: true; url: string }
  | { ok: false; status: number; detail: string; needsBilling?: boolean };

const BASE_URL = "https://api.fashn.ai/v1";

export function getFashnApiKey() {
  return process.env.FASHN_API_KEY?.trim() || "";
}

export function hasFashnApiKey() {
  return Boolean(getFashnApiKey());
}

function isFashnBillingError(detail: string) {
  const d = detail.toLowerCase();
  // Only clear out-of-balance signals — avoid matching the word "credit" in
  // unrelated API text (false "Try-on credits used up" for users).
  return (
    d.includes("exhausted balance") ||
    d.includes("insufficient credits") ||
    d.includes("insufficient balance") ||
    d.includes("out of credits") ||
    d.includes("no credits remaining") ||
    d.includes("top up your balance") ||
    d.includes("user is locked") ||
    /\bpayment required\b/.test(d) ||
    /\bquota exceeded\b/.test(d)
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function generationMode(): "fast" | "balanced" | "quality" {
  // Cost-aware default: balanced. Override with FASHN_GENERATION_MODE=quality for premium.
  const m = (process.env.FASHN_GENERATION_MODE || "balanced").toLowerCase();
  if (m === "fast" || m === "quality" || m === "balanced") return m;
  return "balanced";
}

function resolution(): "1k" | "2k" | "4k" {
  // Cost-aware default: 1k (fine for phone try-on). Override with FASHN_RESOLUTION=2k.
  const r = (process.env.FASHN_RESOLUTION || "1k").toLowerCase();
  if (r === "2k" || r === "4k" || r === "1k") return r;
  return "1k";
}

const KEEP_FACE =
  "CRITICAL: Keep the person's EXACT real face from the model photo — same skin texture, facial features, and identity. Do not beautify, smooth, cartoonize, age, or replace the face.";

const STRIP_OUTER =
  "Remove any jacket, blazer, sport coat, overcoat, or hoodie the person is already wearing — this look has no outer layer.";

/** Prompt hints so Max keeps color/silhouette for known hard cases. */
export function apparelPromptForPiece(
  piece: {
    category: string;
    name?: string;
    colors?: string[];
    tags?: string[];
  },
  opts?: { stripOuterwear?: boolean }
): string | undefined {
  const name = `${piece.name || ""} ${(piece.tags || []).join(" ")}`.toLowerCase();
  const colors = (piece.colors || []).join(", ");
  const strip = opts?.stripOuterwear ? STRIP_OUTER : "";
  if (piece.category === "outerwear") {
    const jacketOnly =
      "JACKET/COAT ONLY — if the product shows a full suit, use ONLY the jacket. Do NOT replace the trousers already on the person with suit pants or jeans.";
    if (/blazer|sport coat|suit jacket|double-breast|suit\b/.test(name)) {
      return [
        KEEP_FACE,
        "Layer this structured hip-length blazer/suit jacket over the existing top.",
        jacketOnly,
        "Keep blazer length — not a long overcoat or trench.",
        colors ? `Match exact color: ${colors}.` : "Keep the exact product color.",
        "Do not replace the top underneath or the bottoms already worn.",
        "Clean photoreal fabric — no black patches, holes, or glitches.",
      ].join(" ");
    }
    if (/overcoat|trench|coat|parka|duster/.test(name)) {
      return [
        KEEP_FACE,
        "Layer this full overcoat over the existing outfit naturally.",
        jacketOnly,
        "Smooth continuous coat fabric on both sleeves and body — no black holes, tears, or digital artifacts.",
        colors ? `Exact coat color: ${colors}.` : "Match the product coat color exactly.",
        "Keep the person's face, lower garments, and shoes unchanged.",
        "Photoreal coat drape, clean edges.",
      ].join(" ");
    }
    return [
      KEEP_FACE,
      "Layer this outerwear over the existing outfit.",
      jacketOnly,
      colors ? `Match exact color: ${colors}.` : "Keep the exact product color.",
      "Preserve the person's face, pose, and lower garments.",
      "Clean photoreal fabric — no black patches or glitches.",
    ].join(" ");
  }
  if (piece.category === "top" || piece.category === "dress") {
    return [
      KEEP_FACE,
      strip,
      `Wear this exact ${piece.category === "dress" ? "dress" : "top"}: ${piece.name || "garment"}.`,
      colors ? `Keep the ${colors} color — do not darken or recolor it.` : "Keep the exact product color.",
      "Replace the current upper clothing completely.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (piece.category === "bottom") {
    return [
      KEEP_FACE,
      `Wear these exact bottoms (trousers, skirt, or shorts): ${piece.name || "garment"}.`,
      colors ? `Exact color: ${colors}.` : "Keep the exact product color.",
      "Replace the current lower clothing. Keep the top already on the person.",
    ].join(" ");
  }
  if (colors && /white|ivory|cream|stone|khaki|beige/.test(colors.toLowerCase())) {
    return [KEEP_FACE, strip, `Wear this exact garment. Keep the ${colors} color — do not darken or recolor it.`]
      .filter(Boolean)
      .join(" ");
  }
  return [KEEP_FACE, strip].filter(Boolean).join(" ") || KEEP_FACE;
}

/** One-call prompt when top + bottom are combined into a product collage. */
export function collageApparelPrompt(
  pieces: { category: string; name?: string; colors?: string[] }[],
  opts?: { stripOuterwear?: boolean }
): string {
  const labels = pieces.map((p, i) => {
    const slot =
      i === 0
        ? "left panel"
        : i === 1
          ? "middle/right panel"
          : `panel ${i + 1}`;
    const colors = (p.colors || []).join(", ");
    return `${slot}: ${p.name || p.category}${colors ? ` (${colors})` : ""}`;
  });
  return [
    KEEP_FACE,
    opts?.stripOuterwear ? STRIP_OUTER : "",
    "The product image is a collage of multiple garments. Dress the person in ALL of them in one change.",
    `Garments: ${labels.join("; ")}.`,
    "Match each panel’s exact fabric and color. Replace existing top and bottoms to match the collage.",
    "Do not invent a jacket unless a jacket panel is in the collage.",
    "Photoreal, clean edges, full-body framing unchanged.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Shoes / glasses / watch prompts for Try-On Max. */
export function finishPromptForPiece(piece: {
  category: string;
  name?: string;
  colors?: string[];
  tags?: string[];
}): string {
  const label = piece.name || piece.category;
  const colors = (piece.colors || []).join(", ");
  const blob = `${piece.name || ""} ${(piece.tags || []).join(" ")}`.toLowerCase();

  const keepClothes =
    "Do NOT change trousers, jeans, jacket, sweater, shirt, or their colors. Do not invent denim. Keep the exact clothes already on the person.";

  if (piece.category === "shoes") {
    return [
      KEEP_FACE,
      `Replace BOTH shoes with these: ${label}.`,
      colors ? `Exact shoe color: ${colors}.` : "Match the product shoe color exactly.",
      "Change ONLY footwear below the ankles.",
      keepClothes,
      "Keep face, pose, and framing unchanged. Full-body crop — head and feet both visible.",
    ].join(" ");
  }

  if (piece.category === "bag" || /bag|tote|clutch|handbag|purse|crossbody/.test(blob)) {
    return [
      KEEP_FACE,
      `Add this bag held naturally at the side or on the shoulder: ${label}.`,
      colors ? `Bag color: ${colors}.` : "Match the product colors.",
      keepClothes,
      "Do not change face or shoes. Keep framing full-body.",
    ].join(" ");
  }

  if (/glass|frame|optic|sunglass|spec/.test(blob)) {
    return [
      KEEP_FACE,
      `Place ONLY these eyeglasses from the product on the person: ${label}.`,
      colors
        ? `Exact frame/lens colors: ${colors} — never invent neon, lime, green, or blue tints unless those colors are in the product.`
        : "Match the product frame and lens tint exactly — never invent neon/lime/green lenses.",
      "Thin realistic frames on the EXISTING face — do not redesign, beautify, smooth, or cartoon the face.",
      keepClothes,
      "Keep pose and framing unchanged.",
    ].join(" ");
  }

  if (/watch|wrist|chrono|time/.test(blob) || piece.category === "accessory") {
    return [
      KEEP_FACE,
      `Add this wristwatch on the most visible wrist: ${label}.`,
      colors ? `Watch colors: ${colors}.` : "Match the product colors.",
      "Small natural watch size.",
      keepClothes,
      "Do not change face or shoes.",
    ].join(" ");
  }

  return `${KEEP_FACE} Add this accessory (${label}) naturally. Keep face and outfit unchanged.`;
}

/**
 * Run Try-On Max and poll until completed.
 * Images may be https URLs or data:image/...;base64,... strings.
 */
export async function fashnTryOnMax(opts: {
  modelImage: string;
  productImage: string;
  prompt?: string;
}): Promise<FashnTryResult> {
  const apiKey = getFashnApiKey();
  if (!apiKey) {
    return { ok: false, status: 503, detail: "FASHN_API_KEY missing" };
  }

  const runRes = await fetch(`${BASE_URL}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model_name: "tryon-max",
      inputs: {
        model_image: opts.modelImage,
        product_image: opts.productImage,
        ...(opts.prompt ? { prompt: opts.prompt } : {}),
        resolution: resolution(),
        generation_mode: generationMode(),
        num_images: 1,
        output_format: "png",
      },
    }),
  });

  const runText = await runRes.text();
  let runData: { id?: string; error?: string | null } = {};
  try {
    runData = JSON.parse(runText);
  } catch {
    return {
      ok: false,
      status: runRes.status || 502,
      detail: runText.slice(0, 500),
      needsBilling: isFashnBillingError(runText),
    };
  }

  if (!runRes.ok || !runData.id) {
    const detail =
      (typeof runData.error === "string" && runData.error) ||
      runText.slice(0, 500);
    return {
      ok: false,
      status: runRes.status || 502,
      detail,
      needsBilling: isFashnBillingError(detail),
    };
  }

  const predictionId = runData.id;
  const started = Date.now();
  const timeoutMs = 120_000;

  while (Date.now() - started < timeoutMs) {
    await sleep(2500);
    const statusRes = await fetch(`${BASE_URL}/status/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const statusText = await statusRes.text();
    let statusData: {
      status?: string;
      output?: string[] | string;
      error?: string | null;
    } = {};
    try {
      statusData = JSON.parse(statusText);
    } catch {
      continue;
    }

    const status = (statusData.status || "").toLowerCase();
    if (status === "completed") {
      const out = statusData.output;
      const url = Array.isArray(out) ? out[0] : typeof out === "string" ? out : "";
      if (!url) {
        return {
          ok: false,
          status: 502,
          detail: "FASHN completed with empty output",
        };
      }
      return { ok: true, url };
    }

    if (
      status === "failed" ||
      status === "error" ||
      status === "cancelled" ||
      status === "canceled"
    ) {
      const detail =
        (typeof statusData.error === "string" && statusData.error) ||
        statusText.slice(0, 500) ||
        `FASHN status: ${status}`;
      return {
        ok: false,
        status: 502,
        detail,
        needsBilling: isFashnBillingError(detail),
      };
    }
  }

  return {
    ok: false,
    status: 504,
    detail: "FASHN Try-On Max timed out",
  };
}
