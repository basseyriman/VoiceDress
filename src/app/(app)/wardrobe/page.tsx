"use client";

import { useMemo, useState } from "react";
import { GarmentTile } from "@/components/wardrobe/outfit-stage";
import { useAetherStore } from "@/store/aether-store";
import type { GarmentCategory } from "@/lib/types";
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
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");

  const items = useMemo(
    () =>
      filter === "all" ? wardrobe : wardrobe.filter((g) => g.category === filter),
    [wardrobe, filter]
  );

  return (
    <div className="space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">Closet</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Your wardrobe</h1>
        <p className="mt-2 text-sm text-mist">
          {wardrobe.length} pieces for Today. Add more via Connect — Shopify
          orders or a receipt / product photo.
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
          <GarmentTile key={g.id} garment={g} large />
        ))}
      </div>
    </div>
  );
}
