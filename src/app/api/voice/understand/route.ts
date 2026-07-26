import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import {
  isHighConfidenceVoiceIntent,
  parseVoiceIntent,
} from "@/lib/outfit-engine";

const voicePlanSchema = z.object({
  reply: z.string(),
  actions: z.array(
    z.object({
      tool: z.enum([
        "suggest_look",
        "swap_piece",
        "pick_garment",
        "explain_look",
        "check_weather",
        "open_page",
        "add_from_photo",
        "none",
      ]),
      occasion: z.string().nullable(),
      style: z.string().nullable(),
      tempC: z.number().nullable(),
      freshLook: z.boolean().nullable(),
      category: z
        .enum([
          "top",
          "bottom",
          "outerwear",
          "shoes",
          "accessory",
          "dress",
          "bag",
        ])
        .nullable(),
      garmentId: z.string().nullable(),
      garmentQuery: z.string().nullable(),
      path: z
        .enum(["/today", "/wardrobe", "/try-on", "/connect", "/settings", "/billing"])
        .nullable(),
    })
  ),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const transcript = String(body.transcript || "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const context = body.context || {};

  // Fast path: clear keyword intents without LLM
  if (isHighConfidenceVoiceIntent(transcript) || !hasAIKey()) {
    const parsed = parseVoiceIntent(transcript);
    return NextResponse.json({
      reply: parsed.reply,
      source: "keyword",
      actions: keywordToActions(parsed),
      parsed,
    });
  }

  const openai = getOpenAI();
  if (!openai) {
    const parsed = parseVoiceIntent(transcript);
    return NextResponse.json({
      reply: parsed.reply,
      source: "keyword",
      actions: keywordToActions(parsed),
      parsed,
    });
  }

  const wardrobeSummary = Array.isArray(context.wardrobe)
    ? context.wardrobe
        .slice(0, 80)
        .map(
          (g: {
            id: string;
            name: string;
            brand: string;
            category: string;
            colors?: string[];
          }) =>
            `${g.id}: ${g.name} (${g.brand}, ${g.category}, ${(g.colors || []).join("/")})`
        )
        .join("\n")
    : "";

  const outfitSummary = Array.isArray(context.outfit)
    ? context.outfit
        .map(
          (g: { id: string; name: string; category: string }) =>
            `${g.category}: ${g.name} [${g.id}]`
        )
        .join(", ")
    : "none";

  try {
    const { output } = await generateText({
      model: openai(DEFAULT_CHAT_MODEL),
      output: Output.object({ schema: voicePlanSchema }),
      prompt: `You are VoiceDress — a voice-first wardrobe assistant.
User said: "${transcript}"

App context:
- Path: ${context.pathname || "/today"}
- Weather: ${context.weather || "unknown"}
- Current look: ${outfitSummary}
- Connected stores: ${(context.connectedStores || []).join(", ") || "none"}
- Wardrobe (id: name):
${wardrobeSummary || "(empty)"}

Rules:
- Only pick garments that exist in the wardrobe list (use their ids).
- Never invent clothing.
- Prefer swap_piece / pick_garment when user dislikes a piece.
- Use suggest_look for new occasions OR weather what-ifs ("if it was 16 degrees").
- When user mentions a temperature or feeling cold/hot, set tempC (Celsius) and freshLook=true on suggest_look. Keep the current occasion if they don't name a new one.
- Use open_page for navigation (wardrobe, connect, try-on, settings, billing, today).
- Use add_from_photo to add purchases from a receipt/screenshot.
- Use explain_look / check_weather when asked only about actual weather (not outfit suggestions).
- reply should be short, premium, speakable (1–2 sentences). Mention the temperature if they asked a what-if.
- Return 1–2 actions max.`,
    });

    if (!output) {
      const parsed = parseVoiceIntent(transcript);
      return NextResponse.json({
        reply: parsed.reply,
        source: "keyword",
        actions: keywordToActions(parsed),
      });
    }

    return NextResponse.json({
      reply: output.reply,
      source: "llm",
      actions: output.actions,
    });
  } catch {
    const parsed = parseVoiceIntent(transcript);
    return NextResponse.json({
      reply: parsed.reply,
      source: "keyword",
      actions: keywordToActions(parsed),
    });
  }
}

function keywordToActions(parsed: ReturnType<typeof parseVoiceIntent>) {
  switch (parsed.intent) {
    case "swap_item":
      return [
        {
          tool: "swap_piece" as const,
          category: (parsed.entities.item as
            | "top"
            | "bottom"
            | "shoes"
            | "outerwear"
            | "accessory"
            | null) || "bottom",
          garmentQuery: parsed.entities.garmentQuery || null,
          occasion: parsed.entities.occasion || null,
          style: parsed.entities.style || null,
          tempC: parsed.entities.tempC ?? null,
          freshLook: null,
          garmentId: null,
          path: null,
        },
      ];
    case "change_style":
      return [
        {
          tool: "suggest_look" as const,
          occasion: "today",
          style: parsed.entities.style || null,
          tempC: parsed.entities.tempC ?? null,
          freshLook: true,
          category: null,
          garmentId: null,
          garmentQuery: null,
          path: null,
        },
      ];
    case "weather_check":
      return [
        {
          tool: "check_weather" as const,
          occasion: null,
          style: null,
          tempC: null,
          freshLook: null,
          category: null,
          garmentId: null,
          garmentQuery: null,
          path: null,
        },
      ];
    case "explain_look":
      return [
        {
          tool: "explain_look" as const,
          occasion: null,
          style: null,
          tempC: null,
          freshLook: null,
          category: null,
          garmentId: null,
          garmentQuery: null,
          path: null,
        },
      ];
    case "open_wardrobe":
      return [
        {
          tool: "open_page" as const,
          path: "/wardrobe" as const,
          occasion: null,
          style: null,
          tempC: null,
          freshLook: null,
          category: null,
          garmentId: null,
          garmentQuery: null,
        },
      ];
    case "suggest_outfit":
    default:
      return [
        {
          tool: "suggest_look" as const,
          occasion: parsed.entities.occasion || "today",
          style: parsed.entities.style || null,
          tempC: parsed.entities.tempC ?? null,
          freshLook: parsed.entities.freshLook ?? null,
          category: null,
          garmentId: null,
          garmentQuery: null,
          path: null,
        },
      ];
  }
}
