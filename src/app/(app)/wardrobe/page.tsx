"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { GarmentTile } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
import type { Garment, GarmentCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const filters: (GarmentCategory | "all")[] = [
  "all",
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
  "dress",
];

export default function WardrobePage() {
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const removeGarment = useAetherStore((s) => s.removeGarment);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [pendingDelete, setPendingDelete] = useState<Garment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const items = useMemo(
    () =>
      filter === "all" ? wardrobe : wardrobe.filter((g) => g.category === filter),
    [wardrobe, filter]
  );

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
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">Closet</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Your wardrobe</h1>
        <p className="mt-2 text-sm text-mist">
          {wardrobe.length} pieces for Today. Add more via Connect — Shopify
          orders or a receipt / product photo. Tap the bin to remove a mistake.
        </p>
      </div>

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <div key={g.id} className="relative">
            <GarmentTile garment={g} large />
            <button
              type="button"
              aria-label={`Remove ${g.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(g);
              }}
              className="absolute right-3 top-3 z-10 rounded-full border border-line bg-ink/80 p-2 text-mist backdrop-blur-sm transition hover:border-champagne/50 hover:text-champagne"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
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
              It will leave your wardrobe and stop appearing in suggestions. This
              can’t be undone.
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
        </div>
      )}
    </div>
  );
}
