"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Sparkles, Trash2, Crosshair } from "lucide-react";
import { GarmentTile } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
import { useGarmentUpload } from "@/hooks/use-garment-upload";
import type { Garment } from "@/lib/types";
import { authFetch } from "@/lib/auth-fetch";

export default function WishlistPage() {
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const removeGarment = useAetherStore((s) => s.removeGarment);
  const updateGarment = useAetherStore((s) => s.updateGarment);

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  
  const { 
    fileRef, 
    syncing, 
    uploadProgress, 
    progressLabel, 
    onIngestFiles, 
    toast, 
    error, 
    setToast, 
    setError 
  } = useGarmentUpload();

  const items = useMemo(() => wardrobe.filter(g => g.isWishlist), [wardrobe]);

  const handleAnalyze = async (target: Garment) => {
    setAnalyzingId(target.id);
    try {
      const existingWardrobe = wardrobe.filter(g => !g.isWishlist && !g.isArchived);
      const res = await authFetch("/api/wishlist/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wardrobe: existingWardrobe, target })
      });
      if (!res.ok) throw new Error("Failed to analyze");
      const data = await res.json();
      await updateGarment(target.id, { 
        styleScore: data.result.score, 
        styleAdvice: data.result.advice 
      });
    } catch (e) {
      setError("Analysis failed. Try again.");
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Shopping
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Wishlist
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          Upload screenshots of clothes you want to buy. VoiceDress will analyze your existing wardrobe and give you a Style Score to tell you if it's worth it.
        </p>
      </motion.div>

      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void onIngestFiles(e.target.files, "manual", true)}
        />
        <button
          disabled={!!syncing}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-champagne text-ink px-6 text-sm font-medium transition hover:bg-champagne/90 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {progressLabel || "Add to Wishlist"}
        </button>
        
        {uploadProgress && uploadProgress.total > 1 && (
          <div className="flex items-center gap-2 ml-4">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-champagne transition-all duration-300"
                style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="rounded-2xl border border-champagne/30 bg-champagne/10 px-4 py-3 text-sm text-ivory flex justify-between items-center">
          {toast}
          <button onClick={() => setToast("")} className="text-mist hover:text-ivory">✕</button>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory flex justify-between items-center">
          {error}
          <button onClick={() => setError("")} className="text-mist hover:text-ivory">✕</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-line bg-ink/30 px-6 py-20 text-center">
          <Sparkles className="h-8 w-8 text-mist/50 mb-4" />
          <p className="text-sm text-mist">
            Your wishlist is empty. Upload a screenshot to try before you buy.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div key={g.id} className="relative group/card glass rounded-2xl p-4 flex flex-col">
              <div className="relative h-64 mb-4 rounded-xl overflow-hidden bg-ink-soft">
                {/* We use GarmentTile just for the image basically */}
                <img src={g.imageUrl} alt={g.name} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeGarment(g.id)}
                  className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-full text-white p-2 hover:bg-danger/80 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {g.styleScore !== undefined && (
                  <div className="absolute top-2 left-2 bg-ink/80 backdrop-blur-md border border-line px-3 py-1 rounded-full flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-champagne" />
                    <span className="text-xs font-bold text-ivory">{g.styleScore} Score</span>
                  </div>
                )}
              </div>
              
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-medium text-ivory mb-1">{g.name}</h3>
                  <p className="text-xs text-mist uppercase tracking-wide mb-3">{g.category}</p>
                </div>

                {g.styleAdvice ? (
                  <div className="mt-4 p-4 rounded-xl bg-champagne/10 border border-champagne/30">
                    <p className="text-sm text-champagne leading-relaxed">
                      {g.styleAdvice}
                    </p>
                  </div>
                ) : (
                  <button
                    disabled={analyzingId === g.id}
                    onClick={() => handleAnalyze(g)}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-ivory transition hover:bg-white/[0.04] disabled:opacity-50"
                  >
                    {analyzingId === g.id ? (
                      <>
                        <Sparkles className="h-4 w-4 animate-spin text-champagne" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Crosshair className="h-4 w-4 text-mist" />
                        Analyze Fit
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
