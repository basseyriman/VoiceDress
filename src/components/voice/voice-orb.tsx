"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSpeechRecognizer,
  handleVoiceCommand,
  speak,
} from "@/lib/voice";
import { useAetherStore } from "@/store/aether-store";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function VoiceOrb({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const voiceListening = useAetherStore((s) => s.voiceListening);
  const setVoiceListening = useAetherStore((s) => s.setVoiceListening);
  const setTranscript = useAetherStore((s) => s.setTranscript);
  const lastTranscript = useAetherStore((s) => s.lastTranscript);
  const generateOutfit = useAetherStore((s) => s.generateOutfit);
  const swapFromVoice = useAetherStore((s) => s.swapFromVoice);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);

  useEffect(() => {
    const rec = createSpeechRecognizer();
    if (!rec) {
      setSupported(false);
      return;
    }
    recognitionRef.current = rec;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
      if (finalText) {
        setTranscript(finalText.trim());
        handleVoiceCommand(finalText.trim(), {
          generateOutfit,
          swapFromVoice,
          onOpenWardrobe: () => router.push("/wardrobe"),
        });
      }
    };
    rec.onend = () => setVoiceListening(false);
    rec.onerror = () => setVoiceListening(false);
  }, [generateOutfit, swapFromVoice, router, setTranscript, setVoiceListening]);

  const toggle = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      speak("Voice is not available in this browser. Try Chrome.");
      return;
    }
    if (voiceListening) {
      rec.stop();
      setVoiceListening(false);
      return;
    }
    setInterim("");
    setVoiceListening(true);
    speak("I'm listening. Tell me the occasion or what to change.");
    setTimeout(() => rec.start(), 700);
  };

  return (
    <div
      id="voice"
      className={cn(
        "glass shine-border relative overflow-hidden rounded-3xl p-6",
        compact ? "p-4" : "p-8"
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,124,0.12),transparent_55%)]" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="mb-2 text-xs uppercase tracking-[0.28em] text-champagne">
          Voice styling
        </p>
        <h3 className="font-display text-2xl text-ivory sm:text-3xl">
          Speak the room. We dress the look.
        </h3>
        <p className="mt-3 max-w-md text-sm text-mist">
          Try: “My in-laws are coming — swap the ribbed jeans for an old money fit.”
        </p>

        <button
          onClick={toggle}
          className={cn(
            "relative mt-8 flex h-24 w-24 items-center justify-center rounded-full border border-champagne/40 bg-champagne/10 text-champagne transition",
            voiceListening && "voice-pulse bg-champagne text-ink"
          )}
          aria-label={voiceListening ? "Stop listening" : "Start listening"}
        >
          {voiceListening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
        </button>

        <p className="mt-4 min-h-[1.25rem] text-sm text-ivory-muted">
          {voiceListening
            ? interim || "Listening…"
            : lastTranscript
              ? `“${lastTranscript}”`
              : supported
                ? "Tap to speak — no typing"
                : "Browser speech unavailable — use Chrome for full voice"}
        </p>

        {!compact && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              "Dress me for a board meeting",
              "Old money for dinner with in-laws",
              "Swap the jeans",
            ].map((prompt) => (
              <Button
                key={prompt}
                variant="outline"
                size="sm"
                onClick={() => {
                  setTranscript(prompt);
                  const parsed = handleVoiceCommand(prompt, {
                    generateOutfit,
                    swapFromVoice,
                    onOpenWardrobe: () => router.push("/wardrobe"),
                  });
                  speak(parsed.reply);
                }}
              >
                <Sparkles className="h-3 w-3" />
                {prompt}
              </Button>
            ))}
          </div>
        )}

        {currentOutfit && (
          <p className="mt-6 max-w-lg text-xs leading-relaxed text-mist">
            {currentOutfit.rationale}
          </p>
        )}
      </div>
    </div>
  );
}
