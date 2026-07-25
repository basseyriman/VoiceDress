# Firebase + Vercel setup (VoiceDress)

## 1. Firestore

Console → **Build → Firestore Database → Create database**

- Start in production mode
- Open **Rules** tab and replace with contents of `firestore.rules` in this repo → Publish

## 2. Storage

Console → **Build → Storage → Get started**

- Open **Rules** and replace with `storage.rules` → Publish

## 3. Vercel env

Project → Settings → Environment Variables. Add (Production + Preview):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- Plus `OPENAI_API_KEY`, `FAL_KEY`, Stripe, Shopify as needed

Redeploy after saving.

## 4. Verify

1. Sign up on localhost
2. Confirm Firestore shows `users/{uid}` + `garments`
3. Confirm Storage has `users/{uid}/avatar.jpg` if you uploaded a photo
4. Sign in on another browser — wardrobe and photo restore
