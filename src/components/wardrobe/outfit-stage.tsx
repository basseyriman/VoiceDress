"use client";

import Image from "next/image";
import type { Garment, Outfit } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OutfitStage({
  outfit,
  avatarUrl,
}: {
  outfit: Outfit | null;
  avatarUrl?: string;
}) {
  const garments = outfit?.garments || [];

  return (
    <div className="glass shine-border relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(201,168,124,0.08),transparent_40%,rgba(245,240,232,0.03))]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-line bg-stone">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="Your Aether avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_30%,rgba(201,168,124,0.2),transparent_55%)] p-8 text-center">
              <div className="h-28 w-28 rounded-full border border-champagne/30 bg-gradient-to-b from-champagne/20 to-transparent" />
              <p className="font-display text-xl text-ivory">Your lookalike</p>
              <p className="text-xs text-mist">
                Upload a photo once — Aether builds your avatar for live try-on.
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-champagne">
              Live try-on
            </p>
            <p className="font-display text-lg text-ivory">
              {outfit?.name || "Awaiting suggestion"}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Composed look
          </p>
          <h2 className="mt-2 font-display text-3xl text-ivory">
            {outfit?.style ? `${outfit.style} edit` : "Ready when you are"}
          </h2>
          <p className="mt-2 text-sm text-mist">
            {outfit?.occasion
              ? `For ${outfit.occasion}`
              : "Speak an occasion or tap generate."}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {garments.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-line p-6 text-sm text-mist">
                No pieces selected yet. Connect stores or use voice to compose.
              </div>
            )}
            {garments.map((g) => (
              <GarmentTile key={g.id} garment={g} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GarmentTile({
  garment,
  active,
  onClick,
}: {
  garment: Garment;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-white/[0.02] p-3 text-left transition hover:border-champagne/40",
        active && "border-champagne/60 bg-champagne/5"
      )}
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-stone">
        <Image
          src={garment.imageUrl}
          alt={garment.name}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ivory">{garment.name}</p>
        <p className="truncate text-xs text-mist">
          {garment.brand} · {garment.category}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          {garment.hexColors.slice(0, 3).map((c) => (
            <span
              key={c}
              className="h-3 w-3 rounded-full border border-white/10"
              style={{ background: c }}
            />
          ))}
          <span className="ml-1 text-[10px] uppercase tracking-wider text-mist">
            {garment.source}
          </span>
        </div>
      </div>
    </button>
  );
}
