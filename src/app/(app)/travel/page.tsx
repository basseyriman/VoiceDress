"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Sparkles, MapPin, CalendarDays, CheckCircle2 } from "lucide-react";
import { useAetherStore } from "@/store/aether-store";
import { authFetch } from "@/lib/auth-fetch";
import { GarmentTile } from "@/components/wardrobe/outfit-stage";
import { cn } from "@/lib/utils";
import type { Garment } from "@/lib/types";

type PackingPlan = {
  capsule: string[];
  checklist: { category: string; items: string[] }[];
  outfits: { day: string; description: string; garmentIds: string[] }[];
};

export default function TravelPage() {
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [plan, setPlan] = useState<PackingPlan | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;

    setGenerating(true);
    setError("");
    setPlan(null);

    try {
      const res = await authFetch("/api/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wardrobe,
          destination,
          days,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate plan");
      }

      const data = await res.json();
      setPlan(data.plan);
    } catch (err) {
      setError("Failed to generate packing list. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const getGarments = (ids: string[]) => {
    return ids
      .map((id) => wardrobe.find((g) => g.id === id))
      .filter(Boolean) as Garment[];
  };

  return (
    <div className="min-w-0 space-y-8 overflow-x-clip pb-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl"
      >
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Travel
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Where are you going?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          Tell VoiceDress your destination and trip length. We'll curate a perfect
          capsule wardrobe so you never overpack again.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass shine-border relative overflow-hidden rounded-[2rem] p-6 sm:p-8"
      >
        <form onSubmit={handleGenerate} className="relative z-10 flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full space-y-2">
            <label className="text-xs font-medium text-mist flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              Destination
            </label>
            <input
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Miami, Paris, Tokyo..."
              className="w-full rounded-xl border border-line bg-ink/50 px-4 py-3 text-sm text-ivory placeholder:text-mist/50 focus:border-champagne/50 focus:outline-none focus:ring-1 focus:ring-champagne/50 transition-colors"
            />
          </div>
          <div className="w-full sm:w-32 space-y-2">
            <label className="text-xs font-medium text-mist flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5" />
              Days
            </label>
            <input
              type="number"
              min="1"
              max="14"
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-xl border border-line bg-ink/50 px-4 py-3 text-sm text-ivory focus:border-champagne/50 focus:outline-none focus:ring-1 focus:ring-champagne/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={generating || !destination.trim()}
            className="w-full sm:w-auto inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-champagne text-ink px-6 text-sm font-medium transition hover:bg-champagne/90 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                Planning...
              </>
            ) : (
              <>
                <Plane className="h-4 w-4" />
                Pack
              </>
            )}
          </button>
        </form>
        {error && <p className="mt-4 text-sm text-danger text-center">{error}</p>}
      </motion.div>

      <AnimatePresence mode="wait">
        {generating && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-[1.75rem] border border-dashed border-line px-6 py-20 text-center flex flex-col items-center justify-center"
          >
            <Sparkles className="h-8 w-8 text-champagne animate-pulse mb-4" />
            <p className="font-display text-2xl text-ivory">
              Curating your capsule wardrobe
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-mist">
              Analyzing climate and finding the perfect pieces...
            </p>
          </motion.div>
        )}

        {plan && !generating && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {/* CAPSULE WARDROBE SECTION */}
            <section>
              <h2 className="font-display text-2xl text-ivory mb-6 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-champagne" />
                The Capsule
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {getGarments(plan.capsule).map((g) => (
                  <div key={g.id} className="relative group">
                    <GarmentTile garment={g} large />
                  </div>
                ))}
              </div>
            </section>

            {/* ITINERARY OUTFITS SECTION */}
            <section>
              <h2 className="font-display text-2xl text-ivory mb-6">
                Itinerary Looks
              </h2>
              <div className="space-y-6">
                {plan.outfits.map((outfit, i) => {
                  const items = getGarments(outfit.garmentIds);
                  return (
                    <div key={i} className="glass rounded-2xl p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-lg font-medium text-ivory">
                            {outfit.day}
                          </h3>
                          <p className="text-sm text-mist mt-1">
                            {outfit.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                        {items.map((g) => (
                          <div key={g.id} className="w-32 shrink-0">
                            <GarmentTile garment={g} large />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* CHECKLIST SECTION */}
            <section>
              <h2 className="font-display text-2xl text-ivory mb-6">
                Packing Checklist
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {plan.checklist.map((group, i) => (
                  <div key={i} className="glass rounded-2xl p-6">
                    <h3 className="text-sm uppercase tracking-wider text-champagne font-medium mb-4">
                      {group.category}
                    </h3>
                    <ul className="space-y-3">
                      {group.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-3">
                          <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-line bg-ink/50" />
                          <span className="text-sm text-mist">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
