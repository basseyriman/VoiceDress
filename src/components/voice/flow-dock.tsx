"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  createSpeechRecognizer,
  handleVoiceCommandAsync,
  stopSpeaking,
  unlockSpeech,
} from "@/lib/voice";
import { buildVoiceHandlers } from "@/lib/voice-handlers";
import { useAetherStore } from "@/store/aether-store";
import { Waveform } from "@/components/voice/waveform";
import { cn } from "@/lib/utils";

/** Always-available voice pill — tap to speak your look. */
export function FlowDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState<"idle" | "listening" | "working">("idle");
  const [dockBlocked, setDockBlocked] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const pathnameRef = useRef(pathname);
  const listening = useAetherStore((s) => s.voiceListening);
  const setListening = useAetherStore((s) => s.setVoiceListening);
  const setTranscript = useAetherStore((s) => s.setTranscript);

  pathnameRef.current = pathname;

  const pathHidden =
    pathname.startsWith("/today") || pathname.startsWith("/try-on");
  const hidden = pathHidden || dockBlocked;

  useEffect(() => {
    const sync = () =>
      setDockBlocked(document.body.dataset.hideFlowDock === "1");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-hide-flow-dock"],
    });
    return () => obs.disconnect();
  }, []);

  const ensureRecognizer = () => {
    if (recognitionRef.current) return recognitionRef.current;
    const rec = createSpeechRecognizer();
    if (!rec) {
      setSupported(false);
      return null;
    }
    setSupported(true);
    rec.interimResults = true;
    rec.lang = "en-GB";
    rec.continuous = false;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setHint(interimText);
      if (finalText) {
        const text = finalText.trim();
        const path = pathnameRef.current;
        setTranscript(text);
        setHint(text);
        setListening(false);
        setPhase("working");
        setHint("Styling your look…");
        void handleVoiceCommandAsync(text, buildVoiceHandlers(router, path))
          .then((result) => {
            const interrupted =
              result &&
              typeof result === "object" &&
              "interrupted" in result &&
              Boolean((result as { interrupted?: boolean }).interrupted);
            if (interrupted) {
              setHint("Stopped.");
            } else if (typeof result?.reply === "string" && result.reply) {
              setHint(result.reply.slice(0, 100));
            } else {
              setHint("Done.");
            }
            setTimeout(() => {
              setHint("");
              setPhase("idle");
            }, 3200);
          })
          .catch(() => {
            setHint("Couldn’t style that — tap Speak and try again.");
            setTimeout(() => {
              setHint("");
              setPhase("idle");
            }, 3200);
          });
      }
    };
    rec.onend = () => {
      setListening(false);
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setListening(false);
      setPhase("idle");
      if (event.error === "not-allowed") {
        setHint("Allow microphone access to speak.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setHint("Couldn’t hear that — tap Speak and try again.");
      }
    };
    recognitionRef.current = rec;
    return rec;
  };

  useEffect(() => {
    if (hidden) return;
    ensureRecognizer();
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, router, setTranscript, setListening]);

  if (hidden) return null;

  const toggle = () => {
    const rec = ensureRecognizer();
    if (!rec) {
      setHint("Voice needs Chrome or Edge on this phone.");
      setTimeout(() => setHint(""), 3200);
      return;
    }
    if (listening || phase === "listening") {
      try {
        rec.stop();
      } catch {
        // ignore
      }
      setListening(false);
      setPhase("idle");
      setHint("");
      return;
    }
    if (phase === "working") return;

    stopSpeaking();
    unlockSpeech();
    setPhase("listening");
    setHint("Listening…");
    try {
      rec.stop();
    } catch {
      // not running
    }
    const start = () => {
      try {
        rec.start();
        setListening(true);
      } catch {
        window.setTimeout(() => {
          try {
            rec.start();
            setListening(true);
          } catch {
            setListening(false);
            setPhase("idle");
            setHint("Couldn’t start mic — tap Speak again.");
            setTimeout(() => setHint(""), 2800);
          }
        }, 220);
      }
    };
    window.setTimeout(start, 60);
  };

  const active = listening || phase === "listening" || phase === "working";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[110] flex flex-col items-center px-4 md:bottom-8">
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-none mb-3 max-w-md truncate rounded-full border border-line bg-ink/90 px-4 py-2 text-center text-xs text-ivory backdrop-blur-xl"
          >
            {hint}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={toggle}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.96 }}
        className={cn(
          "pointer-events-auto flex min-h-[3rem] items-center gap-3 rounded-full border px-5 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-colors",
          active
            ? "border-champagne/50 bg-champagne text-ink"
            : "border-champagne/35 bg-ink/90 text-champagne hover:bg-champagne/10"
        )}
        aria-label={
          phase === "working"
            ? "Styling"
            : listening
              ? "Stop listening"
              : "Speak your look"
        }
      >
        {listening || phase === "listening" ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        <span className="text-xs font-medium tracking-wide">
          {phase === "working"
            ? "Styling…"
            : listening || phase === "listening"
              ? "Listening"
              : supported
                ? "Speak"
                : "Speak (Chrome)"}
        </span>
        <Waveform
          active={listening || phase === "listening"}
          className="h-5"
        />
      </motion.button>
    </div>
  );
}
