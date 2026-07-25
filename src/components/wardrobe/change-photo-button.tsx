"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon } from "lucide-react";
import { useAetherStore } from "@/store/aether-store";
import { processBodyPhotoForTryOn } from "@/lib/image";
import { CameraCaptureModal } from "@/components/wardrobe/camera-capture-modal";
import { cn } from "@/lib/utils";

/** Upload / replace the full-body photo used for try-on — gallery or live camera. */
export function ChangePhotoButton({
  className,
  onChanged,
  compact = false,
}: {
  className?: string;
  onChanged?: (dataUrl: string) => void;
  compact?: boolean;
}) {
  const setAvatar = useAetherStore((s) => s.setAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);

  const onUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await processBodyPhotoForTryOn(file, { minMs: 900 });
      if (prepared.error || !prepared.dataUrl) {
        setError(prepared.error || "Invalid photo");
        return;
      }
      onChanged?.(prepared.dataUrl);
      await setAvatar(prepared.dataUrl, "ready");
    } catch {
      setError("Couldn’t use that photo. Try a JPG or PNG.");
    } finally {
      setBusy(false);
      if (libraryRef.current) libraryRef.current.value = "";
    }
  };

  const btn = cn(
    "inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] text-mist transition hover:border-champagne/40 hover:text-ivory disabled:opacity-50",
    compact
      ? "px-3 py-1.5 text-[10px] uppercase tracking-wider"
      : "px-4 py-2 text-xs"
  );

  return (
    <div className={cn("inline-flex flex-col items-start gap-1", className)}>
      <input
        ref={libraryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={(e) => onUpload(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
          className={btn}
        >
          <ImageIcon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {busy ? "Processing…" : "Choose photo"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setCameraOpen(true)}
          className={btn}
        >
          <Camera className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          Take photo
        </button>
      </div>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void onUpload(file)}
      />
    </div>
  );
}
