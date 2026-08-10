"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Sparkles, ArrowRight, Tags } from "lucide-react";
import { useAetherStore } from "@/store/aether-store";
import { authFetch } from "@/lib/auth-fetch";

type Suggestion = {
  id: string;
  name: string;
  category: string;
  price: number;
  rationale: string;
  imageUrl: string;
};

export default function ShopperPage() {
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const user = useAetherStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const fetchSuggestions = async () => {
      if (!user) return;
      try {
        const activeWardrobe = wardrobe.filter(g => !g.isWishlist && !g.isArchived);
        const res = await authFetch("/api/shopper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wardrobe: activeWardrobe,
            stylePrefs: user.stylePrefs || []
          })
        });

        if (!res.ok) throw new Error("Failed to fetch suggestions");
        const data = await res.json();
        if (mounted) {
          setSuggestions(data.result.suggestions || []);
        }
      } catch (err) {
        if (mounted) setError("Failed to load personal shopper suggestions. Please try again.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSuggestions();

    return () => {
      mounted = false;
    };
  }, [user, wardrobe]);

  const styleLabels = user?.stylePrefs?.length 
    ? user.stylePrefs.join(" + ") 
    : "Classic";

  return (
    <div className="space-y-8 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Curated Feed
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Personal Shopper
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          Based on your closet gaps and love for <span className="text-champagne font-medium capitalize">{styleLabels}</span> style, here are specific pieces you should invest in next.
        </p>
      </motion.div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-line px-6 py-32 text-center"
          >
            <Sparkles className="h-8 w-8 text-champagne animate-pulse mb-4" />
            <p className="font-display text-2xl text-ivory">
              Curating your store
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-mist">
              Searching for the perfect pieces to complete your wardrobe...
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-6 sm:grid-cols-2"
          >
            {suggestions.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-line bg-ink-soft transition hover:border-champagne/50"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/50">
                  <img 
                    src={item.imageUrl && item.imageUrl !== 'placeholder' ? item.imageUrl : "https://images.unsplash.com/photo-1434389678369-183423d6a0ce?w=400"} 
                    alt={item.name} 
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1434389678369-183423d6a0ce?w=400";
                    }}
                    className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-4 right-4 bg-ink/80 backdrop-blur-md rounded-full px-3 py-1 border border-line">
                    <span className="text-xs font-medium text-ivory">
                      ${item.price}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-2 flex items-center gap-2">
                    <Tags className="h-3 w-3 text-champagne" />
                    <span className="text-xs uppercase tracking-wider text-champagne">
                      {item.category}
                    </span>
                  </div>
                  
                  <h3 className="font-display text-2xl text-ivory mb-4">
                    {item.name}
                  </h3>
                  
                  <div className="mt-auto rounded-xl bg-champagne/5 border border-champagne/10 p-4">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-champagne shrink-0 mt-0.5" />
                      <p className="text-sm text-mist leading-relaxed">
                        {item.rationale}
                      </p>
                    </div>
                  </div>

                  <button className="mt-6 w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ivory text-ink text-sm font-medium transition hover:bg-champagne">
                    <ShoppingBag className="h-4 w-4" />
                    Find Similar Items
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
