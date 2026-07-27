import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import {
  DEFAULT_CHAT_MODEL,
  getOpenAI,
  hasAIKey,
} from "@/lib/ai";
import {
  inferOccasionProfile,
  occasionProfileSchema,
} from "@/lib/occasion-profile";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const occasion = String(body.occasion || "today");
  const styleHint = body.style ? String(body.style) : undefined;

  if (!hasAIKey()) {
    return NextResponse.json({
      profile: inferOccasionProfile(occasion, styleHint),
      source: "keyword",
    });
  }

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json({
      profile: inferOccasionProfile(occasion, styleHint),
      source: "keyword",
    });
  }

  try {
    const { output } = await generateText({
      model: openai(DEFAULT_CHAT_MODEL),
      output: Output.object({ schema: occasionProfileSchema }),
      prompt: `You classify dressing occasions for a wardrobe app.
Return constraints only — never invent garments.
Occasion: "${occasion}"
Preferred style hint: ${styleHint || "none"}
Infer formality, styleHints (e.g. quiet luxury, old money), things to avoid, preferCategories, and a short notes string.`,
    });

    if (!output) {
      return NextResponse.json({
        profile: inferOccasionProfile(occasion, styleHint),
        source: "keyword",
      });
    }

    return NextResponse.json({ profile: output, source: "llm" });
  } catch {
    return NextResponse.json({
      profile: inferOccasionProfile(occasion, styleHint),
      source: "keyword",
    });
  }
}
