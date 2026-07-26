import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import { buildStylingGuide, groundSpokenSuggest } from "@/lib/styling-guide";
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
      "Speakable script: For [occasion], wear your [exact piece names]. Then 1–2 sentences on how to wear them."
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
  // Prefer the user’s spoken plan in the fallback line too
  fallback.spoken = groundSpokenSuggest({
    spoken: fallback.spoken,
    garments,
    occasion,
    transcript,
    steps: fallback.steps,
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
      prompt: `You are VoiceDress — a brilliant, quietly confident personal stylist speaking OUT LOUD after picking a look.

EXACT wardrobe pieces (use these names only — never invent or rename):
${pieceList}

Occasion label: ${occasion}
User’s words: ${transcript || "(chip / short occasion)"}
Style direction: ${style}
Formality: ${formality}
Weather: ${Math.round(weather.tempC)}°C, ${weather.condition} in ${weather.location}
${previousGuide ? `They heard this last time — do NOT repeat it verbatim:\n"${previousGuide}"\n` : ""}

spoken MUST follow this arc (2–4 short sentences, speakable):
1) Start with the plan: "For [use the user’s words if clear, else the occasion]…"
2) Name the clothes: "wear your [exact names from the list, natural grouping]…"
3) Then how to wear/layer them (tuck, open coat, hem break, sleeves) — specific to THESE pieces.
Do NOT digress into random weather chat, generic vibes, or pieces that aren’t listed.
Do NOT say filler like "I’ve got you" without naming the outfit.

Also return:
- steps: 3–5 short UI lines for how to wear
- tryOnPrompt: factual drape only for image edit (tuck/open coat/hem)`,
    });

    if (!output?.steps?.length || !output.spoken) {
      return NextResponse.json({ guide: fallback, source: "fallback" });
    }

    const spoken = groundSpokenSuggest({
      spoken: output.spoken,
      garments,
      occasion,
      transcript,
      steps: output.steps,
    });

    return NextResponse.json({
      guide: {
        steps: output.steps,
        spoken,
        tryOnPrompt: output.tryOnPrompt || fallback.tryOnPrompt,
      },
      source: "llm",
    });
  } catch {
    return NextResponse.json({ guide: fallback, source: "fallback" });
  }
}
