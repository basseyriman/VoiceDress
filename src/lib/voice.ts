"use client";

import { parseVoiceIntent } from "@/lib/outfit-engine";
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

export async function transcribeWithAssemblyAI(audioBlob: Blob): Promise<string | null> {
  const form = new FormData();
  form.append("audio", audioBlob, "voice.webm");
  const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
  if (!res.ok) return null;
  const data = await res.json();
  return data.text || null;
}

export function handleVoiceCommand(
  transcript: string,
  actions: {
    generateOutfit: (occasion?: string, style?: string) => unknown;
    swapFromVoice: (
      category: Garment["category"],
      style?: string,
      occasion?: string
    ) => unknown;
    onOpenWardrobe?: () => void;
  }
) {
  const parsed = parseVoiceIntent(transcript);
  const catMap: Record<string, Garment["category"]> = {
    top: "top",
    bottom: "bottom",
    shoes: "shoes",
    outerwear: "outerwear",
    accessory: "accessory",
  };

  switch (parsed.intent) {
    case "swap_item": {
      const cat = catMap[parsed.entities.item || "bottom"] || "bottom";
      actions.swapFromVoice(cat, parsed.entities.style, parsed.entities.occasion);
      break;
    }
    case "change_style":
      actions.generateOutfit("today", parsed.entities.style);
      break;
    case "open_wardrobe":
      actions.onOpenWardrobe?.();
      break;
    case "suggest_outfit":
    default:
      actions.generateOutfit(parsed.entities.occasion, parsed.entities.style);
      break;
  }

  speak(parsed.reply);
  return parsed;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}
