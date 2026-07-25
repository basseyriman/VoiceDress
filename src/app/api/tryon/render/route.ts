import { NextRequest, NextResponse } from "next/server";
import { resolveGarmentImageForFal } from "@/lib/garment-resolve";

export const maxDuration = 300;

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
  // Prefer quality so face/body identity stays closer to the real photo.
  // Catalog garments are flat product shots → flat-lay.
  const call = async (mode: "quality" | "balanced" | "performance") => {
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
  const primary = await call("quality");
  if (primary.ok) return primary;
  const mid = await call("balanced");
  if (mid.ok) return mid;
  return call("performance");
}

const KEEP_YOU =
  "Preserve identity perfectly from image 1: same face, facial features, skin tone, hair, body proportions, pose, hands, and background. Only change the clothing/accessory described. Photorealistic, natural fabric drape on the real body — not a pasted cutout.";

const KEEP_FRAMING =
  "Keep the exact same camera distance, crop, and full-body framing as image 1. Do not zoom, do not reframe, do not change aspect ratio.";

function finishPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  if (piece.category === "shoes") {
    return [
      KEEP_YOU,
      KEEP_FRAMING,
      `Replace ALL footwear on BOTH feet with the exact shoes from image 2 (${look}).`,
      "Match color and material from image 2 precisely. Photorealistic on the real feet — no floating shoes.",
      "Do not alter face, skin, or other clothes.",
    ].join(" ");
  }
  if (isWatch(piece)) {
    return [
      KEEP_YOU,
      KEEP_FRAMING,
      `Add the watch from image 2 (${look}) on the most visible wrist.`,
      "Natural size on the wrist, matching metal and strap from image 2. Do not change the face or clothes.",
    ].join(" ");
  }
  return [
    KEEP_YOU,
    KEEP_FRAMING,
    `Place the glasses from image 2 (${look}) on the person's face — on the nose and ears.`,
    "Keep the exact same face underneath. Only add the frames. Photorealistic fit.",
  ].join(" ");
}

/** Product-guided local edit — preserves framing (no VTO models that zoom/crop). */
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
      prompt: finishPrompt(opts.piece),
      image_urls: [opts.personImage, opts.productImage],
      guidance_scale: opts.guidanceScale ?? 4.5,
      num_images: 1,
      output_format: "png",
      enhance_prompt: false,
      safety_tolerance: "5",
    }),
  });
  return parseFalImages(res);
}

/**
 * Finish pieces (shoes/glasses/watch) via Kontext only.
 * Do NOT use flux-vto / image-apps — they reframe to waist-up fashion crops
 * and hide the feet (shoes become invisible).
 */
async function applyFinishPiece(opts: {
  falKey: string;
  personImage: string;
  productImage: string;
  piece: Piece;
}): Promise<TryResult & { provider?: string }> {
  const { falKey, personImage, productImage, piece } = opts;

  const attempts =
    piece.category === "shoes"
      ? [7, 6, 5.5, 4.5]
      : isWatch(piece)
        ? [6.5, 5.5, 4.5, 3.8]
        : isEyewear(piece)
          ? [6, 5.5, 4.5, 3.8]
          : [4.5];

  let lastFail: TryResult = {
    ok: false,
    status: 502,
    detail: "finish edit failed",
  };

  for (const guidance of attempts) {
    const edited = await kontextProductEdit({
      falKey,
      personImage,
      productImage,
      piece,
      guidanceScale: guidance,
    });
    if (edited.ok) {
      if (edited.url === personImage) {
        lastFail = {
          ok: false,
          status: 502,
          detail: "kontext returned unchanged person image",
        };
        continue;
      }
      return { ...edited, provider: "kontext-product" };
    }
    lastFail = edited;
    if (isFalBillingError(edited.detail)) return edited;
  }

  return lastFail;
}

function apparelCategory(
  category: string
): "tops" | "bottoms" | "one-pieces" | null {
  if (category === "bottom") return "bottoms";
  if (category === "dress") return "one-pieces";
  if (category === "top" || category === "outerwear") return "tops";
  return null;
}

/** Full suggested look order for finishing: shoes → eyewear → watch */
function orderFinishPieces(garments: Piece[]): Piece[] {
  const shoes = garments.filter((g) => g.category === "shoes").slice(0, 1);
  const accessories = garments.filter((g) => g.category === "accessory");
  const eyewear = accessories.filter(isEyewear);
  const watches = accessories.filter(isWatch);
  const other = accessories.filter((g) => !isEyewear(g) && !isWatch(g));
  return [...shoes, ...eyewear, ...watches, ...other];
}

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_KEY?.trim();
  const body = await req.json();
  const personImage = body.personImage as string | undefined;
  const garments = (body.garments || []) as Piece[];
  const stage = (body.stage as string) || "auto";
  const maxPieces = Math.min(Number(body.maxPieces) || 6, 6);

  if (!personImage) {
    return NextResponse.json({ error: "personImage required" }, { status: 400 });
  }

  if (!falKey) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      message:
        "Add FAL_KEY to .env.local. Get a key at https://fal.ai/dashboard/keys",
    });
  }

  const apparelOrder = ["top", "dress", "bottom", "outerwear"] as const;
  const apparel = apparelOrder
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean) as Piece[];
  const finish = orderFinishPieces(garments);

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
        falKey,
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
    // Dress every finishing piece. On failure, KEEP the current dressed photo
    // (never snap back to the original undressed image).
    for (const g of finish) {
      let productImage: string;
      try {
        productImage = await resolveGarmentImageForFal(g.imageUrl);
      } catch (err) {
        warnings.push(
          `Skipped ${g.name}: ${err instanceof Error ? err.message : "load failed"}`
        );
        continue;
      }

      const edited = await applyFinishPiece({
        falKey,
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

  // Client sends stage:"finish" one piece at a time — never pretend shoes applied.
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
    provider: "fashn apparel + kontext finish (no zoom VTO)",
  });
}
