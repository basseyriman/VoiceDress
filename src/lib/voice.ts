"use client";

import { authFetch } from "@/lib/auth-fetch";
import {
  isClearPieceSwap,
  isHighConfidenceVoiceIntent,
  isOutfitConversation,
  parseVoiceIntent,
  shouldPreferOutfitChat,
} from "@/lib/outfit-engine";
import {
  inferCategoryFromSpeech,
  parseSwapSpeech,
} from "@/lib/garment-match";
import type { Garment } from "@/lib/types";
import { useAetherStore } from "@/store/aether-store";

export type SpeakFn = (text: string) => void;

/** Bumped whenever the user barges in (mic) so late replies don’t speak over them. */
let speakGeneration = 0;
let speakKeepalive: ReturnType<typeof setInterval> | null = null;
let preferredVoice: SpeechSynthesisVoice | null = null;
let voicesListenerBound = false;

export function getSpeakGeneration() {
  return speakGeneration;
}

function clearSpeakKeepalive() {
  if (speakKeepalive) {
    clearInterval(speakKeepalive);
    speakKeepalive = null;
  }
}

/** Stop TTS immediately — call when the user taps Speak. */
export function stopSpeaking() {
  speakGeneration += 1;
  clearSpeakKeepalive();
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/**
 * iOS/WebKit only allows speechSynthesis after a user gesture.
 * Call this synchronously inside the Speak tap handler.
 */
export function unlockSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    ensureVoicesLoaded();
    // Prime the engine inside the tap — otherwise later async speak() is silent
    window.speechSynthesis.cancel();
    const warm = new SpeechSynthesisUtterance(" ");
    warm.volume = 0.01;
    warm.rate = 2;
    warm.lang = "en-GB";
    const voice = pickBestVoice();
    if (voice) warm.voice = voice;
    window.speechSynthesis.speak(warm);
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch {
    // ignore
  }
}

/** Prefer a warm female English voice on every device (desktop + iOS/Android). */
const FEMALE_VOICE_HINT =
  /\b(female|woman|girl)\b|serena|martha|libby|sonia|susan|samantha|karen|moira|fiona|tessa|victoria|kate|zira|ava|allison|amy|emma|joanna|salli|ivy|kimberly|kendra|olivia|emily|hazel|nicky|veena|raveena|google uk english female|microsoft (sonia|susan|hazel|zira)/i;

const MALE_VOICE_HINT =
  /\b(male|man|boy)\b|daniel|david|arthur|ryan|thomas|fred|ralph|alex\b|tom\b|mark\b|james|oliver|george|brian|matthew|justin|joey|google uk english male|microsoft (david|mark|george|ryan)/i;

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return preferredVoice;

  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    let s = 0;

    // Language — British English first (same vibe as desktop)
    if (lang.startsWith("en-gb") || lang === "en_gb") s += 70;
    else if (lang.startsWith("en-au") || lang.startsWith("en-ie")) s += 40;
    else if (lang.startsWith("en-us") || lang === "en_us") s += 28;
    else if (lang.startsWith("en")) s += 15;

    // Hard preference: female over male on every platform
    if (FEMALE_VOICE_HINT.test(name)) s += 120;
    if (MALE_VOICE_HINT.test(name)) s -= 200;

    // Chrome desktop favourite
    if (name.includes("google") && (lang.startsWith("en-gb") || lang === "en_gb")) {
      s += 40;
      if (name.includes("female")) s += 50;
    }

    if (
      name.includes("natural") ||
      name.includes("neural") ||
      name.includes("enhanced") ||
      name.includes("premium") ||
      name.includes("quality")
    ) {
      s += 18;
    }

    // iOS often exposes gender via name only — boost known soft female defaults
    if (/serena|samantha|karen|moira|libby|sonia/.test(name)) s += 25;

    if (v.localService) s += 2;
    if (v.default && FEMALE_VOICE_HINT.test(name)) s += 5;
    // Never trust OS default if it's a male voice
    if (v.default && MALE_VOICE_HINT.test(name)) s -= 40;

    return s;
  };

  const ranked = [...voices].sort((a, b) => score(b) - score(a));
  // Prefer the best female English voice; only fall back if none exist
  const femaleEn = ranked.find(
    (v) =>
      FEMALE_VOICE_HINT.test(v.name) &&
      (v.lang || "").toLowerCase().startsWith("en")
  );
  preferredVoice =
    femaleEn ||
    ranked.find((v) => !MALE_VOICE_HINT.test(v.name) && (v.lang || "").toLowerCase().startsWith("en")) ||
    ranked[0] ||
    null;
  return preferredVoice;
}

function ensureVoicesLoaded() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  pickBestVoice();
  if (voicesListenerBound) return;
  voicesListenerBound = true;
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    pickBestVoice();
  });
}

/** Keep Chrome from freezing speechSynthesis after ~15s. */
function startSpeakKeepalive(gen: number) {
  clearSpeakKeepalive();
  speakKeepalive = setInterval(() => {
    if (gen !== speakGeneration) {
      clearSpeakKeepalive();
      return;
    }
    if (!window.speechSynthesis) {
      clearSpeakKeepalive();
      return;
    }
    if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
      try {
        window.speechSynthesis.resume();
      } catch {
        // ignore
      }
    }
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      clearSpeakKeepalive();
    }
  }, 8000);
}

/** Short chunks speak more smoothly than one long utterance in Chrome. */
function chunkForSpeech(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    const next = part.trim();
    if (!next) continue;
    const joined = buf ? `${buf} ${next}` : next;
    if (joined.length > 160 && buf) {
      chunks.push(buf);
      buf = next;
    } else {
      buf = joined;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function speakChunk(
  text: string,
  gen: number,
  voice: SpeechSynthesisVoice | null
): Promise<void> {
  return new Promise((resolve) => {
    if (gen !== speakGeneration || !window.speechSynthesis) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.96;
    utter.pitch = 1;
    utter.lang = voice?.lang || "en-GB";
    if (voice) utter.voice = voice;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const enabled = useAetherStore.getState().user?.voiceEnabled !== false;
  if (!enabled) return;

  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return;

  const gen = speakGeneration;
  clearSpeakKeepalive();
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch {
    // ignore
  }
  ensureVoicesLoaded();
  const voice = pickBestVoice();
  const chunks = chunkForSpeech(cleaned);
  if (!chunks.length || gen !== speakGeneration) return;

  startSpeakKeepalive(gen);
  void (async () => {
    // Small yield helps WebKit attach the next utterance after cancel()
    await new Promise((r) => setTimeout(r, 40));
    for (const chunk of chunks) {
      if (gen !== speakGeneration) break;
      await speakChunk(chunk, gen, voice);
    }
    if (gen === speakGeneration) clearSpeakKeepalive();
  })();
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
  const res = await authFetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });
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
    garmentQuery?: string,
    sourceQuery?: string
  ) => unknown;
  pickGarmentById?: (garmentId: string) => unknown;
  onOpenWardrobe?: () => void;
  onNavigate?: (path: string) => void;
  onExplainLook?: () => string | void;
  onWeather?: () => string | void;
  /** Ensure forecast is in the store (any page — not only Today). */
  ensureWeather?: () => Promise<unknown>;
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
  const genAtStart = getSpeakGeneration();
  const ctx = actions.getContext?.() || {};
  const hasLook = Array.isArray(ctx.outfit) && ctx.outfit.length > 0;
  // Any piece-swap speech while a look is on — never rebuild a new outfit
  const clearSwap = isClearPieceSwap(transcript);
  const chatting =
    !clearSwap &&
    (shouldPreferOutfitChat(transcript, hasLook) ||
      (isOutfitConversation(transcript) && hasLook));

  const finish = (reply: string, meta: Record<string, unknown>) => {
    // User tapped Speak again while we were thinking — don’t talk over them
    if (genAtStart !== getSpeakGeneration()) {
      return { reply, ...meta, interrupted: true as const };
    }
    speak(reply);
    return { reply, ...meta };
  };

  // Explicit piece swaps take the surgical keyword path — always
  if (hasLook && clearSwap) {
    const parsed = parseVoiceIntent(transcript);
    if (parsed.intent === "swap_item") {
      const reply = await applyLocalIntent(parsed, actions);
      return finish(reply, { source: "keyword-swap" as const, parsed });
    }
    // Parser missed swap_item — still swap surgically from speech
    const swap = parseSwapSpeech(transcript);
    const cat = (swap.category ||
      inferCategoryFromSpeech(transcript) ||
      "top") as Garment["category"];
    actions.swapFromVoice(
      cat,
      undefined,
      undefined,
      swap.targetQuery || transcript,
      swap.sourceQuery
    );
    return finish(`Swapping your ${cat} from the wardrobe.`, {
      source: "keyword-swap" as const,
      swap,
    });
  }

  // Follow-ups about the suggested look → stylist chat (not weather dump / not re-suggest)
  if (chatting) {
    const reply = await runOutfitChat(transcript, actions);
    return finish(reply, { source: "chat" as const });
  }

  const useLocal = isHighConfidenceVoiceIntent(transcript);

  if (useLocal) {
    const parsed = parseVoiceIntent(transcript);
    if (parsed.intent === "chat_look" && hasLook) {
      const reply = await runOutfitChat(transcript, actions);
      return finish(reply, { source: "chat" as const });
    }
    const reply = await applyLocalIntent(parsed, actions);
    return finish(reply, { source: "keyword" as const, parsed });
  }

  try {
    const res = await authFetch("/api/voice/understand", {
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
        return finish(reply, { source: "chat" as const });
      }
      const parsed = parseVoiceIntent(transcript);
      const reply = await applyLocalIntent(parsed, actions);
      return finish(reply, { source: "keyword" as const, parsed });
    }
    const data = await res.json();
    let llmActions = Array.isArray(data.actions) ? data.actions : [];
    // Hard guard: while a look is on, never accept suggest_look for swap-like speech
    if (hasLook) {
      const wantsNewOccasion =
        /\b(dress me|new look|new outfit|start over|for (dinner|drinks|wedding|meeting|travel|work))\b/i.test(
          transcript
        ) && !clearSwap;
      if (!wantsNewOccasion) {
        llmActions = llmActions.filter(
          (a: { tool?: string }) => a?.tool !== "suggest_look"
        );
      }
      if (
        clearSwap &&
        !llmActions.some(
          (a: { tool?: string }) =>
            a?.tool === "swap_piece" || a?.tool === "pick_garment"
        )
      ) {
        const parsed = parseVoiceIntent(transcript);
        const swapParsed: ReturnType<typeof parseVoiceIntent> =
          parsed.intent === "swap_item"
            ? parsed
            : ({
                ...parsed,
                intent: "swap_item",
                entities: {
                  ...parsed.entities,
                  item:
                    parsed.entities.item ||
                    inferCategoryFromSpeech(transcript) ||
                    "top",
                },
              } as unknown as ReturnType<typeof parseVoiceIntent>);
        const reply = await applyLocalIntent(swapParsed, actions);
        return finish(reply, { source: "keyword-swap" as const, parsed });
      }
    }
    const onlyWeather =
      llmActions.length === 1 && llmActions[0]?.tool === "check_weather";
    if (
      onlyWeather &&
      hasLook &&
      (isOutfitConversation(transcript) ||
        shouldPreferOutfitChat(transcript, hasLook))
    ) {
      const reply = await runOutfitChat(transcript, actions);
      return finish(reply, { source: "chat" as const });
    }
    if (genAtStart !== getSpeakGeneration()) {
      return { reply: data.reply, source: data.source || "llm", interrupted: true };
    }
    const reply = await applyActions(
      llmActions,
      actions,
      data.reply,
      transcript
    );
    return finish(reply, { source: data.source || "llm", actions: llmActions });
  } catch {
    if (
      hasLook &&
      (isOutfitConversation(transcript) ||
        shouldPreferOutfitChat(transcript, hasLook))
    ) {
      const reply = await runOutfitChat(transcript, actions);
      return finish(reply, { source: "chat" as const });
    }
    const parsed = parseVoiceIntent(transcript);
    const reply = await applyLocalIntent(parsed, actions);
    return finish(reply, { source: "keyword" as const, parsed });
  }
}

async function runOutfitChat(
  transcript: string,
  actions: VoiceActionHandlers
): Promise<string> {
  const ctx = actions.getContext?.() || {};
  const explainOnly = isExplainOnlyAsk(transcript);
  try {
    const res = await authFetch("/api/outfit/chat", {
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
    if (res.status === 402) {
      actions.onNavigate?.("/billing");
      return "Your trial has ended — open Billing to keep styling.";
    }
    if (!res.ok) {
      const e = actions.onExplainLook?.();
      return typeof e === "string" && e
        ? e
        : "Tell me what you’d like to tweak on this look.";
    }
    const data = await res.json();
    const rawActions = Array.isArray(data.actions) ? data.actions : [];
    // "Why this look?" must NEVER re-dress — ignore swap/pick tools
    const safeActions = explainOnly
      ? rawActions.filter(
          (a: { tool?: string }) => !a?.tool || a.tool === "none"
        )
      : rawActions;
    await applyActions(safeActions, actions, data.reply, transcript);
    return data.reply || "Happy to refine this look — what should we change?";
  } catch {
    const e = actions.onExplainLook?.();
    return typeof e === "string" && e
      ? e
      : "Happy to talk through the look — what are you unsure about?";
  }
}

/** True when the user is only asking for an explanation — not a change. */
function isExplainOnlyAsk(transcript: string) {
  const t = transcript.toLowerCase().trim();
  if (!t) return false;
  if (
    /\b(swap|change|replace|different|instead|another|new look|dress me|suggest)\b/.test(
      t
    )
  ) {
    return false;
  }
  return (
    /\bwhy\b/.test(t) ||
    /\b(explain|rationale|how come|what made you|tell me about (this|the) look)\b/.test(
      t
    )
  );
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

  const suggestBlocked = async (): Promise<string | null> => {
    // Weather belongs to the whole app — fetch it here if Today never ran
    if (actions.ensureWeather) {
      await actions.ensureWeather();
    }
    const ctx = actions.getContext?.() || {};
    const wardrobeLen = Array.isArray(ctx.wardrobeFull)
      ? ctx.wardrobeFull.length
      : Array.isArray(ctx.wardrobe)
        ? ctx.wardrobe.length
        : 0;
    if (!ctx.weatherFull && !ctx.weather) {
      return "I couldn’t load the weather just now — check your connection and try again.";
    }
    if (wardrobeLen < 2) {
      actions.onNavigate?.("/wardrobe");
      return "Add a few pieces to your wardrobe first, then ask me for an outfit.";
    }
    return null;
  };

  switch (parsed.intent) {
    case "swap_item": {
      const cat = catMap[parsed.entities.item || "bottom"] || "bottom";
      const blocked = await suggestBlocked();
      if (blocked) return blocked;
      actions.swapFromVoice(
        cat,
        parsed.entities.style,
        parsed.entities.occasion,
        parsed.entities.garmentQuery,
        parsed.entities.sourceQuery
      );
      return parsed.reply;
    }
    case "change_style": {
      const blocked = await suggestBlocked();
      if (blocked) return blocked;
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
      if (actions.ensureWeather) await actions.ensureWeather();
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
      const blocked = await suggestBlocked();
      if (blocked) return blocked;
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
      if (!outfit) {
        return (
          (await suggestBlocked()) ||
          "I couldn’t build a look from your wardrobe yet — add a few more pieces."
        );
      }
      if (outfit?.stylingGuide) return outfit.stylingGuide;
      return parsed.reply;
    }
  }
}

async function applyActions(
  list: VoiceAction[],
  actions: VoiceActionHandlers,
  fallbackReply: string,
  transcript = ""
): Promise<string> {
  let reply = fallbackReply;
  const ctx = actions.getContext?.() || {};
  const hasLook = Array.isArray(ctx.outfit) && ctx.outfit.length > 0;
  const clearSwap = transcript ? isClearPieceSwap(transcript) : false;

  for (const a of list) {
    switch (a.tool) {
      case "suggest_look": {
        // Never rebuild the whole look when they only asked to swap a piece
        if (hasLook && clearSwap) {
          const parsed = parseVoiceIntent(transcript);
          if (parsed.intent === "swap_item") {
            const catMap: Record<string, Garment["category"]> = {
              top: "top",
              bottom: "bottom",
              shoes: "shoes",
              outerwear: "outerwear",
              accessory: "accessory",
              dress: "dress",
              bag: "bag",
            };
            const cat =
              catMap[parsed.entities.item || ""] ||
              (a.category as Garment["category"] | undefined) ||
              "bottom";
            actions.swapFromVoice(
              cat,
              parsed.entities.style,
              parsed.entities.occasion,
              parsed.entities.garmentQuery,
              parsed.entities.sourceQuery
            );
            reply = parsed.reply || reply;
            break;
          }
        }
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
        else if (!outfit) {
          if (actions.ensureWeather) await actions.ensureWeather();
          const retry = (await (actions.generateOutfitAsync ||
            actions.generateOutfit)(
            a.occasion || "today",
            a.style || undefined,
            {
              tempC: a.tempC ?? undefined,
              freshLook: Boolean(a.freshLook ?? a.tempC != null),
              transcript: a.transcript ?? undefined,
            }
          )) as { stylingGuide?: string } | null | undefined;
          if (retry?.stylingGuide) reply = retry.stylingGuide;
        }
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
        if (actions.ensureWeather) await actions.ensureWeather();
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
