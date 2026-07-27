import { NextRequest, NextResponse } from "next/server";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

/**
 * Prepare a body photo for try-on: remove background with fal BiRefNet.
 * Client composites the cutout onto a studio plate.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const falKey = process.env.FAL_KEY?.trim();
  const body = await req.json().catch(() => ({}));
  const imageDataUrl = body.imageDataUrl as string | undefined;

  if (!imageDataUrl || !imageDataUrl.startsWith("data:")) {
    return NextResponse.json(
      { ok: false, error: "imageDataUrl required" },
      { status: 400 }
    );
  }

  if (!falKey) {
    return NextResponse.json({
      ok: false,
      needsKey: true,
      message:
        "Add FAL_KEY to clear backgrounds. Get a key at https://fal.ai/dashboard/keys",
    });
  }

  try {
    const res = await fetch("https://fal.run/fal-ai/birefnet/v2", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageDataUrl,
        model: "General Use (Light)",
        operating_resolution: "1024x1024",
        output_format: "png",
        refine_foreground: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        typeof data === "object" && data
          ? JSON.stringify(data).slice(0, 400)
          : String(data);
      if (/balance|billing|payment|quota|exhausted/i.test(detail)) {
        return NextResponse.json({
          ok: false,
          needsBilling: true,
          error: "fal.ai balance exhausted",
          message:
            "fal.ai credits are used up. Top up to clear photo backgrounds.",
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Background removal failed",
          detail,
        },
        { status: 502 }
      );
    }

    const cutoutUrl =
      (data?.image?.url as string | undefined) ||
      (data?.image_url as string | undefined);

    if (!cutoutUrl) {
      return NextResponse.json(
        { ok: false, error: "No cutout returned from background removal" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      cutoutUrl,
      provider: "fal-birefnet",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Background removal request failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 }
    );
  }
}
