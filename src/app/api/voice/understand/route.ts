import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import {
  isHighConfidenceVoiceIntent,
  isOutfitConversation,
  parseVoiceIntent,
} from "@/lib/outfit-engine";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

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
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const transcript = String(body.transcript || "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const context = body.context || {};

  // Fast path: clear keyword intents without LLM — never shortcut outfit chat
  if (
    (isHighConfidenceVoiceIntent(transcript) &&
      !isOutfitConversation(transcript)) ||
    !hasAIKey()
  ) {
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
- Prefer swap_piece / pick_garment when user dislikes a piece OR asks to change/swap/replace ANY piece (shoes, top, trousers, jacket, watch, glasses, bag — anything).
- CRITICAL: If Current look is not "none" and they ask to change/swap/replace/different ONE piece, you MUST use swap_piece or pick_garment — NEVER suggest_look. Keep the rest of the look. garmentQuery = only the TARGET item they want (not the full sentence).
- Use suggest_look ONLY for new occasions OR weather what-ifs ("if it was 16 degrees") OR when they clearly want a brand-new outfit ("dress me for dinner", "new look").
- CRITICAL: If they ask to pick/choose/suggest/help with an outfit AND mention wardrobe/closet ("from my wardrobe"), that is suggest_look — NOT open_page. Only open /wardrobe when they clearly want to browse the wardrobe page ("open my wardrobe", "show closet").
- Social plans count as occasions: drinks, pub, friends, dinner, wedding, etc. Set occasion from what they said.
- CONVERSATION: If they already have a Current look and ask about fabric weight, weather fit, belt, socks/stockings, confidence, or "what should I add" — answer as a stylist in reply and use tool "none" (or swap_piece if changing). Do NOT use check_weather just because they said "weather" while talking about a garment ("is this knit too thick for the weather").
- check_weather ONLY when they literally want the forecast ("what's the weather").
- reply should sound like a sharp stylist who is happy to help (warm, short, 1–3 sentences).
- When user mentions a temperature or feeling cold/hot as a what-if for a NEW look, set tempC and freshLook=true on suggest_look.
- Use open_page for navigation (wardrobe, connect, try-on, settings, billing, today).
- Use add_from_photo to add purchases from a receipt/screenshot.
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
    case "chat_look":
      return [
        {
          tool: "none" as const,
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
