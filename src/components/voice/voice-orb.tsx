"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square, Sparkles } from "lucide-react";
import {
  createSpeechRecognizer,
  handleVoiceCommandAsync,
  stopSpeaking,
} from "@/lib/voice";
import { buildVoiceHandlers } from "@/lib/voice-handlers";
import { useAetherStore } from "@/store/aether-store";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Waveform } from "@/components/voice/waveform";

const PROMPTS = [
  "I have a work meeting",
  "Birthday dinner tonight",
  "Change the shoes",
];

export function VoiceOrb({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [supported, setSupported] = useState(true);
  const [interim, setInterim] = useState("");
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "done">(
    "idle"
  );
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const voiceListening = useAetherStore((s) => s.voiceListening);
  const setVoiceListening = useAetherStore((s) => s.setVoiceListening);
  const setTranscript = useAetherStore((s) => s.setTranscript);
  const lastTranscript = useAetherStore((s) => s.lastTranscript);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);

  useEffect(() => {
    const rec = createSpeechRecognizer();
    if (!rec) {
      setSupported(false);
      return;
    }
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;

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
        const text = finalText.trim();
        setTranscript(text);
        setPhase("thinking");
        setVoiceListening(false);
        void handleVoiceCommandAsync(
          text,
          buildVoiceHandlers(router, pathname)
        ).then(() => {
          setPhase("done");
          setTimeout(() => setPhase("idle"), 2200);
        });
      }
    };
    rec.onend = () => {
      setVoiceListening(false);
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    rec.onerror = () => {
      setVoiceListening(false);
      setPhase("idle");
    };
  }, [router, pathname, setTranscript, setVoiceListening]);

  const start = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    stopSpeaking();
    setInterim("");
    setPhase("listening");
    setVoiceListening(true);
    try {
      rec.stop();
    } catch {
      // not running
    }
    window.setTimeout(() => {
      try {
        rec.start();
      } catch {
        // already started
      }
    }, 120);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setVoiceListening(false);
    setPhase("idle");
  };

  const toggle = () => {
    if (!supported) return;
    if (voiceListening) stop();
    else start();
  };

  const runPrompt = (prompt: string) => {
    setTranscript(prompt);
    setPhase("thinking");
    void handleVoiceCommandAsync(
      prompt,
      buildVoiceHandlers(router, pathname)
    ).then(() => {
      setPhase("done");
      setTimeout(() => setPhase("idle"), 1800);
    });
  };

  const liveLine = voiceListening
    ? interim || "Listening…"
    : phase === "thinking"
      ? "Styling…"
      : lastTranscript
        ? lastTranscript
        : "Tap Speak — say where you’re going";

  return (
    <motion.div
      id="voice"
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass shine-border relative overflow-hidden rounded-[2rem]",
        compact ? "p-5" : "p-7 sm:p-9"
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,168,124,0.14),transparent_55%)]" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="text-[11px] uppercase tracking-[0.32em] text-champagne">
          Change anything
        </p>
        <h3 className="mt-2 font-display text-2xl text-ivory sm:text-3xl">
          Don&apos;t like a piece? Say so.
        </h3>
        <p className="mt-2 max-w-md text-sm text-mist">
          Tap once and speak — “change the shoes”, “different glasses”, or a new
          occasion. VoiceDress restyles the look on your photo.
        </p>

        <motion.button
          type="button"
          onClick={toggle}
          disabled={!supported}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "mt-8 flex w-full max-w-xl items-center gap-4 rounded-full border px-5 py-3.5 text-left transition-colors duration-300",
            voiceListening
              ? "border-champagne/50 bg-champagne/15 shadow-[0_0_40px_rgba(201,168,124,0.18)]"
              : "border-line bg-white/[0.03] hover:border-champagne/35 hover:bg-white/[0.05]"
          )}
        >
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
              voiceListening
                ? "bg-champagne text-ink"
                : "bg-champagne/15 text-champagne"
            )}
          >
            {voiceListening ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.p
                key={liveLine}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className={cn(
                  "truncate text-sm",
                  voiceListening || interim ? "text-ivory" : "text-ivory-muted"
                )}
              >
                {liveLine}
              </motion.p>
            </AnimatePresence>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-mist">
              {phase === "listening"
                ? "Listening"
                : phase === "thinking"
                  ? "Composing"
                  : supported
                    ? "Tap to speak"
                    : "Use Chrome for voice"}
            </p>
          </div>

          <Waveform active={voiceListening} />
        </motion.button>

        {!compact && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {PROMPTS.map((prompt) => (
              <motion.button
                key={prompt}
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => runPrompt(prompt)}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3.5 py-2 text-xs text-ivory-muted transition hover:border-champagne/40 hover:text-ivory"
              >
                <Sparkles className="h-3 w-3 text-champagne" />
                {prompt}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
