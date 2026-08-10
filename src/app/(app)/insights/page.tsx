"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { PieChart, Palette, DollarSign, ArrowRight, Sparkles } from "lucide-react";
import { useAetherStore } from "@/store/aether-store";
import type { GarmentCategory } from "@/lib/types";

export default function InsightsPage() {
  const wardrobe = useAetherStore((s) => s.wardrobe);

  const activeWardrobe = useMemo(() => wardrobe.filter(g => !g.isWishlist && !g.isArchived), [wardrobe]);

  const totalValue = useMemo(() => {
    return activeWardrobe.reduce((acc, g) => acc + (g.price || 0), 0);
  }, [activeWardrobe]);

  const topColors = useMemo(() => {
    const colorCounts: Record<string, number> = {};
    activeWardrobe.forEach(g => {
      g.hexColors?.forEach(hex => {
        const h = hex.toLowerCase();
        colorCounts[h] = (colorCounts[h] || 0) + 1;
      });
    });
    return Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hex]) => hex);
  }, [activeWardrobe]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    activeWardrobe.forEach(g => {
      counts[g.category] = (counts[g.category] || 0) + 1;
    });
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({
        category: cat,
        count,
        percentage: Math.round((count / (activeWardrobe.length || 1)) * 100)
      }));
  }, [activeWardrobe]);

  const generateAdvice = () => {
    if (activeWardrobe.length < 5) return "Keep building your wardrobe to get deeper insights.";
    
    const catMap = Object.fromEntries(categoryBreakdown.map(c => [c.category, c.count]));
    const tops = catMap["top"] || 0;
    const bottoms = catMap["bottom"] || 0;
    const outerwear = catMap["outerwear"] || 0;
    
    if (bottoms === 0) return "You have no bottoms! Invest in a versatile pair of trousers.";
    if (tops / bottoms > 4) return "You are very heavy on tops. Consider buying more bottoms to create more combinations.";
    if (outerwear === 0) return "A good jacket or coat can elevate any outfit. Consider adding outerwear to your closet.";
    if (topColors.length > 0 && !topColors.includes("#000000") && !topColors.includes("#ffffff")) {
      return "Your wardrobe is very colorful! Consider adding some neutral basics (black, white, or beige) to anchor your outfits.";
    }
    return "Your wardrobe is well-balanced. You have a great foundation for mixing and matching.";
  };

  return (
    <div className="space-y-8 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Analytics
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Wardrobe Insights
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          A data-driven look at your personal style, shopping habits, and closet gaps.
        </p>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* WARDROBE VALUE CARD */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-3xl p-6 md:p-8"
        >
          <div className="flex items-center gap-3 mb-4 text-champagne">
            <DollarSign className="h-5 w-5" />
            <h2 className="font-display text-xl text-ivory">Closet Value</h2>
          </div>
          <p className="text-5xl font-light text-ivory mb-2">
            ${totalValue.toLocaleString()}
          </p>
          <p className="text-sm text-mist">
            Total estimated value of your {activeWardrobe.length} active pieces.
          </p>
        </motion.div>

        {/* COLOR PALETTE CARD */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-3xl p-6 md:p-8 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center gap-3 mb-4 text-champagne">
              <Palette className="h-5 w-5" />
              <h2 className="font-display text-xl text-ivory">Color Palette</h2>
            </div>
            <p className="text-sm text-mist mb-6">
              Your most worn and dominant colors.
            </p>
          </div>
          
          <div className="flex gap-2 h-16 w-full rounded-2xl overflow-hidden">
            {topColors.length > 0 ? (
              topColors.map((hex, i) => (
                <div 
                  key={i} 
                  className="flex-1 h-full"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))
            ) : (
              <div className="flex-1 h-full bg-ink-soft flex items-center justify-center text-xs text-mist">
                No color data
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* CATEGORY BREAKDOWN */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-3xl p-6 md:p-8 lg:col-span-2"
        >
          <div className="flex items-center gap-3 mb-6 text-champagne">
            <PieChart className="h-5 w-5" />
            <h2 className="font-display text-xl text-ivory">Category Distribution</h2>
          </div>
          
          <div className="space-y-5">
            {categoryBreakdown.map((cat, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-ivory capitalize">{cat.category}</span>
                  <span className="text-mist">{cat.count} items ({cat.percentage}%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-champagne transition-all duration-1000 ease-out"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {categoryBreakdown.length === 0 && (
              <p className="text-sm text-mist">Your wardrobe is empty.</p>
            )}
          </div>
        </motion.div>

        {/* AI ADVICE */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-3xl p-6 md:p-8 border border-champagne/20 bg-gradient-to-b from-champagne/10 to-transparent"
        >
          <div className="flex items-center gap-3 mb-4 text-champagne">
            <Sparkles className="h-5 w-5" />
            <h2 className="font-display text-xl text-ivory">Stylist Notes</h2>
          </div>
          <p className="text-ivory leading-relaxed mb-6">
            {generateAdvice()}
          </p>
          <a
            href="/wishlist"
            className="inline-flex items-center gap-2 text-sm text-champagne font-medium hover:text-champagne/80 transition"
          >
            Go to Wishlist <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </div>
  );
}
