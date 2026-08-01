import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

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

export function getAdminAuth() {
  const a = getAdminApp();
  return a ? getAuth(a) : null;
}

export function getAdminDb() {
  const a = getAdminApp();
  return a ? getFirestore(a) : null;
}

export function isAdminConfigured() {
  return Boolean(getAdminApp());
}
