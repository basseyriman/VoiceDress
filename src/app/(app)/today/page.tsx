"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import {
  createSpeechRecognizer,
  handleVoiceCommandAsync,
  speak,
} from "@/lib/voice";
import { buildVoiceHandlers } from "@/lib/voice-handlers";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { OutfitStage } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
import type { WeatherSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Waveform } from "@/components/voice/waveform";
import { useRouter } from "next/navigation";

const QUICK_EVENTS = [
  {
    id: "work",
    label: "Work meeting",
    occasion: "work meeting",
    style: "quiet luxury",
  },
  {
    id: "in-laws",
    label: "Meeting the in-laws",
    occasion: "meeting the in-laws",
    style: "old money",
  },
  {
    id: "dinner",
    label: "Dinner date",
    occasion: "dinner date",
    style: "quiet luxury",
  },
  {
    id: "wedding",
    label: "Wedding",
    occasion: "wedding",
    style: "quiet luxury",
  },
] as const;

export default function TodayPage() {
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const weather = useAetherStore((s) => s.weather);
  const setWeather = useAetherStore((s) => s.setWeather);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);
  const generateOutfitAsync = useAetherStore((s) => s.generateOutfitAsync);
  const setTranscript = useAetherStore((s) => s.setTranscript);
  const setVoiceListening = useAetherStore((s) => s.setVoiceListening);
  const voiceListening = useAetherStore((s) => s.voiceListening);
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [composing, setComposing] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { resolveDisplayAvatar } = await import("@/lib/resolve-avatar");
      const resolved = await resolveDisplayAvatar(
        user?.avatarUrl || user?.photoURL
      );
      if (!cancelled && resolved) setAvatarUrl(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.avatarUrl, user?.photoURL]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/weather?lat=${user?.lat || 51.5074}&lon=${user?.lon || -0.1278}&location=${encodeURIComponent(user?.city || "London")}`
      );
      const data = (await res.json()) as WeatherSnapshot;
      if (!cancelled) setWeather(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.lat, user?.lon, user?.city, setWeather]);

  useEffect(() => {
    const rec = createSpeechRecognizer();
    if (!rec) {
      setSupported(false);
      return;
    }
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-GB";

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
        setVoiceListening(false);
        setComposing(true);
        void handleVoiceCommandAsync(
          text,
          buildVoiceHandlers(router, "/today")
        ).finally(() => setComposing(false));
      }
    };
    rec.onend = () => setVoiceListening(false);
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Aborted = we restarted; no-speech = user quiet — don't thrash UI
      if (event.error === "aborted" || event.error === "no-speech") {
        setVoiceListening(false);
        return;
      }
      setVoiceListening(false);
    };
  }, [router, setTranscript, setVoiceListening]);

  const startListen = () => {
    const rec = recognitionRef.current;
    if (!rec || !supported) return;
    setInterim("");
    try {
      rec.stop();
    } catch {
      // not running
    }
    // Brief pause so Chrome releases the previous session before restart
    window.setTimeout(() => {
      setVoiceListening(true);
      try {
        rec.start();
      } catch {
        setVoiceListening(false);
      }
    }, 180);
  };

  const stopListen = () => {
    recognitionRef.current?.stop();
    setVoiceListening(false);
  };

  const pickEvent = (event: (typeof QUICK_EVENTS)[number]) => {
    setComposing(true);
    speak(`Dressing you for ${event.occasion}.`);
    void generateOutfitAsync(event.occasion, event.style)
      .then((outfit) => {
        if (outfit?.stylingGuide) speak(outfit.stylingGuide);
      })
      .finally(() => setComposing(false));
  };

  const firstName = user?.displayName?.split(" ")[0];

  return (
    <div className="space-y-8 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Good morning{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Where are you going today?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          {weather
            ? `${Math.round(weather.tempC)}°C · ${weather.condition} in ${weather.location}. `
            : ""}
          Nothing dresses onto your photo until you speak or pick an occasion.
          Then we’ll suggest one look from your wardrobe — change anything by voice.
        </p>
      </motion.div>

      {/* Primary: tap to speak */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass shine-border relative overflow-hidden rounded-[2rem] p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(201,168,124,0.12),transparent_55%)]" />
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-[0.28em] text-champagne">
            Speak your day
          </p>
          <button
            type="button"
            onClick={() => (voiceListening ? stopListen() : startListen())}
            disabled={!supported || wardrobe.length === 0}
            className={cn(
              "mt-4 flex w-full max-w-xl items-center gap-4 rounded-full border px-5 py-4 text-left transition",
              voiceListening
                ? "border-champagne/50 bg-champagne/15 shadow-[0_0_40px_rgba(201,168,124,0.18)]"
                : "border-line bg-white/[0.03] hover:border-champagne/35"
            )}
          >
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
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
              <p className="text-sm text-ivory">
                {voiceListening
                  ? interim || "Listening…"
                  : composing
                    ? "Composing your look…"
                    : currentOutfit
                      ? "Tap to change anything — or describe a new event"
                      : "Tap to speak"}
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-mist">
                {supported
                  ? voiceListening
                    ? "Say where you’re going"
                    : "e.g. work meeting · dinner with parents"
                  : "Use Chrome for voice"}
              </p>
            </div>
            <Waveform active={voiceListening} />
          </button>

          <div className="mt-5 flex flex-wrap gap-2">
            {QUICK_EVENTS.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => pickEvent(event)}
                disabled={!wardrobe.length}
                className="rounded-full border border-line px-3.5 py-2 text-xs text-mist transition hover:border-champagne/40 hover:text-ivory"
              >
                {event.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {currentOutfit ? (
          <motion.div
            key={currentOutfit.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <OutfitStage
              outfit={currentOutfit}
              avatarUrl={avatarUrl}
              generating={composing}
            />
            <div className="mt-8">
              <VoiceOrb compact />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-[1.75rem] border border-dashed border-line px-6 py-14 text-center"
          >
            <p className="font-display text-2xl text-ivory">
              Waiting for today’s occasion
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-mist">
              Tap Speak above, or pick a quick occasion. We’ll dress you in one
              look from your wardrobe.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
