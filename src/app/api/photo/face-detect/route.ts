import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { getOpenAI } from "@/lib/ai";
import { z } from "zod";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Note: requireAuth expects NextRequest, but works with Request if we use headers.get
    const auth = await requireAuth(req as any);
    if (!isAuthedUser(auth)) {
      return auth; // Returns the 401 NextResponse from requireAuth
    }
    const user = auth;

    const { imageUrl } = await req.json();
    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    const openai = getOpenAI();
    if (!openai) {
       return NextResponse.json({ faceCenterY: 0.138 }); // Fallback
    }

    const res = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        faceX: z.number().describe("The horizontal center of the face as a ratio (0.0 to 1.0)"),
        faceY: z.number().describe("The vertical center of the face as a ratio (0.0 to 1.0)"),
        faceWidth: z.number().describe("The width of the face as a ratio of the image width (0.0 to 1.0)"),
        faceHeight: z.number().describe("The height of the face as a ratio of the image height (0.0 to 1.0)"),
      }),
      messages: [
        {
          role: "system",
          content: "You are a precise computer vision assistant. Locate the main person's face in the photo."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Return the exact bounding box of the person's face/head. The values must be a ratio between 0.0 and 1.0 relative to the image dimensions. Return the center X, center Y, width, and height." },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });

    return NextResponse.json(res.object);
  } catch (error) {
    console.error("[face-detect] Error:", error);
    return NextResponse.json({ faceX: 0.5, faceY: 0.138, faceWidth: 0.68, faceHeight: 0.4 });
  }
}
