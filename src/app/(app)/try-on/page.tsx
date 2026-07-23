"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OutfitStage } from "@/components/wardrobe/outfit-stage";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { useAetherStore } from "@/store/aether-store";

export default function TryOnPage() {
  const user = useAetherStore((s) => s.user);
  const setAvatar = useAetherStore((s) => s.setAvatar);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);
  const generateOutfit = useAetherStore((s) => s.generateOutfit);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const imageDataUrl = String(reader.result);
      setAvatar(imageDataUrl, "generating");
      try {
        const res = await fetch("/api/avatar/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageDataUrl,
            name: user?.displayName,
          }),
        });
        const data = await res.json();
        setAvatar(data.avatarUrl || imageDataUrl, "ready");
      } catch {
        setAvatar(imageDataUrl, "ready");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Avatar studio
          </p>
          <h1 className="mt-2 font-display text-4xl text-ivory">See it on you</h1>
          <p className="mt-2 max-w-xl text-sm text-mist">
            Powered for lookalike generation via Tripo3D / Meshy pipelines. Upload
            once — every outfit renders on your avatar. Speak to swap pieces live.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy || user?.avatarStatus === "generating"
              ? "Generating…"
              : "Update photo"}
          </Button>
          <Button onClick={() => generateOutfit("evening presence", "old money")}>
            Restyle
          </Button>
        </div>
      </div>

      <OutfitStage outfit={currentOutfit} avatarUrl={user?.avatarUrl || user?.photoURL} />
      <VoiceOrb compact />
    </div>
  );
}
