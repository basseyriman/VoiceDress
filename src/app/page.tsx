"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CloudSun, Mic, Sparkles, UserRound } from "lucide-react";
import { Button, Logo } from "@/components/ui/button";

const pillars = [
  {
    icon: Mic,
    title: "Voice, not forms",
    body: "Say the occasion. Swap a piece. Ask for old money. VoiceDress listens and restyles in real time.",
  },
  {
    icon: UserRound,
    title: "Full look on you",
    body: "Clothes, shoes, glasses, watch — dressed onto your photo so you see yourself leaving the house.",
  },
  {
    icon: CloudSun,
    title: "Weather-aware",
    body: "Live forecasts shape every suggestion so you never overdress for July or underprepare for London rain.",
  },
  {
    icon: Sparkles,
    title: "One look, not a feed",
    body: "One confident suggestion for today. Don’t like a piece? Tap it or say “change the shoes.”",
  },
];

export default function LandingPage() {
  return (
    <div className="grain relative overflow-hidden">
      <div className="relative z-10">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6">
          <Logo variant="header" />
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-mist hover:text-ivory">
              Sign in
            </Link>
            <Link href="/signup">
              <Button size="sm">Begin</Button>
            </Link>
          </div>
        </header>

        <section className="relative mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-center px-4 pb-20 pt-8 sm:px-6">
          <div className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1800&q=80"
              alt=""
              className="h-full w-full object-cover opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/50" />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85 }}
            className="max-w-3xl font-display text-5xl font-medium italic leading-[1.08] text-ivory sm:text-7xl"
          >
            Dress without deciding.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.16 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-ivory-muted sm:text-lg"
          >
            Speak the day — VoiceDress dresses the full look on your photo.
            Weather-aware. One suggestion. Swap by voice.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.24 }}
            className="mt-10 flex flex-wrap gap-3"
          >
            <Link href="/signup">
              <Button size="lg">
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Enter wardrobe
              </Button>
            </Link>
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              Why VoiceDress
            </p>
            <h2 className="mt-3 font-display text-4xl text-ivory">
              Decision fatigue ends here.
            </h2>
            <p className="mt-4 text-mist">
              No manual tagging. No photographing every shirt. Commerce sync,
              weather intelligence, and voice styling carry the load.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {pillars.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="glass shine-border rounded-3xl p-7"
              >
                <p.icon className="h-5 w-5 text-champagne" />
                <h3 className="mt-4 font-display text-2xl text-ivory">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mist">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-28 sm:px-6">
          <div className="glass shine-border overflow-hidden rounded-[2rem]">
            <div className="grid lg:grid-cols-2">
              <div className="relative min-h-[320px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&q=80"
                  alt="Premium wardrobe atmosphere"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-ink/20 to-ink/70" />
              </div>
              <div className="flex flex-col justify-center p-8 sm:p-12">
                <Sparkles className="h-5 w-5 text-champagne" />
                <h2 className="mt-4 font-display text-4xl text-ivory">
                  Speak once. Walk out certain.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-mist">
                  “Parents-in-law are coming — change the shoes.” VoiceDress
                  swaps the piece, keeps the rest of the look, and shows it on
                  your photo — not a wishlist.
                </p>
                <Link href="/signup" className="mt-8">
                  <Button>
                    Create your VoiceDress
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-line/50 px-4 py-10 text-center text-xs text-mist sm:px-6">
          © {new Date().getFullYear()} VoiceDress · Dress without deciding
        </footer>
      </div>
    </div>
  );
}
