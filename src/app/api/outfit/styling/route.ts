import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import { buildStylingGuide } from "@/lib/styling-guide";
import type { Formality, Garment, WeatherSnapshot } from "@/lib/types";

const stylingSchema = z.object({
  steps: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("Short punchy styling notes — how to wear each key piece"),
  spoken: z
    .string()
    .describe(
      "1–3 speakable sentences a brilliant stylist would say aloud. Warm, specific, never robotic."
    ),
  tryOnPrompt: z
    .string()
    .describe(
      "One tight image-edit sentence about drape/tuck/open-coat only — no face changes."
    ),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const garments = (body.garments || []) as Garment[];
  const weather = body.weather as WeatherSnapshot | undefined;
  const formality = (body.formality || "smart_casual") as Formality;
  const style = String(body.style || "quiet luxury");
  const occasion = String(body.occasion || "today");
  const previousGuide = body.previousGuide
    ? String(body.previousGuide)
    : "";
  const transcript = body.transcript ? String(body.transcript) : "";

  const fallback = buildStylingGuide({
    garments,
    weather: weather || {
      tempC: 18,
      condition: "mild",
      humidity: 50,
      windKph: 8,
      location: "here",
      precipChance: 10,
    },
    formality,
    style,
    occasion,
    varietySeed: Date.now() % 7,
  });

  if (!garments.length) {
    return NextResponse.json({ guide: fallback, source: "fallback" });
  }

  if (!hasAIKey()) {
    return NextResponse.json({ guide: fallback, source: "fallback" });
  }

  const openai = getOpenAI();
  if (!openai || !weather) {
    return NextResponse.json({ guide: fallback, source: "fallback" });
  }

  const pieceList = garments
    .map(
      (g) =>
        `- ${g.name} (${g.category}${g.fabric ? `, ${g.fabric}` : ""}${g.colors?.length ? `, ${g.colors.join("/")}` : ""})`
    )
    .join("\n");

  try {
    const { output } = await generateText({
      model: openai(DEFAULT_CHAT_MODEL),
      output: Output.object({ schema: stylingSchema }),
      prompt: `You are VoiceDress — a brilliant, quietly confident personal stylist.
The user already has THIS exact look from their wardrobe (never invent or rename pieces):

${pieceList}

Occasion: ${occasion}
Style direction: ${style}
Formality: ${formality}
Weather: ${Math.round(weather.tempC)}°C, ${weather.condition} in ${weather.location}
User just said: ${transcript || "(occasion pick)"}
${previousGuide ? `They heard this last time — do NOT repeat it verbatim:\n"${previousGuide}"\n` : ""}

Write how to WEAR and LAYER these pieces like a real stylist sitting with them:
- Specific moves: tuck / half-tuck / leave open / one button / clean break / sleeves / collar
- Sound human and fashion-smart — not a checklist robot
- Never say "Overall: quiet luxury energy for X at Y°C"
- Never invent garments that aren’t listed
- steps: 3–5 short lines for the UI
- spoken: what VoiceDress should say out loud (natural, 1–3 sentences)
- tryOnPrompt: factual drape instructions for image edit only (tuck/open coat/hem break)`,
    });

    if (!output?.steps?.length || !output.spoken) {
      return NextResponse.json({ guide: fallback, source: "fallback" });
    }

    return NextResponse.json({
      guide: {
        steps: output.steps,
        spoken: output.spoken,
        tryOnPrompt: output.tryOnPrompt || fallback.tryOnPrompt,
      },
      source: "llm",
    });
  } catch {
    return NextResponse.json({ guide: fallback, source: "fallback" });
  }
}
