"use client";

import { useAetherStore } from "@/store/aether-store";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Bookmark, ArrowLeftRight, Share } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportModal } from "@/components/wardrobe/export-modal";
import type { Outfit } from "@/lib/types";
import { useEffect } from "react";

function TryOnImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [url, setUrl] = useState(src);
  useEffect(() => {
    if (src.startsWith("idb:")) {
      import("@/lib/avatar-storage").then(m => m.loadBlob(src.replace("idb:", ""))).then(res => {
        if (res) setUrl(res);
      });
    } else {
      setUrl(src);
    }
  }, [src]);
  return <img src={url} alt={alt} className={className} />;
}

export default function SavedLooksPage() {
  const router = useRouter();
  const savedTryOns = useAetherStore((s) => s.savedTryOns);
  const pendingSwapTryOn = useAetherStore((s) => s.pendingSwapTryOn);
  const setPendingSwapTryOn = useAetherStore((s) => s.setPendingSwapTryOn);
  const swapTryOn = useAetherStore((s) => s.swapTryOn);
  const deleteTryOn = useAetherStore((s) => s.deleteTryOn);
  const setWornUrl = useAetherStore((s) => s.setCurrentTryOnUrl);
  const setCurrentOutfit = useAetherStore((s) => s.setCurrentOutfit);
  
  const [expandedLook, setExpandedLook] = useState<{ id: string; url: string; outfit: Outfit } | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-lg px-4 pt-4 pb-20 sm:px-6"
    >
      <div className="mb-6">
        <h1 className="text-xl font-medium tracking-wide text-ivory">Saved Looks</h1>
        <p className="mt-1 text-sm text-mist">
          {savedTryOns.length}/5 looks saved
        </p>
      </div>

      {pendingSwapTryOn && (
        <div className="mb-6 rounded-2xl border border-champagne/40 bg-champagne/10 p-4 relative overflow-hidden">
          <div className="flex items-start gap-4 relative z-10">
            <div className="rounded-full bg-champagne/20 p-2 shrink-0">
              <ArrowLeftRight className="h-5 w-5 text-champagne" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-champagne">Swap Look</h3>
              <p className="text-xs text-champagne/80 mt-1">
                You've reached your limit of 5 saved looks. Tap a look below to replace it with your new one.
              </p>
              <button
                onClick={() => setPendingSwapTryOn(null)}
                className="mt-3 text-xs font-medium uppercase tracking-wider text-mist hover:text-ivory transition-colors"
              >
                Cancel Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {savedTryOns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-line bg-ink/30 px-6 py-20 text-center mt-8">
          <Bookmark className="h-8 w-8 text-mist/50 mb-4" />
          <p className="text-sm text-mist">
            You haven't saved any looks yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <AnimatePresence>
            {savedTryOns.map((saved) => (
              <motion.div
                key={saved.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  "relative rounded-2xl border bg-ink-soft overflow-hidden group cursor-pointer transition-colors",
                  pendingSwapTryOn 
                    ? "border-champagne/30 hover:border-champagne/70"
                    : "border-line hover:border-mist"
                )}
                onClick={() => {
                  if (pendingSwapTryOn) {
                    swapTryOn(saved.id, pendingSwapTryOn.url, pendingSwapTryOn.outfit);
                    setPendingSwapTryOn(null);
                    alert("Look successfully swapped!");
                  } else {
                    setExpandedLook(saved);
                  }
                }}
              >
                <div className="aspect-[3/4] w-full">
                  <TryOnImage
                    src={saved.url}
                    alt="Saved try-on"
                    className="h-full w-full object-cover"
                  />
                </div>
                
                {pendingSwapTryOn && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-champagne text-ink text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full">
                      Replace
                    </span>
                  </div>
                )}

                {!pendingSwapTryOn && (
                  <div className="absolute top-2 right-2 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { downloadAndSharePhoto } = await import("@/lib/share-utils");
                          await downloadAndSharePhoto(saved.url, `voicedress-look-${saved.id}.jpg`);
                        } catch (err) {
                          // error handled in utility
                        }
                      }}
                      className="bg-black/60 text-white p-1.5 rounded-full hover:bg-champagne hover:text-black transition"
                      aria-label="Share saved look"
                    >
                      <Share className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTryOn(saved.id);
                      }}
                      className="bg-black/60 text-white p-1.5 rounded-full hover:bg-danger/80 transition"
                      aria-label="Delete saved look"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {expandedLook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <button
                onClick={() => setExpandedLook(null)}
                className="p-2 text-white/70 hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
              <button
                onClick={async () => {
                  try {
                    const { downloadAndSharePhoto } = await import("@/lib/share-utils");
                    await downloadAndSharePhoto(expandedLook.url, `voicedress-look-${expandedLook.id}.jpg`);
                  } catch (err) {}
                }}
                className="p-2 text-white/70 hover:text-champagne"
              >
                <Share className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4 flex items-center justify-center">
              <TryOnImage
                src={expandedLook.url}
                alt="Saved try-on"
                className="max-h-full max-w-full object-contain rounded-2xl"
              />
            </div>
            <div className="p-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
              <button
                onClick={() => {
                  setWornUrl(expandedLook.url);
                  setCurrentOutfit(expandedLook.outfit);
                  router.push("/today");
                }}
                className="w-full rounded-full bg-champagne py-4 text-sm font-semibold text-ink shadow-lg transition-transform active:scale-[0.98]"
              >
                Wear this Outfit Again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
