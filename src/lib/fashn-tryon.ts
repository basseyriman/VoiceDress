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
  return (
    d.includes("insufficient") ||
    d.includes("credit") ||
    d.includes("quota") ||
    d.includes("payment") ||
    d.includes("balance") ||
    d.includes("billing") ||
    d.includes("402")
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function generationMode(): "fast" | "balanced" | "quality" {
  const m = (process.env.FASHN_GENERATION_MODE || "balanced").toLowerCase();
  if (m === "fast" || m === "quality" || m === "balanced") return m;
  return "balanced";
}

function resolution(): "1k" | "2k" | "4k" {
  const r = (process.env.FASHN_RESOLUTION || "1k").toLowerCase();
  if (r === "2k" || r === "4k" || r === "1k") return r;
  return "1k";
}

/** Prompt hints so Max keeps color/silhouette for known hard cases. */
export function apparelPromptForPiece(piece: {
  category: string;
  name?: string;
  colors?: string[];
  tags?: string[];
}): string | undefined {
  const name = `${piece.name || ""} ${(piece.tags || []).join(" ")}`.toLowerCase();
  const colors = (piece.colors || []).join(", ");
  if (piece.category === "outerwear") {
    if (/blazer|sport coat|suit jacket/.test(name)) {
      return [
        "Layer this structured hip-length blazer over the existing top.",
        "Keep blazer length — not a long overcoat or trench.",
        colors ? `Match exact color: ${colors}.` : "Keep the exact product color.",
        "Do not replace the shirt underneath.",
      ].join(" ");
    }
    return [
      "Layer this outerwear over the existing outfit.",
      colors ? `Match exact color: ${colors}.` : "Keep the exact product color.",
      "Preserve the person's face, pose, and pants.",
    ].join(" ");
  }
  if (colors && /white|ivory|cream|stone|khaki|beige/.test(colors.toLowerCase())) {
    return `Wear this exact garment. Keep the ${colors} color — do not darken or recolor it.`;
  }
  return undefined;
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

  if (piece.category === "shoes") {
    return [
      `Replace BOTH shoes with these: ${label}.`,
      colors ? `Exact color: ${colors}.` : "Match the product color exactly.",
      "Keep the rest of the outfit, face, pose, and framing unchanged.",
      "Full-body crop — head and feet both visible.",
    ].join(" ");
  }

  if (/glass|frame|optic|sunglass|spec/.test(blob)) {
    return [
      `Place these eyeglasses on the person: ${label}.`,
      "Thin realistic frames on the existing face — do not redesign the face.",
      "Keep clothes, pose, and framing unchanged.",
    ].join(" ");
  }

  if (/watch|wrist|chrono|time/.test(blob) || piece.category === "accessory") {
    return [
      `Add this wristwatch on the most visible wrist: ${label}.`,
      colors ? `Watch colors: ${colors}.` : "Match the product colors.",
      "Small natural watch size. Do not change face, clothes, or shoes.",
    ].join(" ");
  }

  return `Add this accessory (${label}) naturally. Keep face and outfit unchanged.`;
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
