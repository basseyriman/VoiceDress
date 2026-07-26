import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import type { Garment, WeatherSnapshot } from "@/lib/types";

const chatSchema = z.object({
  reply: z
    .string()
    .describe(
      "Speakable stylist answer, 1–3 sentences. Warm, specific, decisive. Never invent pieces."
    ),
  actions: z
    .array(
      z.object({
        tool: z.enum(["swap_piece", "pick_garment", "none"]),
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
      })
    )
    .max(2),
});

/**
 * Conversational stylist about the current suggested look —
 * fabric vs weather, belt/socks, confidence, optional swaps.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const transcript = String(body.transcript || "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const garments = (body.garments || []) as Garment[];
  const wardrobe = (body.wardrobe || []) as Garment[];
  const weather = body.weather as WeatherSnapshot | undefined;
  const occasion = String(body.occasion || "today");
  const style = String(body.style || "quiet luxury");
  const stylingGuide = body.stylingGuide ? String(body.stylingGuide) : "";
  const rationale = body.rationale ? String(body.rationale) : "";

  if (!garments.length) {
    return NextResponse.json({
      reply:
        "We don’t have a look yet — tell me where you’re going and I’ll dress you from your wardrobe.",
      actions: [{ tool: "none", category: null, garmentId: null, garmentQuery: null }],
      source: "fallback",
    });
  }

  const lookLines = garments
    .map(
      (g) =>
        `- [${g.id}] ${g.name} (${g.category}${g.fabric ? `, ${g.fabric}` : ""}${g.texture ? `, ${g.texture}` : ""}, formality ${g.formality}, ${(g.colors || []).join("/")})`
    )
    .join("\n");

  const wardrobeLines = wardrobe
    .slice(0, 80)
    .map(
      (g) =>
        `- [${g.id}] ${g.name} (${g.category}${g.fabric ? `, ${g.fabric}` : ""}, ${g.formality})`
    )
    .join("\n");

  const weatherLine = weather
    ? `${Math.round(weather.tempC)}°C, ${weather.condition} in ${weather.location}, rain ${weather.precipChance}%`
    : "unknown";

  if (!hasAIKey()) {
    return NextResponse.json({
      reply: fallbackChat(transcript, garments, weather, stylingGuide),
      actions: [{ tool: "none", category: null, garmentId: null, garmentQuery: null }],
      source: "fallback",
    });
  }

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json({
      reply: fallbackChat(transcript, garments, weather, stylingGuide),
      actions: [{ tool: "none", category: null, garmentId: null, garmentQuery: null }],
      source: "fallback",
    });
  }

  try {
    const { output } = await generateText({
      model: openai(DEFAULT_CHAT_MODEL),
      output: Output.object({ schema: chatSchema }),
      prompt: `You are VoiceDress — a brilliant personal stylist in a live voice chat.
The user already has a suggested look. They are talking it through to feel confident — like texting a stylist friend.

CURRENT LOOK (only these pieces are on them):
${lookLines}

Occasion: ${occasion}
Style DNA: ${style}
Weather now: ${weatherLine}
How-to-wear notes: ${stylingGuide || "n/a"}
Rationale: ${rationale || "n/a"}

WARDROBE they own (you may only swap to these — never invent clothing, stockings, belts, etc. that are not listed):
${wardrobeLines || "(empty)"}

User said: "${transcript}"

Rules:
- Answer their exact question (fabric weight vs weather, tuck/untuck, accessories, shoes, belt, socks/stockings, confidence, layering).
- If they ask whether to tuck a shirt, give a clear yes/no for THIS look and occasion, then one short why.
- If they ask for something not in the wardrobe (e.g. stockings) say so honestly, then advise what to do with what they HAVE (bare ankle, no belt, etc.).
- If a change would help (lighter top, different shoes), set actions to swap_piece or pick_garment with a real wardrobe id/query — otherwise tool "none".
- Do NOT dump raw weather stats as the whole answer. Weave weather into styling advice.
- Do NOT open pages or re-suggest a full new outfit unless they clearly ask for a completely different occasion.
- Reply: warm, short, speakable, 1–3 sentences. Decisive. No emoji spam.`,
    });

    if (!output?.reply) {
      return NextResponse.json({
        reply: fallbackChat(transcript, garments, weather, stylingGuide),
        actions: [
          { tool: "none", category: null, garmentId: null, garmentQuery: null },
        ],
        source: "fallback",
      });
    }

    return NextResponse.json({
      reply: output.reply,
      actions: output.actions?.length
        ? output.actions
        : [{ tool: "none", category: null, garmentId: null, garmentQuery: null }],
      source: "llm",
    });
  } catch {
    return NextResponse.json({
      reply: fallbackChat(transcript, garments, weather, stylingGuide),
      actions: [{ tool: "none", category: null, garmentId: null, garmentQuery: null }],
      source: "fallback",
    });
  }
}

function fallbackChat(
  transcript: string,
  garments: Garment[],
  weather: WeatherSnapshot | undefined,
  stylingGuide: string
): string {
  const t = transcript.toLowerCase();
  const top = garments.find((g) => g.category === "top");
  const temp = weather ? Math.round(weather.tempC) : null;
  const knit =
    top &&
    /knit|wool|cashmere|rib|thick|heavy/i.test(
      `${top.name} ${top.fabric || ""} ${top.texture || ""}`
    );

  if (
    (/\b(thick|heavy|hot|warm|knit|rib)\b/.test(t) || /\btoo\b/.test(t)) &&
    top
  ) {
    if (temp != null && temp >= 20 && knit) {
      return `At ${temp} degrees the ${top.name} is on the warmer side — still wearable if you keep layers light and skip a coat, or swap to a lighter top from your wardrobe if you’d rather stay cool.`;
    }
    if (temp != null && temp < 16 && knit) {
      return `At ${temp} degrees that ${top.name} is a smart call — the weight will feel right, not too thick.`;
    }
    return `The ${top.name} works with this look${temp != null ? ` for about ${temp} degrees` : ""} — if it feels heavy on you, we can swap the top for something lighter from your wardrobe.`;
  }

  if (/\b(tuck|untuck|shirt)\b/.test(t)) {
    const shirt = garments.find(
      (g) =>
        g.category === "top" ||
        /shirt|oxford|blouse/i.test(g.name)
    );
    if (shirt) {
      return `Yes — tuck the ${shirt.name} neatly into the trousers for a cleaner line, leave a soft break at the waist, and keep the rest of the look as styled.`;
    }
    return "Tuck the top cleanly for this look — it keeps the silhouette sharp. Untuck only if you want it more casual.";
  }

  if (/\b(belt|sock|stocking|tights|tie)\b/.test(t)) {
    const hasBelt = garments.some((g) => /belt/i.test(g.name));
    if (/\bbelt\b/.test(t)) {
      return hasBelt
        ? "You’ve already got a belt in this look — keep it clean and matching the shoes."
        : "There’s no belt in this suggested look or I’d call it out — leave the waist clean, or add a belt from your wardrobe if you have one you love.";
    }
    return "I don’t see stockings in this look — with these pieces I’d go clean ankle, no heavy sock, unless you have a thin pair in the wardrobe you want to add.";
  }

  if (stylingGuide) return stylingGuide;
  const names = garments.map((g) => g.name).join(", ");
  return `You’re in ${names}${temp != null ? ` for around ${temp} degrees` : ""}. Tell me what you’d tweak — top, shoes, or accessories — and I’ll adjust from your wardrobe.`;
}
