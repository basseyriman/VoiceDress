"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import { Sparkles } from "lucide-react";
import type { Outfit, Garment } from "@/lib/types";
import { GarmentTile } from "./outfit-stage";

interface ExportModalProps {
  outfit: Outfit;
  garments: Garment[];
  onClose: () => void;
}

export function ExportModal({ outfit, garments, onClose }: ExportModalProps) {
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const generateAndDownload = async () => {
      if (!exportRef.current) return;
      try {
        // Wait a tick for images to render
        await new Promise((r) => setTimeout(r, 500));
        
        const dataUrl = await toPng(exportRef.current, {
          quality: 1,
          pixelRatio: 2,
        });

        if (!mounted) return;

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `voicedress-ootd-${outfit.id}.png`, { type: "image/png" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "My VoiceDress Look",
          });
        } else {
          const link = document.createElement("a");
          link.download = `voicedress-ootd-${outfit.id}.png`;
          link.href = dataUrl;
          link.click();
        }
      } catch (err) {
        console.error("Failed to export image:", err);
      } finally {
        if (mounted) {
          onClose();
        }
      }
    };

    generateAndDownload();

    return () => {
      mounted = false;
    };
  }, [outfit, onClose]);

  // We mount the node fixed off-screen so html-to-image can capture it,
  // but it's not visible to the user.
  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "-9999px",
        left: "-9999px",
        pointerEvents: "none",
        zIndex: -1,
      }}
    >
      <div
        ref={exportRef}
        // Instagram Story aspect ratio is 9:16 (1080x1920)
        // We'll render at a 9:16 box to get a good screenshot
        className="relative flex flex-col bg-[#0d0d0d] overflow-hidden"
        style={{ width: "540px", height: "960px", padding: "40px" }}
      >
        {/* BACKGROUND GLOW */}
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-champagne/10 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-champagne/10 blur-[100px]" />

        {/* HEADER */}
        <div className="relative z-10 flex flex-col items-center mt-10">
          <p className="text-sm uppercase tracking-[0.3em] text-champagne font-medium">
            {outfit.occasion || "Outfit of the Day"}
          </p>
          <h1 className="mt-4 font-display text-5xl text-ivory text-center">
            {outfit.name}
          </h1>
        </div>

        {/* GARMENTS STACK */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 mt-10">
          {/* Layout changes slightly based on number of garments */}
          <div className="grid grid-cols-2 gap-4 w-full px-8">
            {garments.map((g) => (
              <div key={g.id} className="relative aspect-square rounded-2xl overflow-hidden bg-ink/50 border border-line">
                <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                  <p className="text-xs text-ivory font-medium truncate">{g.brand || g.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FOOTER WATERMARK */}
        <div className="relative z-10 flex flex-col items-center mb-10">
          <div className="flex items-center gap-2 text-champagne opacity-80">
            <Sparkles className="h-5 w-5" />
            <span className="font-display tracking-widest text-lg">VoiceDress AI</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
