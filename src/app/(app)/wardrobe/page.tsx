"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Trash2, Archive, ArchiveRestore } from "lucide-react";
import { GarmentTile } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
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
          {wardrobe.length} pieces. Add via Connect — remove mistakes with the
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

      <div className="flex rounded-full border border-line p-1 max-w-[200px]">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <div key={g.id} className="relative group/card">
            <GarmentTile garment={g} large />
            <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 opacity-100 sm:opacity-0 sm:group-hover/card:opacity-100 transition-opacity">
              <button
                type="button"
                aria-label={g.isArchived ? `Restore ${g.name}` : `Archive ${g.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void updateGarment(g.id, { isArchived: !g.isArchived });
                }}
                className="rounded-full border border-line bg-ink/80 p-2 text-mist backdrop-blur-sm transition hover:border-champagne/50 hover:text-champagne"
              >
                {g.isArchived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                aria-label={`Remove ${g.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(g);
                }}
                className="rounded-full border border-line bg-ink/80 p-2 text-mist backdrop-blur-sm transition hover:border-danger/50 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

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
