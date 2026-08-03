import { cert, getApps, initializeApp, type App } from "firebase-admin/app";

let app: App | null = null;

/**
 * Env present for Admin — does not load firebase-admin/auth (jose / jwks-rsa
 * crashes under Turbopack with ERR_REQUIRE_ESM if auth is imported at top level).
 */
export function isAdminConfigured(): boolean {
  const json =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (json) return true;
  return Boolean(
    process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_PRIVATE_KEY?.trim()
  );
}

/** Server-only Firebase Admin — required for Stripe webhooks + API auth. */
export function getAdminApp(): App | null {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const json =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  try {
    if (json) {
      const parsed = JSON.parse(json) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      app = initializeApp({
        credential: cert({
          projectId: parsed.project_id || projectId,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        }),
      });
      return app;
    }

    if (projectId && clientEmail && privateKey) {
      privateKey = privateKey.replace(/\\n/g, "\n");
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      return app;
    }
  } catch (err) {
    console.error("Firebase Admin init failed", err);
    return null;
  }

  return null;
}

let authLoadFailed = false;

/** Lazy-load auth so try-on routes can fall back to JWKS when jose breaks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAdminAuth(): any | null {
  if (authLoadFailed) return null;
  const a = getAdminApp();
  if (!a) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAuth } = require("firebase-admin/auth") as typeof import("firebase-admin/auth");
    return getAuth(a);
  } catch (err) {
    authLoadFailed = true;
    console.warn(
      "[firebase-admin] auth unavailable (jose/jwks); using JWKS fallback",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

let dbLoadFailed = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAdminDb(): any | null {
  if (dbLoadFailed) return null;
  const a = getAdminApp();
  if (!a) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getFirestore } = require("firebase-admin/firestore") as typeof import("firebase-admin/firestore");
    return getFirestore(a);
  } catch (err) {
    dbLoadFailed = true;
    console.warn(
      "[firebase-admin] firestore unavailable",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
