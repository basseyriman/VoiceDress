import { NextRequest, NextResponse } from "next/server";
import { isAuthedUser, requireEntitled } from "@/lib/api-auth";

/**
 * Avatar generation adapter for Tripo3D / Meshy.
 * Client already stylizes + stores the lookalike locally.
 * With API keys, kick off 3D mesh jobs for a future viewer.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEntitled(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const name = body.name as string | undefined;
  const tripo = process.env.TRIPO_API_KEY;
  const meshy = process.env.MESHY_API_KEY;

  if (tripo && body.imageDataUrl) {
    try {
      await fetch("https://api.tripo3d.ai/v2/openapi/task", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tripo}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "image_to_model",
          file: {
            type: "jpg",
            data: String(body.imageDataUrl).split(",")[1],
          },
        }),
      });
    } catch {
      // optional
    }
  }

  if (meshy && typeof body.imageUrl === "string") {
    try {
      await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${meshy}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_url: body.imageUrl, enable_pbr: true }),
      });
    } catch {
      // optional
    }
  }

  return NextResponse.json({
    status: "ready",
    provider: tripo ? "tripo" : meshy ? "meshy" : "portrait",
    message: name
      ? `Lookalike avatar ready for ${name}`
      : "Lookalike avatar ready",
  });
}
