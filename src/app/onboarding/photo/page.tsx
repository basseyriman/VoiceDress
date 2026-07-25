"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ImageIcon, Loader2 } from "lucide-react";
import { Button, Logo } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { CameraCaptureModal } from "@/components/wardrobe/camera-capture-modal";
import { processBodyPhotoForTryOn } from "@/lib/image";
import { needsPhotoOnboarding } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useAetherStore } from "@/store/aether-store";

const BEATS = [
  "Stand full-body in frame, facing the camera.",
  "Hands relaxed by your sides — standing at ease.",
  "Even light, no heavy filters — so we can dress the look on you.",
];

/** Deliberate Wispr-like pacing (ms) */
const INTRO_PAUSE_MS = 1400;
const BEAT_HOLD_MS = 3200;
const EXIT_HOLD_MS = 1800;
const PROCESS_MIN_MS = 900;

type Phase = "intro" | "capture";
type PhotoStatus = "empty" | "processing" | "ready";

export default function PhotoOnboardingPage() {
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const hydrated = useAetherStore((s) => s.hydrated);
  const setAvatar = useAetherStore((s) => s.setAvatar);

  const [phase, setPhase] = useState<Phase>("intro");
  const [beat, setBeat] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>("empty");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!needsPhotoOnboarding(user)) {
      router.replace("/today");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    if (phase !== "intro") return;

    if (beat === 0) {
      const t = window.setTimeout(() => setBeat(1), INTRO_PAUSE_MS);
      return () => window.clearTimeout(t);
    }
    if (beat > BEATS.length) {
      const t = window.setTimeout(() => setPhase("capture"), EXIT_HOLD_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setBeat((b) => b + 1), BEAT_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [phase, beat]);

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setError("");
    setPhotoStatus("processing");
    setPreview(null);
    try {
      const prepared = await processBodyPhotoForTryOn(file, {
        minMs: PROCESS_MIN_MS,
      });
      if (prepared.error || !prepared.dataUrl) {
        setError(prepared.error || "That photo couldn’t be used. Try another.");
        setPhotoStatus("empty");
        setPreview(null);
        return;
      }
      setPreview(prepared.dataUrl);
      setPhotoStatus("ready");
    } catch {
      setError("Couldn’t use that photo. Try a JPG or PNG.");
      setPhotoStatus("empty");
      setPreview(null);
    } finally {
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const enterApp = async () => {
    if (!preview || photoStatus !== "ready") return;
    setSaving(true);
    setError("");
    try {
      await setAvatar(preview, "ready");
      router.replace("/today");
    } catch {
      setError("Couldn’t save your photo. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const processing = photoStatus === "processing";
  const canEnter = photoStatus === "ready" && Boolean(preview) && !saving;

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Preparing…
      </div>
    );
  }

  return (
    <div className="grain relative flex min-h-screen flex-col px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-champagne/[0.08] blur-[100px]" />
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>

        <div className="flex flex-1 flex-col justify-center pb-16">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.28em] text-champagne">
            Your photo
          </p>
          <h1 className="mt-3 text-center font-display text-3xl text-ivory sm:text-4xl">
            One clear look at you
          </h1>
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-mist">
            VoiceDress dresses outfits onto your photo. Take a moment to get this
            right — then the wardrobe opens.
          </p>

          {phase === "intro" && (
            <div className="mx-auto mt-14 flex min-h-[13rem] w-full max-w-lg flex-col items-center justify-center">
              <div className="relative flex min-h-[6.5rem] w-full items-center justify-center px-2">
                <AnimatePresence mode="wait">
                  {beat >= 1 && beat <= BEATS.length ? (
                    <motion.p
                      key={BEATS[beat - 1]}
                      initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                      transition={{
                        duration: 0.9,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="absolute inset-x-0 text-center font-display text-[1.35rem] leading-[1.35] text-ivory sm:text-[1.65rem]"
                    >
                      {BEATS[beat - 1]}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="mt-10 flex items-center gap-2.5">
                {BEATS.map((_, i) => (
                  <span
                    key={BEATS[i]}
                    className={cn(
                      "h-1 rounded-full transition-all duration-700",
                      beat > i + 1
                        ? "w-4 bg-champagne/50"
                        : beat === i + 1
                          ? "w-7 bg-champagne"
                          : "w-4 bg-white/15"
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {phase === "capture" && (
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-10 w-full max-w-md space-y-5"
            >
              <div className="glass shine-border overflow-hidden rounded-[1.75rem]">
                <div className="relative mx-auto aspect-[3/4] w-full max-w-[17.5rem] overflow-hidden bg-stone sm:max-w-[19rem]">
                  <AnimatePresence mode="wait">
                    {preview && photoStatus === "ready" ? (
                      <motion.div
                        key="ready"
                        initial={{ opacity: 0, scale: 1.03 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preview}
                          alt="Your prepared photo"
                          className="absolute inset-0 h-full w-full object-cover object-top"
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
                      >
                        {!processing && (
                          <>
                            <div className="h-24 w-16 rounded-full border border-dashed border-line/80" />
                            <p className="mt-4 text-sm text-mist">
                              Full-body or clear standing portrait
                            </p>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {processing && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-ink/55 backdrop-blur-[2px]">
                      <Loader2
                        className="h-9 w-9 animate-spin text-champagne"
                        aria-hidden
                      />
                      <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-champagne">
                        Processing
                      </p>
                      <p className="mt-2 max-w-[13rem] text-center text-xs text-mist">
                        Preparing your photo for dressing
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-3 border-t border-line/60 p-5">
                  <input
                    ref={libraryRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                    className="hidden"
                    onChange={(e) => void onPhoto(e.target.files?.[0])}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={processing || saving}
                      onClick={() => libraryRef.current?.click()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-champagne/15 px-4 py-2.5 text-xs text-champagne transition hover:bg-champagne/25 disabled:opacity-50"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Choose photo
                    </button>
                    <button
                      type="button"
                      disabled={processing || saving}
                      onClick={() => setCameraOpen(true)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-4 py-2.5 text-xs text-ivory transition hover:border-champagne/40 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Take photo
                    </button>
                  </div>
                  <FieldError>{error}</FieldError>
                  <Button
                    className="w-full"
                    disabled={!canEnter}
                    onClick={() => void enterApp()}
                  >
                    {saving ? "Saving…" : "Enter VoiceDress"}
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPhase("intro");
                  setBeat(0);
                }}
                className="mx-auto block text-center text-xs text-mist transition hover:text-ivory-muted"
              >
                Replay instructions
              </button>
            </motion.div>
          )}
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void onPhoto(file)}
      />
    </div>
  );
}
