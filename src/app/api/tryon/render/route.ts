import { NextRequest, NextResponse } from "next/server";
import { resolveGarmentImageForFal } from "@/lib/garment-resolve";
import {
  hasOpenAIImageKey,
  openaiFinishEdit,
} from "@/lib/openai-finish";
import { isAuthedUser, requireTryOnAccess, consumeFreePhotoTryOn, consumeMonthlyPhotoTryOn } from "@/lib/api-auth";
import {
  apparelPromptForPiece,
  collageApparelPrompt,
  finishPromptForPiece,
  fashnTryOnMax,
  hasFashnApiKey,
} from "@/lib/fashn-tryon";
import { composeApparelCollage } from "@/lib/apparel-collage";
import { isHosieryOrSocks, isRealFootwear } from "@/lib/commerce";

export const maxDuration = 180;

type Piece = {
  id?: string;
  imageUrl: string;
  category: string;
  name?: string;
  colors?: string[];
  hexColors?: string[];
  fabric?: string;
  texture?: string;
  tags?: string[];
};

type TryResult =
  | { ok: true; url: string }
  | { ok: false; status: number; detail: string };

function isFalBillingError(detail: string) {
  const d = detail.toLowerCase();
  return (
    d.includes("exhausted balance") ||
    d.includes("user is locked") ||
    d.includes("top up your balance") ||
    d.includes("insufficient credits") ||
    d.includes("insufficient balance") ||
    d.includes("out of credits") ||
    d.includes("no credits remaining") ||
    /\bpayment required\b/.test(d) ||
    /\bquota exceeded\b/.test(d)
  );
}

/** Never expose fal/FASHN dashboard links to end users. */
function userTryOnUnavailableMessage() {
  return "Dressing is busy right now. Tap retry in a moment — your wardrobe is fine.";
}

function pieceLook(piece: Piece) {
  const bits = [
    piece.name || piece.category,
    piece.colors?.length ? `color ${piece.colors.join(", ")}` : "",
    piece.hexColors?.length ? `hex ${piece.hexColors.join(", ")}` : "",
    [piece.fabric, piece.texture].filter(Boolean).join(" "),
  ].filter(Boolean);
  return bits.join(" — ");
}

function isWatch(piece: Piece) {
  return /watch|wrist|chrono|time/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

function isEyewear(piece: Piece) {
  return /glass|frame|optic|sunglass|spec/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

async function parseFalImages(res: Response): Promise<TryResult> {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, detail: text.slice(0, 600) };
  }
  const images = data.images as { url?: string }[] | undefined;
  const imageObj = data.image as { url?: string } | string | undefined;
  const url =
    images?.[0]?.url ||
    (typeof imageObj === "object" ? imageObj?.url : undefined) ||
    (typeof imageObj === "string" ? imageObj : undefined) ||
    (typeof data.image_url === "string" ? data.image_url : undefined) ||
    (typeof data.url === "string" ? data.url : undefined);
  if (!url) {
    return {
      ok: false,
      status: 502,
      detail: `Unexpected fal response: ${text.slice(0, 400)}`,
    };
  }
  return { ok: true, url };
}

async function fashnViaFal(opts: {
  falKey: string;
  modelImage: string;
  garmentImage: string;
  category: "tops" | "bottoms" | "one-pieces";
}): Promise<TryResult> {
  const call = async (mode: "quality" | "balanced") => {
    const res = await fetch("https://fal.run/fal-ai/fashn/tryon/v1.6", {
      method: "POST",
      headers: {
        Authorization: `Key ${opts.falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_image: opts.modelImage,
        garment_image: opts.garmentImage,
        category: opts.category,
        mode,
        garment_photo_type: "auto",
        moderation_level: "permissive",
        num_samples: 1,
        segmentation_free: true,
        output_format: "png",
      }),
    });
    return parseFalImages(res);
  };
  const primary = await call("quality");
  if (primary.ok) return primary;
  return call("balanced");
}

/** Prefer FASHN Try-On Max; fall back to fal-hosted v1.6. */
async function applyApparelPiece(opts: {
  falKey: string;
  modelImage: string;
  garmentImage: string;
  piece: Piece;
  stripOuterwear?: boolean;
  timeoutMs?: number;
}): Promise<TryResult & { provider?: string; needsBilling?: boolean }> {
  const prompt = apparelPromptForPiece(opts.piece, {
    stripOuterwear: opts.stripOuterwear,
  });

  if (hasFashnApiKey()) {
    const max = await fashnTryOnMax({
      modelImage: opts.modelImage,
      productImage: opts.garmentImage,
      prompt,
      timeoutMs: opts.timeoutMs,
    });
    if (max.ok) return { ...max, provider: "fashn-tryon-max" };
    if (max.needsBilling) {
      return {
        ok: false,
        status: max.status,
        detail: max.detail,
        needsBilling: true,
        provider: "fashn-tryon-max",
      };
    }
    console.warn(
      `[tryon] Try-On Max failed for ${opts.piece.name || opts.piece.category}, trying fal v1.6:`,
      max.detail?.slice(0, 200)
    );
  }

  if (!opts.falKey) {
    return {
      ok: false,
      status: 503,
      detail: "Add FASHN_API_KEY (preferred) or FAL_KEY for clothes try-on",
    };
  }

  const cat = apparelCategory(opts.piece.category);
  if (!cat) {
    return {
      ok: false,
      status: 400,
      detail: `Unsupported apparel category: ${opts.piece.category}`,
    };
  }

  const viaFal = await fashnViaFal({
    falKey: opts.falKey,
    modelImage: opts.modelImage,
    garmentImage: opts.garmentImage,
    category: cat,
  });
  return { ...viaFal, provider: "fal-fashn-v1.6" };
}

const KEEP_YOU =
  "CRITICAL: Keep the EXACT same person from image 1 — same face identity, facial features, skin tone, hair, body proportions, pose, hands, lighting, and background. Do not generate a different face or lookalike. Only change the clothing item described.";

const KEEP_FRAMING =
  "CRITICAL FRAMING: Keep the EXACT same full-body camera distance and crop as image 1. Head and both feet must stay fully visible. Do not zoom in, do not crop to waist-up, do not change aspect ratio.";

function isBlazerPiece(piece: Piece) {
  return /blazer|sport coat|suit jacket|double-breast|\bsuit\b/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

function isCoatPiece(piece: Piece) {
  return /overcoat|trench|parka|puffer|duster|coat/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

/**
 * Soft mid-layers (sweater, cardigan, hoodie, zip knit) transfer faithfully via
 * FASHN. Only structured blazers/coats need Kontext-first — FASHN "tops" mode
 * can swap trousers from a full-suit product shot, which doesn't apply here.
 */
function isSoftLayer(piece: Piece) {
  if (isBlazerPiece(piece) || isCoatPiece(piece)) return false;
  return /sweater|cardigan|hoodie|zip|quarter[- ]?zip|jumper|knit|overshirt|fleece|pullover/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

/** Structured outerwear where Kontext layering beats FASHN tops-mode. */
function needsKontextOuterwearFirst(piece: Piece) {
  // Disabled: Kontext multi-image layering (Flux Pro) completely destroys the person's face/body 
  // when layering a blazer from a full-suit product shot. FASHN handles this much better.
  return false;
}

function shoeGlassesPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  if (piece.category === "shoes") {
    return [
      KEEP_YOU,
      KEEP_FRAMING,
      `The person is wearing the shoes from image 2 on their feet.`,
      "The shoes must be worn naturally on BOTH feet. Photorealistic.",
      "Completely replace the existing shoes with the ones from image 2.",
      "Keep trousers, pants, and everything from the knees up completely unchanged.",
      "Do not alter the face, torso, background, or lighting.",
    ].join(" ");
  }
  const colorHint =
    piece.colors?.length || piece.hexColors?.length
      ? `Frame/lens colors from the product: ${[
          ...(piece.colors || []),
          ...(piece.hexColors || []),
        ].join(", ")}.`
      : "";
  return [
    KEEP_YOU,
    KEEP_FRAMING,
    `Place ONLY the glasses from image 2 (${look}) on the person's existing face.`,
    "Match frame shape and lens tint from image 2 exactly — never invent neon, lime, or green lenses unless image 2 has them.",
    colorHint,
    "Do not redesign or regenerate the face. Same eyes, nose, mouth, skin. Only add thin frames.",
    "Do not recolor or restyle clothes, shoes, or background — keep their exact colors. Do not change trousers to jeans.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Outerwear via Kontext multi — FASHN has no jacket category and often
 * drops or morphs blazers into long cream coats when forced into "tops".
 */
function outerwearLayerPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  const blazer = isBlazerPiece(piece);
  const coat = isCoatPiece(piece) && !blazer;
  const soft = isSoftLayer(piece);
  const silhouette = blazer
    ? "structured hip-length blazer with notch lapels. The jacket must end at the hips."
    : coat
      ? "full-length coat matching image 2 — same length and color"
      : soft
        ? "soft knit mid-layer matching image 2 exactly — same color, zipper/placket, and length"
        : "outer jacket matching image 2 exactly — same length, cut, and color";

  const colorRule = soft
    ? "Match the exact color from image 2 — if cream, ivory, white, or light grey, keep it light; never darken into navy or black."
    : "Match the exact color, fabric, and pattern of the jacket in image 2. Do not invent a new color.";

  return [
    KEEP_YOU,
    KEEP_FRAMING,
    soft
      ? `Layer ONLY the knit/soft outer layer from image 2 (${look}) over the person's existing top.`
      : `Layer ONLY the outerwear jacket from image 2 (${look}) over the person's existing top.`,
    `It must be a ${silhouette}.`,
    "If image 2 shows a full suit, use ONLY the jacket.",
    colorRule,
    "Keep the top underneath visible at the neckline/hem. The top underneath MUST retain its original color (e.g. if white, keep it white). Do not tint the shirt to match the jacket.",
    "Keep lower garments, shoes, hands, face, and background completely unchanged.",
    "Photoreal fabric, natural drape, correct proportions for this body.",
  ].join(" ");
}

async function kontextOuterwearLayer(opts: {
  falKey: string;
  personImage: string;
  productImage: string;
  piece: Piece;
}): Promise<TryResult> {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/kontext/multi", {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: outerwearLayerPrompt(opts.piece),
      image_urls: [opts.personImage, opts.productImage],
      guidance_scale: 5.2,
      num_images: 1,
      output_format: "jpeg",
      enhance_prompt: false,
      safety_tolerance: "5",
    }),
  });
  return parseFalImages(res);
}

function watchTextPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  return [
    "Edit this photo only.",
    "Keep the EXACT same person, face, body, pose, clothes, shoes, glasses, lighting, and background.",
    "Keep the exact same clothing colors — do not saturate, brighten, or recolor the outfit.",
    "Keep the exact same full-body framing — do not zoom or crop.",
    `Add one realistic wristwatch on the most visible wrist: ${look}.`,
    "Small natural watch size. Sharp detail. No white blobs or floating stickers.",
  ].join(" ");
}

/** Batch shoes/glasses/bag collage edit — one Kontext call for multiple extras. */
async function kontextAccessoriesBatch(opts: {
  falKey: string;
  personImage: string;
  productCollage: string;
  pieces: Piece[];
}): Promise<TryResult> {
  const labels = opts.pieces
    .map((p) => `${p.name || p.category}${(p.colors || []).length ? ` (${p.colors!.join(", ")})` : ""}`)
    .join("; ");
  const hasShoes = opts.pieces.some((p) => p.category === "shoes");
  const hasEyewear = opts.pieces.some(isEyewear);
  const prompt = [
    KEEP_YOU,
    KEEP_FRAMING,
    `RAW PHOTOREALISTIC EDIT. Image 2 shows the accessories to wear. Add ALL of them onto the person: ${labels}.`,
    hasShoes
      ? "You MUST completely replace the person's existing shoes with the new shoes. Put them ON both feet in a natural standing pose — never paste a product strip or collage inset at the bottom of the frame."
      : "",
    hasEyewear
      ? "Place thin realistic glasses frames on the existing face — never invent neon lenses or wipe/regenerate the head."
      : "",
    "Match each product’s exact colors and shapes.",
    "CRITICAL: MUST REMAIN RAW PHOTOGRAPHY. Keep face perfectly photorealistic, real human skin texture, highly detailed.",
    "NO cartoon skin, NO AI smoothing, NO painting effect. Do NOT change trousers, jacket, or shirt colors. Full-body crop with head and feet visible.",
  ]
    .filter(Boolean)
    .join(" ");

  const res = await fetch("https://fal.run/fal-ai/flux-pro/kontext/multi", {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_urls: [opts.personImage, opts.productCollage],
      guidance_scale: 4.4,
      num_images: 1,
      output_format: "jpeg",
      enhance_prompt: false,
      safety_tolerance: "5",
    }),
  });
  return parseFalImages(res);
}

/** Product-guided edit for shoes / glasses (image 2 = product). */
async function kontextProductEdit(opts: {
  falKey: string;
  personImage: string;
  productImage: string;
  piece: Piece;
  guidanceScale?: number;
}): Promise<TryResult> {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/kontext/multi", {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: shoeGlassesPrompt(opts.piece),
      image_urls: [opts.personImage, opts.productImage],
      guidance_scale: opts.guidanceScale ?? 4.5,
      num_images: 1,
      output_format: "jpeg",
      enhance_prompt: false,
      safety_tolerance: "5",
    }),
  });
  return parseFalImages(res);
}

/**
 * Watches: text-only Kontext on the dressed photo.
 * Product shots are often a hand holding a white dial — multi-image Kontext
 * copies that as a white blob on the wrist. Text edit avoids that.
 */
async function kontextWatchTextEdit(opts: {
  falKey: string;
  personImage: string;
  piece: Piece;
  guidanceScale?: number;
}): Promise<TryResult> {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/kontext", {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: watchTextPrompt(opts.piece),
      image_url: opts.personImage,
      guidance_scale: opts.guidanceScale ?? 3.5,
      num_images: 1,
      output_format: "jpeg",
      enhance_prompt: false,
      safety_tolerance: "5",
    }),
  });
  return parseFalImages(res);
}

/** Light drape/tuck/layer polish after FASHN — identity must stay locked by the client after. */
async function kontextStylePolish(opts: {
  falKey: string;
  personImage: string;
  prompt: string;
}): Promise<TryResult> {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/kontext", {
    method: "POST",
    headers: {
      Authorization: `Key ${opts.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: opts.personImage,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "jpeg",
      enhance_prompt: false,
      safety_tolerance: "5",
    }),
  });
  return parseFalImages(res);
}

async function applyFinishPiece(opts: {
  falKey: string;
  personImage: string;
  productImage: string;
  piece: Piece;
  timeoutMs?: number;
}): Promise<TryResult & { provider?: string; needsBilling?: boolean }> {
  const { falKey, personImage, productImage, piece, timeoutMs } = opts;
  // Premium default: FASHN Try-On Max understands feet and faces. Kontext is a
  // general image editor and pastes product sheets / rewrites heads — fallback only.
  // Set TRYON_FINISH_PROVIDER=kontext to cut cost at the expense of quality.
  const prefer =
    process.env.TRYON_FINISH_PROVIDER?.trim().toLowerCase() ||
    (hasFashnApiKey() ? "fashn" : "kontext");

  const tryFashnMax = async (): Promise<
    (TryResult & { provider?: string; needsBilling?: boolean }) | null
  > => {
    if (!hasFashnApiKey()) return null;
    if (!productImage && !isWatch(piece)) {
      return {
        ok: false,
        status: 400,
        detail: "product image required for FASHN accessory try-on",
      };
    }
    // Watches: product image still preferred; Max handles jewelry/watches.
    const edited = await fashnTryOnMax({
      modelImage: personImage,
      productImage: productImage || personImage,
      prompt: finishPromptForPiece(piece),
      timeoutMs,
    });
    if (edited.ok && edited.url !== personImage) {
      return { ...edited, provider: "fashn-tryon-max" };
    }
    if (!edited.ok && edited.needsBilling) {
      return {
        ok: false,
        status: edited.status,
        detail: edited.detail,
        needsBilling: true,
        provider: "fashn-tryon-max",
      };
    }
    if (edited.ok) {
      return {
        ok: false,
        status: 502,
        detail: "FASHN returned unchanged person image",
        provider: "fashn-tryon-max",
      };
    }
    return {
      ok: false,
      status: edited.status,
      detail: edited.detail,
      provider: "fashn-tryon-max",
    };
  };

  const tryOpenAI = async (): Promise<
    (TryResult & { provider?: string }) | null
  > => {
    if (!hasOpenAIImageKey()) return null;
    const edited = await openaiFinishEdit({
      personImage,
      productImage: productImage || undefined,
      piece,
    });
    if (edited.ok && edited.url !== personImage) {
      return { ...edited, provider: "openai-image" };
    }
    if (edited.ok) {
      return {
        ok: false,
        status: 502,
        detail: "OpenAI returned unchanged person image",
      };
    }
    return edited;
  };

  const tryKontext = async (): Promise<TryResult & { provider?: string }> => {
    if (!falKey) {
      return { ok: false, status: 503, detail: "FAL_KEY missing for Kontext" };
    }
    if (isWatch(piece)) {
      const edited = await kontextWatchTextEdit({
        falKey,
        personImage,
        piece,
        guidanceScale: 3.2,
      });
      if (edited.ok && edited.url !== personImage) {
        return { ...edited, provider: "kontext-watch-text" };
      }
      return edited.ok
        ? { ok: false, status: 502, detail: "watch unchanged" }
        : edited;
    }

    if (!productImage) {
      return { ok: false, status: 400, detail: "product image required" };
    }

    const guidance = isEyewear(piece)
      ? 6.0
      : piece.category === "shoes"
        ? 5.5
        : 4.2;
    const edited = await kontextProductEdit({
      falKey,
      personImage,
      productImage,
      piece,
      guidanceScale: guidance,
    });
    if (edited.ok && edited.url !== personImage) {
      return { ...edited, provider: "kontext-product" };
    }
    if (edited.ok) {
      return {
        ok: false,
        status: 502,
        detail: "kontext returned unchanged person image",
      };
    }
    return edited;
  };

  // Eyewear: FASHN Max first (faithful product transfer). Kontext reinvents
  // neon/lime lenses when tried first — keep it as fallback only.
  if (isEyewear(piece) && productImage) {
    const maxResult = await tryFashnMax();
    if (maxResult?.ok) return maxResult;
    if (maxResult?.needsBilling) return maxResult;
    if (falKey) {
      const eye = await tryKontext();
      if (eye.ok) return eye;
      return maxResult || eye;
    }
    return (
      maxResult || {
        ok: false,
        status: 503,
        detail: "No eyewear provider available",
      }
    );
  }

  if (prefer === "fashn" || prefer === "fashn-max" || prefer === "tryon-max") {
    const maxResult = await tryFashnMax();
    if (maxResult?.ok) return maxResult;
    if (maxResult?.needsBilling) return maxResult;
    if (maxResult && !maxResult.ok) {
      console.warn(
        `[tryon] FASHN finish failed for ${piece.name || piece.category}, trying Kontext:`,
        maxResult.detail?.slice(0, 200)
      );
    }
    return tryKontext();
  }

  if (prefer === "openai") {
    const openaiResult = await tryOpenAI();
    if (openaiResult?.ok) return openaiResult;
    if (openaiResult && !openaiResult.ok) {
      console.warn(
        `[tryon] OpenAI finish failed for ${piece.name || piece.category}, trying Kontext:`,
        openaiResult.detail?.slice(0, 200)
      );
    }
    return tryKontext();
  }

  return tryKontext();
}

function apparelCategory(
  category: string
): "tops" | "bottoms" | "one-pieces" | null {
  if (category === "bottom") return "bottoms";
  if (category === "dress") return "one-pieces";
  if (category === "top" || category === "outerwear") return "tops";
  return null;
}

/** Finishing order. Eyewear last — it morphs the face; client re-locks after. */
function orderFinishPieces(
  garments: Piece[],
  includeFaceAccessories: boolean
): Piece[] {
  const shoes = garments
    .filter((g) => isRealFootwear(g))
    .slice(0, 1);
  const bags = garments.filter((g) => g.category === "bag").slice(0, 1);
  const accessories = garments.filter(
    (g) => g.category === "accessory" && !isHosieryOrSocks(g)
  );
  const eyewear = accessories.filter(isEyewear);
  const watches = accessories.filter(isWatch);
  const other = accessories.filter((g) => !isEyewear(g) && !isWatch(g));
  if (!includeFaceAccessories) {
    // Shoes (+ bag) — glasses/watch Kontext passes often rewrite the face and crop the body.
    return [...shoes, ...bags];
  }
  // Glasses last so identity restore can run immediately after the batch
  return [...shoes, ...bags, ...watches, ...other, ...eyewear];
}

export async function POST(req: NextRequest) {
  // Premium models are slower. Finish work must stop with time to spare or the
  // platform kills the function and the client receives an HTML error page.
  const requestStart = Date.now();
  const budgetMs = (maxDuration - 25) * 1000;
  const msLeft = () => budgetMs - (Date.now() - requestStart);

  const body = await req.json();
  const garmentsPreview = Array.isArray(body.garments) ? body.garments : [];
  const auth = await requireTryOnAccess(req, {
    stage: typeof body.stage === "string" ? body.stage : "auto",
    garmentCount: garmentsPreview.length,
  });
  if (!isAuthedUser(auth)) return auth;

  const falKey = process.env.FAL_KEY?.trim();
  const personImage = body.personImage as string | undefined;
  const garments = (body.garments || []) as Piece[];
  const stage = (body.stage as string) || "auto";
  const maxPieces = Math.min(Number(body.maxPieces) || 6, 6);
  // Face accessories (glasses/watch) only when client explicitly asks — they morph identity.
  const includeFaceAccessories = Boolean(body.includeFaceAccessories);
  const stripOuterwear = Boolean(body.stripOuterwear);
  const stylingPrompt =
    typeof body.stylingPrompt === "string" ? body.stylingPrompt.trim() : "";
  let consumedFreeTryOn = false;

  if (!personImage) {
    return NextResponse.json({ error: "personImage required" }, { status: 400 });
  }

  // Style-only polish on an already-dressed photo
  if (stage === "style") {
    if (!falKey) {
      return NextResponse.json({
        ok: false,
        needsKey: true,
        message: "Add FAL_KEY for style polish",
      });
    }
    if (!stylingPrompt) {
      return NextResponse.json({
        ok: true,
        imageUrl: personImage,
        steps: [],
        skipped: true,
      });
    }
    const polished = await kontextStylePolish({
      falKey,
      personImage,
      prompt: `${KEEP_YOU} ${KEEP_FRAMING} Styling polish: ${stylingPrompt}. Ensure photoreal clothing drape. DO NOT change the face, background, or body shape under any circumstances.`,
    });
    if (!polished.ok) {
      if (isFalBillingError(polished.detail)) {
        // Soft-fail style polish — never block the dressed look for users
        return NextResponse.json({
          ok: true,
          imageUrl: personImage,
          steps: [],
          warnings: ["Style polish skipped — try again later"],
        });
      }
      // Soft-fail: keep the FASHN clothes result
      return NextResponse.json({
        ok: true,
        imageUrl: personImage,
        steps: [],
        warnings: [
          `Style polish skipped${polished.detail ? `: ${polished.detail.slice(0, 120)}` : ""}`,
        ],
      });
    }
    return NextResponse.json({
      ok: true,
      imageUrl: polished.url,
      steps: [
        {
          category: "style",
          name: "Layering polish",
          url: polished.url,
          provider: "kontext",
        },
      ],
    });
  }

  if (!hasFashnApiKey() && !falKey && !hasOpenAIImageKey()) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      message:
        "Add FASHN_API_KEY for clothes try-on (preferred). Optional: FAL_KEY for extras, OPENAI_API_KEY for shoes/glasses.",
    });
  }

  if ((stage === "auto" || stage === "apparel") && !hasFashnApiKey() && !falKey) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      message:
        "Add FASHN_API_KEY from https://fashn.ai (Try-On Max). FAL_KEY is only a fallback.",
    });
  }

  const apparelOrder = ["top", "dress", "bottom", "outerwear"] as const;
  const apparel = apparelOrder
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean) as Piece[];
  const finish = orderFinishPieces(
    garments,
    includeFaceAccessories || stage === "finish" || stage === "all"
  );

  let current = personImage;
  let apparelBaseUrl = personImage;
  const steps: {
    id?: string;
    category: string;
    name?: string;
    url: string;
    provider?: string;
  }[] = [];
  const warnings: string[] = [];

  const runApparel = stage === "auto" || stage === "apparel";
  const runFinish = stage === "auto" || stage === "finish";

  if (stage === "all" && hasFashnApiKey()) {
    const allPieces = [...apparel, ...finish];
    if (allPieces.length > 0) {
      try {
        const productImages = await Promise.all(
          allPieces.map((g) => resolveGarmentImageForFal(g.imageUrl))
        );
        const collage = await composeApparelCollage(productImages);
        
        let promptPieces = allPieces.map(g => {
          if (g.category === "shoes") return `shoes: ${g.name || "shoes"}`;
          if (g.category === "accessory") return `accessory: ${g.name || "accessory"}`;
          return `${g.category}: ${g.name || g.category}`;
        }).join(", ");

        const prompt = `The person must wear all of these items from the collage: ${promptPieces}. Keep the face perfectly identical. Keep the background completely unchanged. Do not alter the person's body or skin tone. Put the exact items from the collage onto the person. IMPORTANT: ONLY apply the specific items listed. DO NOT copy undergarments, ties, inner shirts, or other extra clothing worn by the models in the product images unless they are explicitly listed.`;

        const allResult = await fashnTryOnMax({
          modelImage: current,
          productImage: collage,
          prompt,
          timeoutMs: Math.min(110_000, Math.max(20_000, msLeft() - 25_000)),
        });

        if (allResult.ok) {
          current = allResult.url;
          for (const g of allPieces) {
            steps.push({
              id: g.id,
              category: g.category,
              name: g.name,
              url: current,
              provider: "fashn-tryon-max-all",
            });
          }
        } else if (allResult.needsBilling) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            error: "FASHN Trial ended.",
            code: "billing_required",
          });
        } else {
          warnings.push("FASHN all-pass failed: " + allResult.detail);
        }
      } catch (err) {
        warnings.push("Error preparing all-pass collage: " + (err instanceof Error ? err.message : String(err)));
      }
    }
    
    return NextResponse.json({
      ok: true,
      imageUrl: current,
      steps,
      warnings,
      consumedFreeTryOn,
    });
  }

  if (runApparel) {
    // Base clothes first, outerwear last
    const ordered = [
      ...apparel.filter((g) => g.category !== "outerwear"),
      ...apparel.filter((g) => g.category === "outerwear"),
    ].slice(0, maxPieces);

    const basePieces = ordered.filter((g) => g.category !== "outerwear");
    const outerPieces = ordered.filter((g) => g.category === "outerwear");
    const shouldStrip =
      stripOuterwear || (outerPieces.length === 0 && basePieces.length > 0);

    let baseAppliedViaCollage = false;

    // One FASHN call for top+bottom. Jacket stays a separate layer pass so
    // suit/blazer product shots can’t replace the trousers from the collage.
    if (basePieces.length >= 2 && hasFashnApiKey()) {
      try {
        const productImages = await Promise.all(
          basePieces.map((g) => resolveGarmentImageForFal(g.imageUrl))
        );
        const collage = await composeApparelCollage(productImages);
        const collageResult = await fashnTryOnMax({
          modelImage: current,
          productImage: collage,
          prompt: collageApparelPrompt(basePieces, {
            stripOuterwear: shouldStrip,
          }),
          timeoutMs: Math.min(110_000, Math.max(20_000, msLeft() - 25_000)),
        });

        if (collageResult.ok) {
          current = collageResult.url;
          apparelBaseUrl = current;
          baseAppliedViaCollage = true;
          for (const g of basePieces) {
            steps.push({
              id: g.id,
              category: g.category,
              name: g.name,
              url: current,
              provider: "fashn-tryon-max-collage",
            });
          }
        } else if (collageResult.needsBilling) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            code: "tryon_busy",
            error: "Dressing temporarily unavailable",
            detail: collageResult.detail,
            imageUrl: steps.length ? current : undefined,
            steps,
            message: userTryOnUnavailableMessage(),
          });
        } else {
          warnings.push(
            `Full-look collage skipped${
              collageResult.detail
                ? `: ${collageResult.detail.slice(0, 120)}`
                : ""
            }`
          );
        }
      } catch (err) {
        warnings.push(
          `Full-look collage failed: ${
            err instanceof Error ? err.message.slice(0, 120) : "unknown"
          }`
        );
      }
    }

    const sequential = [
      ...(baseAppliedViaCollage ? [] : basePieces),
      ...outerPieces,
    ];

    for (const g of sequential) {
      let garmentImage: string;
      try {
        garmentImage = await resolveGarmentImageForFal(g.imageUrl);
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            error: `Couldn’t load garment image for ${g.name || g.category}`,
            detail: err instanceof Error ? err.message : "image resolve failed",
          },
          { status: 400 }
        );
      }

      if (g.category === "outerwear") {
        apparelBaseUrl = current;
      }

      // Kontext-first only for structured blazers/coats — FASHN "tops" mode
      // can swap trousers from a full-suit shot. Soft layers (sweater, zip
      // knit, cardigan) go FASHN-first so the real product color lands.
      let result: TryResult & { provider?: string; needsBilling?: boolean };
      if (needsKontextOuterwearFirst(g) && falKey) {
        const kontext = await kontextOuterwearLayer({
          falKey,
          personImage: current,
          productImage: garmentImage,
          piece: g,
        });
        if (kontext.ok) {
          result = { ...kontext, provider: "kontext-outerwear" };
        } else {
          result = await applyApparelPiece({
            falKey: falKey || "",
            modelImage: current,
            garmentImage,
            piece: g,
            stripOuterwear: false,
            timeoutMs: Math.min(90_000, Math.max(15_000, msLeft() - 20_000)),
          });
        }
      } else {
        result = await applyApparelPiece({
          falKey: falKey || "",
          modelImage: current,
          garmentImage,
          piece: g,
          stripOuterwear: shouldStrip && g.category !== "outerwear",
          timeoutMs: Math.min(90_000, Math.max(15_000, msLeft() - 20_000)),
        });

        // Soft outerwear / remaining outerwear: Kontext only if FASHN failed
        if (
          !result.ok &&
          g.category === "outerwear" &&
          falKey &&
          !result.needsBilling
        ) {
          const kontext = await kontextOuterwearLayer({
            falKey,
            personImage: current,
            productImage: garmentImage,
            piece: g,
          });
          if (kontext.ok) {
            result = { ...kontext, provider: "kontext-outerwear" };
          }
        }
      }

      if (!result.ok) {
        if (result.needsBilling || isFalBillingError(result.detail)) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            code: "tryon_busy",
            error: "Dressing temporarily unavailable",
            detail: result.detail,
            imageUrl: steps.length ? current : undefined,
            apparelBaseUrl:
              g.category === "outerwear" ? apparelBaseUrl : undefined,
            steps,
            message: userTryOnUnavailableMessage(),
          });
        }

        if (g.category === "outerwear") {
          warnings.push(
            `Couldn’t layer ${g.name || "outerwear"}${
              result.detail ? `: ${result.detail.slice(0, 120)}` : ""
            }`
          );
          continue;
        }

        return NextResponse.json(
          {
            ok: false,
            error: `Try-on failed on ${g.name || g.category}`,
            detail: result.detail,
            imageUrl: steps.length ? current : undefined,
            steps,
          },
          { status: 502 }
        );
      }

      if (result.url === current) {
        if (g.category === "outerwear") {
          warnings.push(`Outerwear unchanged for ${g.name || "outerwear"}`);
          continue;
        }
      }

      current = result.url;
      if (g.category !== "outerwear") {
        apparelBaseUrl = current;
      }
      steps.push({
        id: g.id,
        category: g.category,
        name: g.name,
        url: result.url,
        provider: result.provider || "fashn",
      });
    }
  }

  if (runFinish && finish.length) {
    const shoePieces = finish.filter((g) => isRealFootwear(g));
    // Never treat mistagged jeans/apparel (category=shoes but not footwear) as accessories
    const otherFinish = finish.filter(
      (g) => !isRealFootwear(g) && g.category !== "shoes"
    );
    // Watches stay text-only (product collage often blobs). Glasses/bags can batch.
    const watchPieces = otherFinish.filter(isWatch);
    const eyewearPieces = otherFinish.filter(isEyewear);
    const bagPieces = otherFinish.filter((g) => g.category === "bag");
    const otherAccessories = otherFinish.filter(
      (g) => !isWatch(g) && !isEyewear(g) && g.category !== "bag"
    );
    // One FAL/Kontext collage covers bags, glasses and small extras.
    // Shoes go through FASHN Try-On Max when available — a collage edit tends to
    // paste the shoe product sheet at the bottom instead of re-footing the person.
    // Watches stay text-only (product collage blobs the dial).
    const premiumFinish = hasFashnApiKey();
    const batchable = premiumFinish 
      ? [] 
      : [
          ...shoePieces,
          ...bagPieces,
          ...otherAccessories,
          ...eyewearPieces,
        ];

    const runOne = async (g: Piece) => {
      if (msLeft() < 30_000) {
        warnings.push(`Ran out of time for ${g.name || g.category}`);
        return;
      }
      let productImage = "";
      try {
        productImage = await resolveGarmentImageForFal(g.imageUrl);
      } catch (err) {
        if (!isWatch(g)) {
          warnings.push(
            `Skipped ${g.name}: ${err instanceof Error ? err.message : "load failed"}`
          );
          return;
        }
      }

      const edited = await applyFinishPiece({
        falKey: falKey || "",
        personImage: current,
        productImage,
        piece: g,
        timeoutMs: Math.min(80_000, Math.max(15_000, msLeft() - 20_000)),
      });

      if (!edited.ok) {
        if (
          ("needsBilling" in edited && edited.needsBilling) ||
          isFalBillingError(edited.detail)
        ) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            code: "tryon_busy",
            error: "Dressing temporarily unavailable",
            detail: edited.detail,
            imageUrl: current,
            steps,
            partial: true,
            message: userTryOnUnavailableMessage(),
          });
        }
        console.error(
          `[tryon] finish failed for ${g.name || g.category}:`,
          edited.detail?.slice(0, 400)
        );
        warnings.push(
          `Couldn’t apply ${g.name || g.category}${
            edited.detail ? ` (${edited.detail.slice(0, 120)})` : ""
          }`
        );
        return;
      }

      current = edited.url;
      steps.push({
        id: g.id,
        category: g.category,
        name: g.name,
        url: edited.url,
        provider: edited.provider || "finish",
      });
    };

    // 1) Shoes on the premium try-on model (feet region)
    if (premiumFinish) {
      for (const g of shoePieces) {
        const billed = await runOne(g);
        if (billed instanceof NextResponse) return billed;
      }
    }

    // 2) Remaining extras together in one FAL Kontext collage
    let batchApplied = false;
    if (batchable.length >= 1 && falKey && msLeft() > 30_000) {
      try {
        const productImages = await Promise.all(
          batchable.map((g) => resolveGarmentImageForFal(g.imageUrl))
        );
        const collage =
          batchable.length === 1
            ? productImages[0]
            : await composeApparelCollage(productImages);
        const batched = await kontextAccessoriesBatch({
          falKey,
          personImage: current,
          productCollage: collage,
          pieces: batchable,
        });
        if (batched.ok) {
          current = batched.url;
          batchApplied = true;
          for (const g of batchable) {
            steps.push({
              id: g.id,
              category: g.category,
              name: g.name,
              url: current,
              provider: "kontext-accessories-batch",
            });
          }
        } else if (isFalBillingError(batched.detail)) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            code: "tryon_busy",
            error: "Dressing temporarily unavailable",
            detail: batched.detail,
            imageUrl: current,
            steps,
            partial: true,
            message: userTryOnUnavailableMessage(),
          });
        } else {
          warnings.push(
            `Accessory batch skipped${
              batched.detail ? `: ${batched.detail.slice(0, 120)}` : ""
            }`
          );
        }
      } catch (err) {
        warnings.push(
          `Accessory batch failed: ${
            err instanceof Error ? err.message.slice(0, 120) : "unknown"
          }`
        );
      }
    }

    // Fallback: apply the collage pieces one-by-one if the batch missed
    if (!batchApplied) {
      for (const g of batchable) {
        const billed = await runOne(g);
        if (billed instanceof NextResponse) return billed;
      }
    }

    // 3) Watch text-only (fast; doesn’t need product image)
    for (const g of watchPieces) {
      const billed = await runOne(g);
      if (billed instanceof NextResponse) return billed;
    }
  }

  if (stage === "finish" && finish.length) {
    const appliedFinish = steps.some((s) =>
      finish.some(
        (g) => g.category === s.category && (g.name ? g.name === s.name : true)
      )
    );
    if (!appliedFinish) {
      return NextResponse.json({
        ok: false,
        applied: false,
        error: `Couldn’t put on ${finish[0].name || finish[0].category}`,
        detail: warnings.join(" · ") || "finish backends failed",
        imageUrl: current,
        steps,
        warning: warnings.join(" · ") || undefined,
      });
    }
  }

  if (!steps.length && stage !== "finish") {
    return NextResponse.json(
      { error: "No wearable garments in outfit" },
      { status: 400 }
    );
  }

  // Burn free gift / monthly full-look quota after a successful apparel dress
  const isApparelStage =
    stage === "apparel" ||
    stage === "auto" ||
    stage === "collage" ||
    stage === "all" ||
    stage === "base";
  let photoTryOnsThisMonth: number | undefined;
  let photoTryOnsMonthKey: string | undefined;
  let photoTryOnCredits: number | undefined;
  if (isApparelStage && steps.length > 0) {
    try {
      const burn = await consumeFreePhotoTryOn(auth.uid);
      consumedFreeTryOn = burn.consumed;
    } catch (err) {
      console.error("[FASHN] Failed to consume free photo try-on:", err);
      // fallback to true on client so they don't get infinite loops if DB fails
      consumedFreeTryOn = true;
    }
    // Full looks only (2+ garments) — surgical swaps stay free of the monthly cap
    if (garments.length >= 2) {
      try {
        const monthly = await consumeMonthlyPhotoTryOn(auth.uid, {
          email: auth.email,
        });
        if (monthly.consumed || monthly.used > 0) {
          photoTryOnsThisMonth = monthly.used;
          photoTryOnsMonthKey = monthly.monthKey;
        }
        if (typeof monthly.credits === "number") {
          photoTryOnCredits = monthly.credits;
        }
      } catch {
        // don't fail the dress if counter write fails
      }
    }
  }

  return NextResponse.json({
    ok: true,
    applied: true,
    provider: hasFashnApiKey() ? "fashn-tryon-max" : "fal-fashn+full-look",
    imageUrl: current,
    /** Pre-outerwear result — client composites coat without rewriting shirt/pants. */
    apparelBaseUrl:
      runApparel && apparelBaseUrl !== current ? apparelBaseUrl : undefined,
    steps,
    consumedFreeTryOn: consumedFreeTryOn || undefined,
    photoTryOnsThisMonth,
    photoTryOnsMonthKey,
    photoTryOnCredits,
    ...(warnings.length ? { warning: warnings.join(" · ") } : {}),
  });
}

export async function GET() {
  return NextResponse.json({
    configured: hasFashnApiKey() || Boolean(process.env.FAL_KEY?.trim()),
    fashnMax: hasFashnApiKey(),
    falFallback: Boolean(process.env.FAL_KEY?.trim()),
    openaiImage: hasOpenAIImageKey(),
    finishProvider:
      process.env.TRYON_FINISH_PROVIDER?.trim() ||
      (hasFashnApiKey() ? "fashn" : "kontext"),
    provider: hasFashnApiKey()
      ? "fashn tryon-max (clothes + shoes); kontext accessory batch"
      : "fal-fashn v1.6 fallback",
  });
}
