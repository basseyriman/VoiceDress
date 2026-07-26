"use client";

import {
  isHighConfidenceVoiceIntent,
  isOutfitConversation,
  parseVoiceIntent,
} from "@/lib/outfit-engine";
import type { Garment } from "@/lib/types";

export type SpeakFn = (text: string) => void;

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.96;
  utter.pitch = 1;
  utter.lang = "en-GB";
  window.speechSynthesis.speak(utter);
}

export function createSpeechRecognizer(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const SR =
    window.SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
      .webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-GB";
  return recognition;
}

export async function transcribeWithAssemblyAI(
  audioBlob: Blob
): Promise<string | null> {
  const form = new FormData();
  form.append("audio", audioBlob, "voice.webm");
  const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  if (!res.ok) return null;
  const data = await res.json();
  return data.text || null;
}

export type VoiceActionHandlers = {
  generateOutfit: (
    occasion?: string,
    style?: string,
    opts?: { tempC?: number; freshLook?: boolean; transcript?: string }
  ) => unknown;
  generateOutfitAsync?: (
    occasion?: string,
    style?: string,
    opts?: { tempC?: number; freshLook?: boolean; transcript?: string }
  ) => Promise<unknown>;
  swapFromVoice: (
    category: Garment["category"],
    style?: string,
    occasion?: string,
    garmentQuery?: string
  ) => unknown;
  pickGarmentById?: (garmentId: string) => unknown;
  onOpenWardrobe?: () => void;
  onNavigate?: (path: string) => void;
  onExplainLook?: () => string | void;
  onWeather?: () => string | void;
  getContext?: () => Record<string, unknown>;
};

type VoiceAction = {
  tool: string;
  occasion?: string | null;
  style?: string | null;
  category?: Garment["category"] | null;
  garmentId?: string | null;
  garmentQuery?: string | null;
  path?: string | null;
  tempC?: number | null;
  freshLook?: boolean | null;
  transcript?: string | null;
};

/** Hybrid: keyword fast-path, stylist chat for follow-ups, else LLM understand. */
export async function handleVoiceCommandAsync(
  transcript: string,
  actions: VoiceActionHandlers
) {
  const ctx = actions.getContext?.() || {};
  const hasLook = Array.isArray(ctx.outfit) && ctx.outfit.length > 0;
  const chatting = isOutfitConversation(transcript) && hasLook;

  // Follow-ups about the suggested look → stylist chat (not weather dump / not re-suggest)
  if (chatting) {
    const reply = await runOutfitChat(transcript, actions);
    speak(reply);
    return { reply, source: "chat" as const };
  }

  const useLocal = isHighConfidenceVoiceIntent(transcript);

  if (useLocal) {
    const parsed = parseVoiceIntent(transcript);
    if (parsed.intent === "chat_look" && hasLook) {
      const reply = await runOutfitChat(transcript, actions);
      speak(reply);
      return { reply, source: "chat" as const };
    }
    const reply = await applyLocalIntent(parsed, actions);
    speak(reply);
    return { reply, source: "keyword" as const, parsed };
  }

  try {
    const res = await fetch("/api/voice/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        context: ctx,
      }),
    });
    if (!res.ok) {
      if (hasLook) {
        const reply = await runOutfitChat(transcript, actions);
        speak(reply);
        return { reply, source: "chat" as const };
      }
      const parsed = parseVoiceIntent(transcript);
      const reply = await applyLocalIntent(parsed, actions);
      speak(reply);
      return { reply, source: "keyword" as const, parsed };
    }
    const data = await res.json();
    // If planner decided it's just weather but user was clearly chatting the look, prefer chat
    const onlyWeather =
      Array.isArray(data.actions) &&
      data.actions.length === 1 &&
      data.actions[0]?.tool === "check_weather";
    if (onlyWeather && hasLook && isOutfitConversation(transcript)) {
      const reply = await runOutfitChat(transcript, actions);
      speak(reply);
      return { reply, source: "chat" as const };
    }
    const reply = await applyActions(data.actions || [], actions, data.reply);
    speak(reply);
    return { reply, source: data.source || "llm", actions: data.actions };
  } catch {
    if (hasLook && isOutfitConversation(transcript)) {
      const reply = await runOutfitChat(transcript, actions);
      speak(reply);
      return { reply, source: "chat" as const };
    }
    const parsed = parseVoiceIntent(transcript);
    const reply = await applyLocalIntent(parsed, actions);
    speak(reply);
    return { reply, source: "keyword" as const, parsed };
  }
}

async function runOutfitChat(
  transcript: string,
  actions: VoiceActionHandlers
): Promise<string> {
  const ctx = actions.getContext?.() || {};
  try {
    const res = await fetch("/api/outfit/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        garments: ctx.outfitGarments || ctx.outfit || [],
        wardrobe: ctx.wardrobeFull || ctx.wardrobe || [],
        weather: ctx.weatherFull || undefined,
        occasion: ctx.occasion || "today",
        style: ctx.style || "quiet luxury",
        stylingGuide: ctx.stylingGuide || "",
        rationale: ctx.rationale || "",
      }),
    });
    if (!res.ok) {
      const e = actions.onExplainLook?.();
      return typeof e === "string" && e
        ? e
        : "Tell me what you’d like to tweak on this look.";
    }
    const data = await res.json();
    await applyActions(data.actions || [], actions, data.reply);
    return data.reply || "Happy to refine this look — what should we change?";
  } catch {
    const e = actions.onExplainLook?.();
    return typeof e === "string" && e
      ? e
      : "Happy to talk through the look — what are you unsure about?";
  }
}

/** Sync wrapper for callers that haven't migrated — prefers local parse. */
export function handleVoiceCommand(
  transcript: string,
  actions: VoiceActionHandlers
) {
  const parsed = parseVoiceIntent(transcript);
  void applyLocalIntent(parsed, actions).then((reply) => speak(reply));
  return parsed;
}

async function applyLocalIntent(
  parsed: ReturnType<typeof parseVoiceIntent>,
  actions: VoiceActionHandlers
): Promise<string> {
  const catMap: Record<string, Garment["category"]> = {
    top: "top",
    bottom: "bottom",
    shoes: "shoes",
    outerwear: "outerwear",
    accessory: "accessory",
    dress: "dress",
    bag: "bag",
  };

  switch (parsed.intent) {
    case "swap_item": {
      const cat = catMap[parsed.entities.item || "bottom"] || "bottom";
      actions.swapFromVoice(
        cat,
        parsed.entities.style,
        parsed.entities.occasion,
        parsed.entities.garmentQuery
      );
      return parsed.reply;
    }
    case "change_style": {
      const outfit = (await (actions.generateOutfitAsync ||
        actions.generateOutfit)(
        "today",
        parsed.entities.style,
        {
          tempC: parsed.entities.tempC,
          freshLook: true,
          transcript: parsed.transcript,
        }
      )) as { stylingGuide?: string; name?: string } | null | undefined;
      if (outfit?.stylingGuide) return outfit.stylingGuide;
      return parsed.reply;
    }
    case "open_wardrobe":
      actions.onOpenWardrobe?.();
      actions.onNavigate?.("/wardrobe");
      return parsed.reply;
    case "weather_check": {
      const w = actions.onWeather?.();
      if (typeof w === "string" && w) return w;
      return parsed.reply;
    }
    case "explain_look": {
      const e = actions.onExplainLook?.();
      if (typeof e === "string" && e) return e;
      return parsed.reply;
    }
    case "chat_look":
      return runOutfitChat(parsed.transcript, actions);
    case "suggest_outfit":
    default: {
      const outfit = (await (actions.generateOutfitAsync ||
        actions.generateOutfit)(
        parsed.entities.occasion,
        parsed.entities.style,
        {
          tempC: parsed.entities.tempC,
          freshLook: parsed.entities.freshLook,
          transcript: parsed.transcript,
        }
      )) as { stylingGuide?: string; name?: string } | null | undefined;
      if (outfit?.stylingGuide) return outfit.stylingGuide;
      return parsed.reply;
    }
  }
}

async function applyActions(
  list: VoiceAction[],
  actions: VoiceActionHandlers,
  fallbackReply: string
): Promise<string> {
  let reply = fallbackReply;
  for (const a of list) {
    switch (a.tool) {
      case "suggest_look": {
        const outfit = (await (actions.generateOutfitAsync ||
          actions.generateOutfit)(
          a.occasion || "today",
          a.style || undefined,
          {
            tempC: a.tempC ?? undefined,
            freshLook: Boolean(a.freshLook ?? a.tempC != null),
            transcript: a.transcript ?? undefined,
          }
        )) as { stylingGuide?: string } | null | undefined;
        if (outfit?.stylingGuide) reply = outfit.stylingGuide;
        break;
      }
      case "swap_piece":
        if (a.category) {
          actions.swapFromVoice(
            a.category,
            a.style || undefined,
            a.occasion || undefined,
            a.garmentQuery || undefined
          );
        }
        break;
      case "pick_garment":
        if (a.garmentId) actions.pickGarmentById?.(a.garmentId);
        else if (a.garmentQuery && a.category) {
          actions.swapFromVoice(
            a.category,
            undefined,
            undefined,
            a.garmentQuery
          );
        }
        break;
      case "explain_look": {
        const e = actions.onExplainLook?.();
        if (typeof e === "string" && e) reply = e;
        break;
      }
      case "check_weather": {
        const w = actions.onWeather?.();
        if (typeof w === "string" && w) reply = w;
        break;
      }
      case "open_page":
        if (a.path) actions.onNavigate?.(a.path);
        break;
      case "add_from_photo":
        actions.onNavigate?.("/connect");
        break;
      case "none":
      case "chat_look":
        break;
      default:
        break;
    }
  }
  return reply;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
