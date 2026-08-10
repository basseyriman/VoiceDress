"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Trash2, Archive, Undo2, Upload } from "lucide-react";
import Link from "next/link";
import { GarmentTile } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
import { useGarmentUpload } from "@/hooks/use-garment-upload";
import type { Garment, GarmentCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: (GarmentCategory | "all")[] = [
  "all",
  "top",
  "bottom",
  "outerwear",
  "dress",
  "shoes",
  "bag",
  "accessory",
];

export default function WardrobePage() {
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const removeGarment = useAetherStore((s) => s.removeGarment);
  const updateGarment = useAetherStore((s) => s.updateGarment);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [pendingDelete, setPendingDelete] = useState<Garment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const { fileRef, syncing, uploadProgress, progressLabel, onIngestFiles, toast, error, setToast, setError } = useGarmentUpload();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Hide the floating Speak pill while the confirm dialog is open
  useEffect(() => {
    if (!pendingDelete) return;
    document.body.dataset.hideFlowDock = "1";
    return () => {
      delete document.body.dataset.hideFlowDock;
    };
  }, [pendingDelete]);

  const items = useMemo(() => {
    const modeFiltered = wardrobe.filter((g) =>
      viewMode === "archived" ? g.isArchived : !g.isArchived
    );
    return filter === "all"
      ? modeFiltered
      : modeFiltered.filter((g) => g.category === filter);
  }, [wardrobe, filter, viewMode]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeGarment(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
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
          Closet
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Your wardrobe
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          {wardrobe.length} pieces. Upload new garments below — remove mistakes with the
          bin.
        </p>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs capitalize tracking-wide transition",
              filter === f
                ? "border-champagne/50 bg-champagne/10 text-champagne"
                : "border-line text-mist hover:text-ivory"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex rounded-full border border-line p-1 w-[200px]">
          <button
            onClick={() => setViewMode("active")}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
              viewMode === "active"
                ? "bg-ink-soft text-ivory"
                : "text-mist hover:text-ivory/80"
            )}
          >
            Active
          </button>
          <button
            onClick={() => setViewMode("archived")}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition",
              viewMode === "archived"
                ? "bg-ink-soft text-ivory"
                : "text-mist hover:text-ivory/80"
            )}
          >
            Archived
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onIngestFiles(e.target.files)}
          />
          <button
            disabled={!!syncing}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full bg-champagne/15 border border-champagne/30 px-4 py-1.5 text-xs font-medium text-champagne transition hover:bg-champagne/25 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Upload className="h-3.5 w-3.5" />
            {progressLabel || "Upload Garments"}
          </button>
          
          {uploadProgress && uploadProgress.total > 1 && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-champagne transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (uploadProgress.done / uploadProgress.total) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
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
          <Archive className="h-8 w-8 text-mist/50 mb-4" />
          <p className="text-sm text-mist">
            {viewMode === "archived" 
              ? "You haven't archived any pieces yet." 
              : "Your wardrobe is empty for this category."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div key={g.id} className="relative group/card">
              <GarmentTile 
                garment={g} 
                large 
                actions={
                  <>
                    <button
                      type="button"
                      aria-label={g.isArchived ? "Restore" : "Archive"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void updateGarment(g.id, { isArchived: !g.isArchived });
                      }}
                      className="text-mist hover:text-champagne transition-colors p-1"
                    >
                      {g.isArchived ? (
                        <Undo2 className="h-5 w-5" />
                      ) : (
                        <Archive className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(g);
                      }}
                      className="text-mist hover:text-danger transition-colors p-1"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </>
                }
              />
            </div>
          ))}
        </div>
      )}

      {pendingDelete &&
        portalReady &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-garment-title"
              className="w-full max-w-md rounded-[1.5rem] border border-line bg-ink p-6 shadow-2xl"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-champagne">
                Remove piece
              </p>
              <h2
                id="delete-garment-title"
                className="mt-2 font-display text-2xl text-ivory"
              >
                Remove {pendingDelete.name}?
              </h2>
              <p className="mt-2 text-sm text-mist">
                It leaves your wardrobe and stops showing in suggestions.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setPendingDelete(null)}
                  className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm text-mist hover:text-ivory"
                >
                  Keep
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void confirmDelete()}
                  className="flex-1 rounded-full border border-champagne/40 bg-champagne/15 px-4 py-2.5 text-sm text-champagne"
                >
                  {deleting ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
