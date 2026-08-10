import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import type { Garment } from "@/lib/types";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

const packingSchema = z.object({
  capsule: z.array(z.string()).describe("Array of exactly the garment IDs to pack"),
  checklist: z.array(z.object({
    category: z.string(),
    items: z.array(z.string()).describe("Names of the items")
  })).describe("Grouped packing checklist"),
  outfits: z.array(z.object({
    day: z.string().describe("e.g. Day 1, Night 1"),
    description: z.string().describe("Brief description of the occasion"),
    garmentIds: z.array(z.string()).describe("The garment IDs for this outfit")
  })).describe("Suggested outfits for the trip")
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const wardrobe = (body.wardrobe || []) as Garment[];
  const destination = String(body.destination || "Unknown");
  const days = Number(body.days || 3);

  if (!wardrobe.length) {
    return NextResponse.json({ error: "Wardrobe is empty" }, { status: 400 });
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
        `ID: ${g.id} | ${g.name} (${g.category}${g.fabric ? `, ${g.fabric}` : ""}${g.colors?.length ? `, ${g.colors.join("/")}` : ""})`
    )
    .join("\n");

  try {
    const { output } = await generateText({
      model: openai(DEFAULT_CHAT_MODEL),
      output: Output.object({ schema: packingSchema }),
      prompt: `You are VoiceDress — an expert luxury personal stylist and travel packer.
The user is traveling to: ${destination} for ${days} days.

Here is their entire wardrobe:
${pieceList}

Your task:
1. Select a minimalist but versatile capsule wardrobe from their exact wardrobe items that suits the climate and vibe of ${destination}.
2. Provide a checklist grouped by category.
3. Suggest ${days * 2} outfits (one for the day, one for the night for each day of the trip), using ONLY the selected capsule items.

CRITICAL STYLING RULES:
- Every outfit MUST have exactly ONE top (unless it's a dress/one-piece).
- Every outfit MUST have exactly ONE bottom (unless it's a dress/one-piece). NEVER suggest two bottoms (e.g., two trousers) in a single outfit.
- Every outfit MUST have exactly ONE pair of shoes.
- You may optionally include ONE piece of outerwear or an accessory.
- Night outfits should generally be more elevated/formal than day outfits.
- Use the exact garment IDs provided. Do NOT hallucinate items they don't own.
`
    });

    return NextResponse.json({ plan: output });
  } catch (error) {
    console.error("Packing error:", error);
    return NextResponse.json({ error: "Failed to generate packing list" }, { status: 500 });
  }
}
