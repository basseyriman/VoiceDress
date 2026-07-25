import { NextRequest, NextResponse } from "next/server";
import { resolveGarmentImageForFal } from "@/lib/garment-resolve";

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
  // Balanced is the speed/quality sweet spot. Quality is too slow for a
  // multi-piece look; performance looks pasted-on.
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
        output_format: "jpeg",
      }),
    });
    return parseFalImages(res);
  };
  const primary = await call("balanced");
  if (primary.ok) return primary;
  return call("performance");
}

const KEEP_YOU =
  "Keep the exact same person from image 1: same face, skin, hair, body, pose, hands, lighting, and background. Photorealistic fabric on the real body — not a pasted cutout.";

const KEEP_FRAMING =
  "Keep the exact same camera distance, crop, and full-body framing. Do not zoom or reframe.";

function shoeGlassesPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  if (piece.category === "shoes") {
    return [
      KEEP_YOU,
      KEEP_FRAMING,
      `Replace ALL footwear on BOTH feet with the shoes from image 2 (${look}).`,
      "Match color and material from image 2. Natural on the real feet.",
      "Do not alter face or other clothes.",
    ].join(" ");
  }
  return [
    KEEP_YOU,
    KEEP_FRAMING,
    `Place the glasses from image 2 (${look}) on the person's face — on the nose and ears.`,
    "Same face underneath. Only add the frames.",
  ].join(" ");
}

function watchTextPrompt(piece: Piece): string {
  const look = pieceLook(piece);
  return [
    "Edit this photo only.",
    "Keep the exact same person, face, body, pose, clothes, shoes, glasses, lighting, and background.",
    "Keep the exact same full-body framing — do not zoom or crop.",
    `Add one realistic wristwatch on the most visible wrist: ${look}.`,
    "Small natural watch size with a clear case, dial, and strap. Sharp detail.",
    "Do NOT paint white blobs, flares, circles, or abstract shapes on the wrist.",
    "Do NOT change the hands or arms except for adding the watch.",
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

  // Few attempts — retries were making dress time feel endless.
  if (isWatch(piece)) {
    for (const guidance of [3.5, 2.8]) {
      const edited = await kontextWatchTextEdit({
        falKey,
        personImage,
        piece,
        guidanceScale: guidance,
      });
      if (edited.ok && edited.url !== personImage) {
        return { ...edited, provider: "kontext-watch-text" };
      }
      if (edited.ok === false && isFalBillingError(edited.detail)) return edited;
    }
    return {
      ok: false,
      status: 502,
      detail: "watch text edit failed",
    };
  }

  const attempts = piece.category === "shoes" ? [6, 4.5] : [5, 4];
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
    for (const g of finish) {
      let productImage = "";
      if (!isWatch(g)) {
        try {
          productImage = await resolveGarmentImageForFal(g.imageUrl);
        } catch (err) {
          warnings.push(
            `Skipped ${g.name}: ${err instanceof Error ? err.message : "load failed"}`
          );
          continue;
        }
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
    provider: "fashn apparel + kontext finish (watch text-only)",
  });
}
