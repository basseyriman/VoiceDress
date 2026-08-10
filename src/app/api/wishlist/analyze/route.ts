import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import type { Garment } from "@/lib/types";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

const analyzeSchema = z.object({
  score: z.number().min(0).max(100).describe("Style Score from 0 to 100 representing versatility and fit with existing wardrobe"),
  advice: z.string().describe("Short punchy advice on whether to buy it, e.g., 'Buy it! It matches 5 bottoms you own.' or 'Pass. You have nothing that goes with this.'"),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const wardrobe = (body.wardrobe || []) as Garment[];
  const target = body.target as Garment;

  if (!target) {
    return NextResponse.json({ error: "Missing target garment" }, { status: 400 });
  }

  if (!hasAIKey()) {
    return NextResponse.json({ error: "AI key missing" }, { status: 500 });
  }

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
  }

  const pieceList = wardrobe
    .map(
      (g) =>
        `- ${g.name} (${g.category}${g.fabric ? `, ${g.fabric}` : ""}${g.colors?.length ? `, ${g.colors.join("/")}` : ""})`
    )
    .join("\n");

  try {
    const { output } = await generateText({
      model: openai(DEFAULT_CHAT_MODEL),
      output: Output.object({ schema: analyzeSchema }),
      prompt: `You are VoiceDress — an expert luxury personal stylist. 
The user is considering buying this item:
Name: ${target.name}
Category: ${target.category}
Colors: ${target.colors?.join(", ")}

Here is their current wardrobe:
${pieceList}

Analyze if they should buy this item. Does it fill a gap? Does it match multiple things they already own? Do they already own too many similar items?
Calculate a Style Score (0-100) and provide a punchy 1-2 sentence recommendation.
`
    });

    return NextResponse.json({ result: output });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: "Failed to analyze garment" }, { status: 500 });
  }
}
