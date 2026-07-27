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
}): Promise<TryResult & { provider?: string; needsBilling?: boolean }> {
  const prompt = apparelPromptForPiece(opts.piece, {
    stripOuterwear: opts.stripOuterwear,
  });

  if (hasFashnApiKey()) {
    const max = await fashnTryOnMax({
      modelImage: opts.modelImage,
      productImage: opts.garmentImage,
      prompt,
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

function shoeGlassesPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  if (piece.category === "shoes") {
    const boot =
      /boot|chelsea|knee[- ]?high|ankle\s*boot/i.test(
        `${piece.name || ""} ${(piece.tags || []).join(" ")}`
      );
    return [
      KEEP_YOU,
      KEEP_FRAMING,
      `Change ONLY the footwear on BOTH feet using image 2 (${look}).`,
      boot
        ? "If image 2 is boots, keep boot height realistic but do not cover or rewrite the dress/skirt/trousers above the boot shaft."
        : "These are shoes/pumps/flats/sneakers — ankle height only. Do NOT paint mid-calf or knee boots. Do NOT extend footwear up the legs.",
      "Keep the dress, skirt, trousers, jacket, and everything from mid-shin upward pixel-identical to image 1 — do not blur, feather, recolor, or regenerate the garment hem.",
      "Match shoe color from image 2 exactly. Do not invent denim. Do not alter face, torso, or background.",
    ].join(" ");
  }
  return [
    KEEP_YOU,
    KEEP_FRAMING,
    `Place ONLY the glasses from image 2 (${look}) on the person's existing face.`,
    "Match frame shape and lens tint from image 2 exactly — never invent neon, lime, or green lenses unless image 2 has them.",
    "Do not redesign or regenerate the face. Same eyes, nose, mouth, skin. Only add thin frames.",
    "Do not recolor or restyle clothes, shoes, or background — keep their exact colors. Do not change trousers to jeans.",
  ].join(" ");
}

/**
 * Outerwear via Kontext multi — FASHN has no jacket category and often
 * drops or morphs blazers into long cream coats when forced into "tops".
 */
function outerwearLayerPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  const blazer = isBlazerPiece(piece);
  const coat = isCoatPiece(piece) && !blazer;
  const silhouette = blazer
    ? "structured hip-length blazer with notch lapels — NOT a long overcoat, trench, duster, or cape"
    : coat
      ? "full-length coat matching image 2 — same length and color, not a short blazer"
      : "outer jacket matching image 2 exactly — same length, cut, and color";

  return [
    KEEP_YOU,
    KEEP_FRAMING,
    `Layer ONLY the outerwear jacket from image 2 (${look}) over the person's existing top.`,
    `It must be a ${silhouette}.`,
    "If image 2 shows a full suit, use ONLY the jacket — do NOT replace the person's existing trousers with suit pants or jeans.",
    "Match the exact color from image 2 (if navy/midnight blue, keep it deep navy — never cream, ivory, camel, beige, or washed-out grey).",
    "Keep the top underneath visible at the neckline/hem where natural. Do not replace the top with the jacket alone.",
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
  const prompt = [
    KEEP_YOU,
    KEEP_FRAMING,
    `Image 2 is a collage of accessories. Add ALL of them onto the person: ${labels}.`,
    "Match each product’s exact colors and shapes. Thin realistic glasses frames if present — never invent neon lenses.",
    "Small natural watch size if a watch is in the collage.",
    "Do NOT change trousers, jacket, shirt, or shoe colors. Keep face photoreal — no cartoon skin.",
  ].join(" ");

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
}): Promise<TryResult & { provider?: string; needsBilling?: boolean }> {
  const { falKey, personImage, productImage, piece } = opts;
  // Cost model: clothes on FASHN; finish (shoes/watch/bag/glasses) on Kontext.
  // Override with TRYON_FINISH_PROVIDER=fashn or openai only if you accept the bill.
  const prefer =
    process.env.TRYON_FINISH_PROVIDER?.trim().toLowerCase() || "kontext";

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

    const guidance = piece.category === "shoes" ? 5.5 : 4.2;
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
      prompt: stylingPrompt,
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
    includeFaceAccessories || stage === "finish"
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

      // Prefer Kontext for outerwear — FASHN "tops" mode often replaces
      // trousers with suit pants from a full-suit product shot.
      let result: TryResult & { provider?: string; needsBilling?: boolean };
      if (g.category === "outerwear" && falKey) {
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
          });
        }
      } else {
        result = await applyApparelPiece({
          falKey: falKey || "",
          modelImage: current,
          garmentImage,
          piece: g,
          stripOuterwear: shouldStrip && g.category !== "outerwear",
        });

        // Outerwear only: if Max/fal failed and we still have fal, try Kontext layer
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
    const otherFinish = finish.filter((g) => !isRealFootwear(g));
    // Watches stay text-only (product collage often blobs). Glasses/bags can batch.
    const watchPieces = otherFinish.filter(isWatch);
    const batchable = otherFinish.filter((g) => !isWatch(g));

    const runOne = async (g: Piece) => {
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

    // 1) Shoes first (feet region)
    for (const g of shoePieces) {
      const billed = await runOne(g);
      if (billed instanceof NextResponse) return billed;
    }

    // 2) Glasses/bag in ONE collage call when 2+ (cuts accessory wait roughly in half)
    if (batchable.length >= 2 && falKey) {
      try {
        const productImages = await Promise.all(
          batchable.map((g) => resolveGarmentImageForFal(g.imageUrl))
        );
        const collage = await composeApparelCollage(productImages);
        const batched = await kontextAccessoriesBatch({
          falKey,
          personImage: current,
          productCollage: collage,
          pieces: batchable,
        });
        if (batched.ok) {
          current = batched.url;
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
          for (const g of batchable) {
            const billed = await runOne(g);
            if (billed instanceof NextResponse) return billed;
          }
        }
      } catch (err) {
        warnings.push(
          `Accessory batch failed: ${
            err instanceof Error ? err.message.slice(0, 120) : "unknown"
          }`
        );
        for (const g of batchable) {
          const billed = await runOne(g);
          if (billed instanceof NextResponse) return billed;
        }
      }
    } else {
      for (const g of batchable) {
        const billed = await runOne(g);
        if (billed instanceof NextResponse) return billed;
      }
    }

    // 3) Watch text-only last (fast; doesn’t need product image)
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
    stage === "base";
  let photoTryOnsThisMonth: number | undefined;
  let photoTryOnsMonthKey: string | undefined;
  let photoTryOnCredits: number | undefined;
  if (isApparelStage && steps.length > 0) {
    try {
      const burn = await consumeFreePhotoTryOn(auth.uid);
      consumedFreeTryOn = burn.consumed;
    } catch {
      // don't fail the dress if counter write fails
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
    finishProvider: process.env.TRYON_FINISH_PROVIDER?.trim() || "kontext",
    provider: hasFashnApiKey()
      ? "fashn tryon-max (clothes); kontext finish"
      : "fal-fashn v1.6 fallback",
  });
}
