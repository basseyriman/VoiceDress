"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OutfitStage } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
import { prepareProfilePhoto } from "@/lib/image";
import { resolveDisplayAvatar } from "@/lib/resolve-avatar";
import { authFetch } from "@/lib/auth-fetch";
import { CameraCaptureModal } from "@/components/wardrobe/camera-capture-modal";

export default function TryOnPage() {
  const user = useAetherStore((s) => s.user);
  const setAvatar = useAetherStore((s) => s.setAvatar);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);
  const generateOutfitAsync = useAetherStore((s) => s.generateOutfitAsync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await resolveDisplayAvatar(
        user?.avatarUrl || user?.photoURL
      );
      if (!cancelled && resolved) setLocalAvatar(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.avatarUrl, user?.photoURL]);

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

      void authFetch("/api/avatar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hasImage: true,
          name: user?.displayName,
        }),
      });
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
          <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
            See yourself dressed
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
            Full-body photo — head to shoes. This is the photo you will see yourself dressed in when you pick an occasion.
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          {displayAvatar && !error && (
            <p className="mt-2 text-xs text-mist">
              {currentOutfit
                ? "Photo ready — your look will be styled onto it."
                : "Photo ready — open the Today tab and name the occasion."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={libraryRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
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
          {currentOutfit ? (
            <Button
              onClick={() =>
                void generateOutfitAsync("evening presence")
              }
            >
              Restyle
            </Button>
          ) : null}
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
      {/* Voice lives on Today — keep Photo light so nav never freezes */}
    </div>
  );
}
