import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import type { Garment } from "@/lib/types";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

const suggestionSchema = z.object({
  suggestions: z.array(z.object({
    id: z.string().describe("A unique ID for the item"),
    name: z.string().describe("Specific name of the product, e.g., 'Camel Wool Trench Coat'"),
    category: z.string().describe("e.g., outerwear, shoes, bottom"),
    price: z.number().describe("Estimated realistic price in USD"),
    rationale: z.string().describe("Why they need this based on their style preferences and closet gaps. e.g., 'Since you love Old Money style, but lack outerwear...'"),
    imageUrl: z.string().describe("A real or placeholder image URL for the product type. Try using a generic unsplash source like 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&q=80' but pick something vaguely related, or just return a default placeholder string 'placeholder'")
  })).min(3).max(4)
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const wardrobe = (body.wardrobe || []) as Garment[];
  const stylePrefs = (body.stylePrefs || []) as string[];

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
    const { object } = await generateObject({
      model: openai(DEFAULT_CHAT_MODEL),
      schema: suggestionSchema,
      prompt: `You are VoiceDress — an expert luxury personal stylist and shopper. 
The user's declared style preferences are: ${stylePrefs.length ? stylePrefs.join(", ") : "Classic, Minimalist"}

Here is their current wardrobe:
${pieceList || "Empty wardrobe"}

Identify what is missing from their wardrobe (closet gaps) that would help them achieve their style preferences. 
Act as a personal shopper and generate 3 to 4 specific items they should buy to complete their wardrobe.

Important for imageUrl: Since we don't have a real product DB, provide a valid unsplash image URL if you know a generic one for the clothing type, or use 'https://images.unsplash.com/photo-1434389678369-183423d6a0ce?w=400' as a generic fallback.
`
    });

    return NextResponse.json({ result: object });
  } catch (error) {
    console.error("Shopper error:", error);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
