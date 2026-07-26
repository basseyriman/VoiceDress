import { NextRequest, NextResponse } from "next/server";
import { resolveGarmentImageForFal } from "@/lib/garment-resolve";
import {
  hasOpenAIImageKey,
  openaiFinishEdit,
} from "@/lib/openai-finish";

export const maxDuration = 180;

type Piece = {
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
    d.includes("insufficient") ||
    d.includes("out of credits") ||
    d.includes("payment required")
  );
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

async function fashnTryOn(opts: {
  falKey: string;
  modelImage: string;
  garmentImage: string;
  category: "tops" | "bottoms" | "one-pieces";
}): Promise<TryResult> {
  // Prefer balanced — quality mode can drift the face more on multi-garment runs.
  const call = async (mode: "balanced" | "performance") => {
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
        garment_photo_type: "flat-lay",
        moderation_level: "permissive",
        num_samples: 1,
        segmentation_free: true,
        output_format: "png",
      }),
    });
    return parseFalImages(res);
  };
  const primary = await call("balanced");
  if (primary.ok) return primary;
  return call("performance");
}

const KEEP_YOU =
  "CRITICAL: Keep the EXACT same person from image 1 — same face identity, facial features, skin tone, hair, body proportions, pose, hands, lighting, and background. Do not generate a different face or lookalike. Only change the clothing item described.";

const KEEP_FRAMING =
  "CRITICAL FRAMING: Keep the EXACT same full-body camera distance and crop as image 1. Head and both feet must stay fully visible. Do not zoom in, do not crop to waist-up, do not change aspect ratio.";

function shoeGlassesPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  if (piece.category === "shoes") {
    return [
      KEEP_YOU,
      KEEP_FRAMING,
      `Change ONLY the footwear below the ankles — replace BOTH shoes with image 2 (${look}).`,
      "Match tan/suede color from image 2 exactly. Keep jeans and everything from the knees up completely unchanged.",
      "Do not alter face, torso, or pant legs above the shin.",
    ].join(" ");
  }
  return [
    KEEP_YOU,
    KEEP_FRAMING,
    `Place ONLY the glasses from image 2 (${look}) on the person's existing face.`,
    "Do not redesign or regenerate the face. Same eyes, nose, mouth, skin. Only add thin frames.",
  ].join(" ");
}

function watchTextPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  return [
    "Edit this photo only.",
    "Keep the EXACT same person, face, body, pose, clothes, shoes, glasses, lighting, and background.",
    "Keep the exact same full-body framing — do not zoom or crop.",
    `Add one realistic wristwatch on the most visible wrist: ${look}.`,
    "Small natural watch size. Sharp detail. No white blobs or floating stickers.",
  ].join(" ");
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

async function applyFinishPiece(opts: {
  falKey: string;
  personImage: string;
  productImage: string;
  piece: Piece;
}): Promise<TryResult & { provider?: string }> {
  const { falKey, personImage, productImage, piece } = opts;
  const prefer =
    process.env.TRYON_FINISH_PROVIDER?.trim().toLowerCase() || "kontext";

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

  // Default: fal Kontext. OpenAI only if TRYON_FINISH_PROVIDER=openai.
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

/** Finishing order. Accessories that touch the face are opt-in — they morph identity. */
function orderFinishPieces(
  garments: Piece[],
  includeFaceAccessories: boolean
): Piece[] {
  const shoes = garments.filter((g) => g.category === "shoes").slice(0, 1);
  const accessories = garments.filter((g) => g.category === "accessory");
  const eyewear = accessories.filter(isEyewear);
  const watches = accessories.filter(isWatch);
  const other = accessories.filter((g) => !isEyewear(g) && !isWatch(g));
  if (!includeFaceAccessories) {
    // Shoes only — glasses/watch Kontext passes often rewrite the face and crop the body.
    return shoes;
  }
  return [...shoes, ...eyewear, ...watches, ...other];
}

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_KEY?.trim();
  const body = await req.json();
  const personImage = body.personImage as string | undefined;
  const garments = (body.garments || []) as Piece[];
  const stage = (body.stage as string) || "auto";
  const maxPieces = Math.min(Number(body.maxPieces) || 6, 6);
  // Face accessories (glasses/watch) only when client explicitly asks — they morph identity.
  const includeFaceAccessories = Boolean(body.includeFaceAccessories);

  if (!personImage) {
    return NextResponse.json({ error: "personImage required" }, { status: 400 });
  }

  if (!falKey && !hasOpenAIImageKey()) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      message:
        "Add FAL_KEY (clothes) and/or OPENAI_API_KEY (shoes/glasses/watch) to .env.local",
    });
  }

  if ((stage === "auto" || stage === "apparel") && !falKey) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      message:
        "Add FAL_KEY to .env.local for clothes try-on. Get a key at https://fal.ai/dashboard/keys",
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
  const steps: { category: string; name?: string; url: string; provider?: string }[] =
    [];
  const warnings: string[] = [];

  const runApparel = stage === "auto" || stage === "apparel";
  const runFinish = stage === "auto" || stage === "finish";

  if (runApparel) {
    for (const g of apparel.slice(0, maxPieces)) {
      const fashnCat = apparelCategory(g.category);
      if (!fashnCat) continue;

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

      const result = await fashnTryOn({
        falKey: falKey as string,
        modelImage: current,
        garmentImage,
        category: fashnCat,
      });

      if (!result.ok) {
        if (isFalBillingError(result.detail)) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            error: "fal.ai balance exhausted",
            detail: result.detail,
            imageUrl: steps.length ? current : undefined,
            steps,
            message:
              "Your fal.ai credits are used up. Top up at fal.ai/dashboard/billing, then retry.",
          });
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

      current = result.url;
      steps.push({
        category: g.category,
        name: g.name,
        url: result.url,
        provider: "fashn",
      });
    }
  }

  if (runFinish && finish.length) {
    for (const g of finish) {
      let productImage = "";
      try {
        productImage = await resolveGarmentImageForFal(g.imageUrl);
      } catch (err) {
        // Watch text-only Kontext can proceed without product; OpenAI prefers it.
        if (!isWatch(g)) {
          warnings.push(
            `Skipped ${g.name}: ${err instanceof Error ? err.message : "load failed"}`
          );
          continue;
        }
      }

      const edited = await applyFinishPiece({
        falKey: falKey || "",
        personImage: current,
        productImage,
        piece: g,
      });

      if (!edited.ok) {
        if (isFalBillingError(edited.detail)) {
          return NextResponse.json({
            ok: false,
            needsBilling: true,
            error: "fal.ai balance exhausted",
            detail: edited.detail,
            imageUrl: current,
            steps,
            partial: true,
            message:
              "Your fal.ai credits are used up. Top up at fal.ai/dashboard/billing, then retry.",
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
        continue;
      }

      current = edited.url;
      steps.push({
        category: g.category,
        name: g.name,
        url: edited.url,
        provider: edited.provider || "finish",
      });
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

  return NextResponse.json({
    ok: true,
    applied: true,
    provider: "fal-fashn+full-look",
    imageUrl: current,
    steps,
    ...(warnings.length ? { warning: warnings.join(" · ") } : {}),
  });
}

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.FAL_KEY?.trim()),
    openaiImage: hasOpenAIImageKey(),
    finishProvider: process.env.TRYON_FINISH_PROVIDER?.trim() || "kontext",
    provider: "fashn apparel + kontext finish (openai optional)",
  });
}
