import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import type { UserProfile } from "@/lib/types";

export type AuthedUser = {
  uid: string;
  email?: string;
};

/** Verify Firebase ID token from Authorization: Bearer <token>. */
export async function requireAuth(
  req: NextRequest
): Promise<AuthedUser | NextResponse> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return NextResponse.json(
      { error: "Sign in required.", code: "auth_required" },
      { status: 401 }
    );
  }

  // Local/demo without Admin: accept unsigned uid header only when explicitly allowed
  if (!isAdminConfigured()) {
    if (process.env.ALLOW_INSECURE_API === "true") {
      const uid = req.headers.get("x-voicedress-uid");
      if (uid) return { uid, email: undefined };
    }
    return NextResponse.json(
      {
        error:
          "Server auth is not configured. Set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON).",
        code: "admin_not_configured",
      },
      { status: 503 }
    );
  }

  try {
    const decoded = await getAdminAuth()!.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired session. Please sign in again.", code: "auth_invalid" },
      { status: 401 }
    );
  }
}

export function isAuthedUser(
  value: AuthedUser | NextResponse
): value is AuthedUser {
  return !(value instanceof NextResponse) && "uid" in value;
}

/** Paid, active trial, or active subscription. */
export function isEntitled(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile) return false;
  const status = profile.subscriptionStatus || "none";
  if (status === "active") return true;
  if (status === "trialing") {
    const end =
      profile.trialEndsAt ||
      (profile.createdAt
        ? new Date(
            new Date(profile.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000
          ).toISOString()
        : null);
    if (!end) return true; // legacy trialing without end date — allow during migration
    return Date.now() < new Date(end).getTime();
  }
  return false;
}

export async function loadUserProfileAdmin(
  uid: string
): Promise<Partial<UserProfile> | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as Partial<UserProfile>;
}

/** Auth + membership gate for expensive routes (try-on, LLM styling, etc.). */
export async function requireEntitled(
  req: NextRequest
): Promise<AuthedUser | NextResponse> {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  // Without Admin DB we can't verify entitlement server-side
  if (!getAdminDb()) {
    if (process.env.ALLOW_INSECURE_API === "true") return auth;
    return NextResponse.json(
      {
        error: "Membership check unavailable. Configure Firebase Admin.",
        code: "admin_not_configured",
      },
      { status: 503 }
    );
  }

  const profile = await loadUserProfileAdmin(auth.uid);
  if (!isEntitled(profile)) {
    return NextResponse.json(
      {
        error:
          "Your trial has ended or membership is inactive. Open Billing to continue.",
        code: "entitlement_required",
      },
      { status: 402 }
    );
  }

  return auth;
}
