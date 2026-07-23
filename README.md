# Aether

**Dress without deciding.**

Aether is a premium, voice-first AI wardrobe. It auto-ingests clothing purchases from Amazon, eBay, Temu, SHEIN, ASOS, and Zara, suggests weather-aware outfits, and shows them on your lookalike avatar — so you never photograph or tag your closet by hand.

## Product pillars

1. **Zero-friction ingest** — retailer purchase sync (no bed-scan mandatory path)
2. **Voice styling** — speak occasions and swaps (Web Speech + AssemblyAI)
3. **Weather-aware engine** — Open-Meteo live context
4. **Lookalike try-on** — signup photo → avatar (Tripo3D / Meshy adapters)
5. **Membership** — Stripe subscriptions

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Firebase Auth / Firestore (`wardrobe-2135e`)
- Stripe Checkout + webhooks
- Framer Motion, Zustand, Lucide

## Quick start

```bash
npm install
cp .env.example .env.local
# fill Firebase, Stripe, optional AssemblyAI / Tripo / Meshy keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firebase rules

Deploy rules from `firebase/firestore.rules` in the [Firebase console](https://console.firebase.google.com/project/wardrobe-2135e/firestore/databases/-default-/security/rules).

## Environment

See `.env.example`. Never commit secrets. Rotate any key that was pasted into chat.

## Brand

**Aether** — elevated presence; the air you move through when getting dressed is effortless.
