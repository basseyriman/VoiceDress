"use client";

import { useAetherStore } from "@/store/aether-store";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X, Bookmark, ArrowLeftRight, Share } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportModal } from "@/components/wardrobe/export-modal";
import type { Outfit } from "@/lib/types";

export default function SavedLooksPage() {
  const router = useRouter();
  const savedTryOns = useAetherStore((s) => s.savedTryOns);
  const pendingSwapTryOn = useAetherStore((s) => s.pendingSwapTryOn);
  const setPendingSwapTryOn = useAetherStore((s) => s.setPendingSwapTryOn);
  const swapTryOn = useAetherStore((s) => s.swapTryOn);
  const deleteTryOn = useAetherStore((s) => s.deleteTryOn);
  const setWornUrl = useAetherStore((s) => s.setCurrentTryOnUrl);
  const setCurrentOutfit = useAetherStore((s) => s.setCurrentOutfit);
  
  const [exportingOutfit, setExportingOutfit] = useState<Outfit | null>(null);

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
                    setWornUrl(saved.url);
                    setCurrentOutfit(saved.outfit);
                    router.push("/today");
                  }
                }}
              >
                <div className="aspect-[3/4] w-full">
                  <img
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportingOutfit(saved.outfit);
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

      {exportingOutfit && (
        <ExportModal 
          outfit={exportingOutfit} 
          garments={exportingOutfit.garments || []} 
          onClose={() => setExportingOutfit(null)} 
        />
      )}
    </motion.div>
  );
}
