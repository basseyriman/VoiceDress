"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OutfitStage } from "@/components/wardrobe/outfit-stage";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { useAetherStore } from "@/store/aether-store";
import { prepareProfilePhoto } from "@/lib/image";
import { AVATAR_IDB_REF, loadAvatarBlob } from "@/lib/avatar-storage";
import { CameraCaptureModal } from "@/components/wardrobe/camera-capture-modal";

export default function TryOnPage() {
  const user = useAetherStore((s) => s.user);
  const setAvatar = useAetherStore((s) => s.setAvatar);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);
  const generateOutfitAsync = useAetherStore((s) => s.generateOutfitAsync);
  const weather = useAetherStore((s) => s.weather);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromStore = user?.avatarUrl || user?.photoURL;
      if (
        fromStore &&
        fromStore !== AVATAR_IDB_REF &&
        fromStore.startsWith("data:")
      ) {
        if (!cancelled) setLocalAvatar(fromStore);
        return;
      }
      const blob = await loadAvatarBlob();
      if (!cancelled && blob) setLocalAvatar(blob);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.avatarUrl, user?.photoURL]);

  useEffect(() => {
    if (weather && !currentOutfit) {
      void generateOutfitAsync(
        "work meeting",
        user?.stylePrefs?.[0] || "quiet luxury"
      );
    }
  }, [weather, currentOutfit, generateOutfitAsync, user?.stylePrefs]);

  const onUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareProfilePhoto(file);
      if (prepared.error || !prepared.dataUrl) {
        setError(prepared.error || "Invalid photo");
        return;
      }

      setLocalAvatar(prepared.dataUrl);
      await setAvatar(prepared.dataUrl, "ready");

      void fetch("/api/avatar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasImage: true,
          name: user?.displayName,
        }),
      });

      if (!currentOutfit) {
        void generateOutfitAsync("work meeting", "quiet luxury");
      }
    } catch {
      setError("Couldn’t use that photo. Try another JPG or PNG.");
    } finally {
      setBusy(false);
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const displayAvatar = localAvatar || undefined;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Your photo
          </p>
          <h1 className="mt-2 font-display text-4xl text-ivory">
            See yourself dressed
          </h1>
          <p className="mt-2 max-w-xl text-sm text-mist">
            Add a clear full-body photo — head to shoes. Choose from your gallery
            or take one live. Today’s look dresses onto this photo.
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          {displayAvatar && !error && (
            <p className="mt-2 text-xs text-mist">
              Photo ready. Add FAL_KEY if prompted, then the look can dress in.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={libraryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => libraryRef.current?.click()}
          >
            {busy ? "Preparing photo…" : "Choose photo"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setCameraOpen(true)}
          >
            Take photo
          </Button>
          <Button
            onClick={() =>
              void generateOutfitAsync("evening presence", "old money")
            }
          >
            Restyle
          </Button>
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void onUpload(file)}
      />

      <OutfitStage
        outfit={currentOutfit}
        avatarUrl={displayAvatar}
        generating={busy}
      />
      <VoiceOrb compact />
    </div>
  );
}
