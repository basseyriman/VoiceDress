# VoiceDress

**Dress without deciding.**

Voice-first wardrobe: speak the occasion, get the best look from *your* clothes, see it dressed on your photo. Membership via Stripe (£19/mo or £149/yr).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- **Firebase Auth + Firestore + Storage** (source of truth for users, wardrobe, photos)
- Stripe Checkout + webhooks
- fal.ai try-on, OpenAI for occasion/voice/ingest
- Framer Motion, Zustand

## Quick start

```bash
npm install
cp .env.example .env.local
# fill Firebase, Stripe, OPENAI_API_KEY, FAL_KEY, Shopify keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Firebase (required for paid product)

1. Enable **Authentication** → Email/Password (done).
2. Create **Firestore** database → paste rules from [`firestore.rules`](firestore.rules).
3. Create **Storage** → paste rules from [`storage.rules`](storage.rules).
4. Set all `NEXT_PUBLIC_FIREBASE_*` in `.env.local` **and** Vercel → Project → Settings → Environment Variables (Production + Preview), then redeploy.

Cloud paths:

- `users/{uid}` — profile + taste
- `users/{uid}/garments/{id}` — wardrobe
- `users/{uid}/outfits/{id}` — looks
- Storage: `users/{uid}/avatar.jpg`, `users/{uid}/garments/{id}.jpg`

Browser localStorage/IndexedDB is only a cache.

## Vercel

Add the same env vars as `.env.example`. After Firebase rules are live, redeploy so production uses cloud sync.

## Brand

**VoiceDress** — dress without deciding.
