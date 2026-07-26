import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL, getOpenAI, hasAIKey } from "@/lib/ai";
import { buildStylingGuide, groundSpokenSuggest } from "@/lib/styling-guide";
import type { Formality, Garment, WeatherSnapshot } from "@/lib/types";
import { isAuthedUser, requireEntitled } from "@/lib/api-auth";

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
  const auth = await requireEntitled(req);
  if (!isAuthedUser(auth)) return auth;

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
    weather,
    formality,
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
      prompt: `You are VoiceDress — a brilliant personal stylist speaking OUT LOUD after locking a look (Strata-style).

EXACT wardrobe pieces (use these names only — never invent or rename):
${pieceList}

Occasion label: ${occasion}
User’s words: ${transcript || "(chip / short occasion)"}
Style direction: ${style}
Formality: ${formality}
Weather: ${Math.round(weather.tempC)}°C, ${weather.condition} in ${weather.location}
${previousGuide ? `They heard this last time — do NOT repeat it verbatim:\n"${previousGuide}"\n` : ""}

spoken MUST follow this speakable arc (about 4–6 short sentences):
1) "For [user’s plan]…" + name a silhouette vibe (e.g. monochromatic night executive) + brief weather as context only
2) "Up top: your [exact top/outerwear names]…"
3) "Below: your [exact trousers]…"
4) "On your feet: your [exact shoes]…"
5) Optional: metal sync if accessories match (gold with gold / silver with silver) using exact accessory names
6) One short how-to-wear cue (tuck / open blazer / hem break) for THESE pieces only
Do NOT invent garments. Do NOT dump a weather forecast as the whole answer.

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
      weather,
      formality,
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
