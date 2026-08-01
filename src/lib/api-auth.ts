import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import type { UserProfile } from "@/lib/types";
import {
  FREE_PHOTO_TRYONS,
  PAID_PHOTO_TRYONS_PER_MONTH,
  currentPhotoTryOnMonthKey,
  freePhotoTryOnsUsed,
  isMembershipActive,
  photoTryOnCredits,
  photoTryOnsUsedThisMonth,
} from "@/lib/entitlement";
import { verifyFirebaseIdToken } from "@/lib/verify-firebase-token";

export type AuthedUser = {
  uid: string;
  email?: string;
};

function splitList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Founder / comps — server-only allowlist (never NEXT_PUBLIC_). */
export function isCompedAccount(user: {
  uid: string;
  email?: string | null;
}): boolean {
  const uids = splitList(process.env.ENTITLEMENT_BYPASS_UIDS);
  const emails = splitList(process.env.ENTITLEMENT_BYPASS_EMAILS);
  if (uids.includes(user.uid.toLowerCase())) return true;
  if (user.email && emails.includes(user.email.toLowerCase())) return true;
  return false;
}

const AUTH_UNAVAILABLE =
  "Dressing is temporarily unavailable. Please try again in a moment.";

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

  // Prefer Admin SDK when configured
  if (isAdminConfigured()) {
    try {
      const decoded = await getAdminAuth()!.verifyIdToken(token);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      return NextResponse.json(
        {
          error: "Invalid or expired session. Please sign in again.",
          code: "auth_invalid",
        },
        { status: 401 }
      );
    }
  }

  // Local / misconfigured Admin: still verify the Firebase ID token via Google JWKS
  if (process.env.ALLOW_INSECURE_API === "true") {
    const headerUid = req.headers.get("x-voicedress-uid")?.trim();
    if (headerUid) return { uid: headerUid, email: undefined };
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")
      ) as { user_id?: string; sub?: string; email?: string };
      const uid = payload.user_id || payload.sub;
      if (uid) return { uid, email: payload.email };
    } catch {
      // fall through to JWKS
    }
  }

  const verified = await verifyFirebaseIdToken(token);
  if (verified) return verified;

  return NextResponse.json(
    {
      error: AUTH_UNAVAILABLE,
      code: "auth_unavailable",
    },
    { status: 503 }
  );
}

export function isAuthedUser(
  value: AuthedUser | NextResponse
): value is AuthedUser {
  return !(value instanceof NextResponse) && "uid" in value;
}

/** Paid, active trial, or active subscription (or founder comp). */
export function isEntitled(
  profile: Partial<UserProfile> | null | undefined,
  user?: { uid: string; email?: string | null }
): boolean {
  if (user && isCompedAccount(user)) return true;
  return isMembershipActive(profile);
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

/** Auth + membership gate for features that require an active trial/plan. */
export async function requireEntitled(
  req: NextRequest
): Promise<AuthedUser | NextResponse> {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  if (isCompedAccount(auth)) return auth;

  const db = getAdminDb();
  if (!db) {
    // Signed-in user, Admin DB missing — don’t block the product on config
    console.warn(
      "[entitlement] Firebase Admin DB missing; allowing authenticated user",
      auth.uid
    );
    return auth;
  }

  const profile = await loadUserProfileAdmin(auth.uid);
  if (!isEntitled(profile, auth)) {
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

export type TryOnAccess = AuthedUser & {
  /** True when this request consumed the one free on-photo dress. */
  consumedFreeTryOn?: boolean;
};

/**
 * On-photo try-on gate: membership OR one unused free dress (aha moment).
 * Does not consume the free credit — call `consumeFreePhotoTryOn` after a
 * successful apparel response so failed dresses don't burn the gift.
 */
export async function requireTryOnAccess(
  req: NextRequest,
  opts?: { stage?: string }
): Promise<TryOnAccess | NextResponse> {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  if (isCompedAccount(auth)) return auth;

  const db = getAdminDb();
  if (!db) {
    // Auth works via JWKS; free-try metering needs Admin. Allow dress so the
    // live product isn’t blocked by missing service-account env.
    console.warn(
      "[try-on] Firebase Admin DB missing; allowing try-on for",
      auth.uid
    );
    return auth;
  }

  const profile = await loadUserProfileAdmin(auth.uid);
  if (isEntitled(profile, auth)) return auth;

  const used = freePhotoTryOnsUsed(profile);
  const stage = (opts?.stage || "auto").toLowerCase();
  const isApparelStage =
    stage === "apparel" ||
    stage === "auto" ||
    stage === "collage" ||
    stage === "base";

  // Finish / style after the free apparel dress must still run
  if (!isApparelStage) {
    return auth;
  }

  if (used >= FREE_PHOTO_TRYONS) {
    return NextResponse.json(
      {
        error:
          "You’ve used your free on-photo look. Start a 7-day free trial to keep dressing.",
        code: "trial_required",
      },
      { status: 402 }
    );
  }

  // Eligible for the free gift — credit consumed only after a successful dress
  return { ...auth, consumedFreeTryOn: false };
}

/** Mark the free on-photo gift as used (after a successful apparel dress). */
export async function consumeFreePhotoTryOn(
  uid: string
): Promise<{ consumed: boolean; used: number }> {
  const db = getAdminDb();
  if (!db) return { consumed: false, used: 0 };
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const profile = (snap.data() || {}) as Partial<UserProfile>;
  if (isEntitled(profile, { uid })) {
    return { consumed: false, used: freePhotoTryOnsUsed(profile) };
  }
  const used = freePhotoTryOnsUsed(profile);
  if (used >= FREE_PHOTO_TRYONS) {
    return { consumed: false, used };
  }
  const next = used + 1;
  await ref.set(
    {
      freePhotoTryOnsUsed: next,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return { consumed: true, used: next };
}

/**
 * After a successful multi-garment apparel dress for trial/paid members:
 * burn one included monthly look, else one banked top-up credit.
 */
export async function consumeMonthlyPhotoTryOn(
  uid: string,
  opts?: { email?: string | null }
): Promise<{
  consumed: boolean;
  used: number;
  monthKey: string;
  credits?: number;
  from?: "monthly" | "credit";
}> {
  const monthKey = currentPhotoTryOnMonthKey();
  const db = getAdminDb();
  if (!db) return { consumed: false, used: 0, monthKey };

  if (isCompedAccount({ uid, email: opts?.email })) {
    return { consumed: false, used: 0, monthKey };
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const profile = (snap.data() || {}) as Partial<UserProfile>;
  if (!isEntitled(profile, { uid, email: opts?.email })) {
    return { consumed: false, used: 0, monthKey };
  }

  const used = photoTryOnsUsedThisMonth(profile);
  if (used < PAID_PHOTO_TRYONS_PER_MONTH) {
    const next = used + 1;
    await ref.set(
      {
        photoTryOnsMonthKey: monthKey,
        photoTryOnsThisMonth: next,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return {
      consumed: true,
      used: next,
      monthKey,
      credits: photoTryOnCredits(profile),
      from: "monthly",
    };
  }

  const credits = photoTryOnCredits(profile);
  if (credits < 1) {
    return { consumed: false, used, monthKey, credits: 0 };
  }

  const nextCredits = credits - 1;
  await ref.set(
    {
      photoTryOnCredits: nextCredits,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return {
    consumed: true,
    used,
    monthKey,
    credits: nextCredits,
    from: "credit",
  };
}
