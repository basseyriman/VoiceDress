import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

/**
 * Cloud TTS so every device hears a warm British female voice —
 * matching the Chrome “Google UK English Female” vibe when that
 * browser voice isn’t installed (iOS Safari, etc.).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY required for cloud voice" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    // coral = warm female; instructions push British fashion-stylist tone
    // close to Chrome’s Google UK English Female.
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "coral",
      input: text,
      instructions:
        "Speak as a warm, polished British English woman — soft London fashion-stylist tone, clear and confident, never robotic or American. Similar to Google UK English Female.",
      response_format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS failed";
    // Fallback model if mini-tts / instructions unsupported on this key
    if (/model|instructions|voice/i.test(message)) {
      try {
        const openai = new OpenAI({ apiKey });
        const speech = await openai.audio.speech.create({
          model: "tts-1",
          voice: "nova",
          input: text,
          response_format: "mp3",
        });
        const buffer = Buffer.from(await speech.arrayBuffer());
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      } catch (err2) {
        return NextResponse.json(
          {
            error:
              err2 instanceof Error ? err2.message : "TTS fallback failed",
          },
          { status: 502 }
        );
      }
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
