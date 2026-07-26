import { NextRequest, NextResponse } from "next/server";
import {
  isAuthedUser,
  isEntitled,
  requireAuth,
} from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";
import type { UserProfile } from "@/lib/types";

/**
 * Start or confirm a 7-day trial when Stripe checkout isn't live yet.
 * Never upgrades past trial — paid status comes from the Stripe webhook only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  if (!isAdminConfigured() || !getAdminDb()) {
    if (process.env.ALLOW_INSECURE_API === "true") {
      const trialEndsAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      return NextResponse.json({
        ok: true,
        demo: true,
        subscriptionStatus: "trialing",
        trialEndsAt,
      });
    }
    return NextResponse.json(
      {
        error: "Firebase Admin required to start trial.",
        code: "admin_not_configured",
      },
      { status: 503 }
    );
  }

  const db = getAdminDb()!;
  const ref = db.collection("users").doc(auth.uid);
  const snap = await ref.get();
  const data = (snap.data() || {}) as Partial<UserProfile>;

  if (isEntitled(data, auth)) {
    return NextResponse.json({
      ok: true,
      subscriptionStatus: data.subscriptionStatus || "trialing",
      trialEndsAt: data.trialEndsAt || null,
    });
  }

  const status = data.subscriptionStatus || "none";
  // Expired trial or canceled — require Stripe checkout for paid market
  if (status !== "none") {
    return NextResponse.json(
      {
        error: "Open Billing to continue with Stripe checkout.",
        code: "checkout_required",
        subscriptionStatus: status,
      },
      { status: 402 }
    );
  }

  const trialEndsAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  await ref.set(
    {
      subscriptionStatus: "trialing",
      trialEndsAt,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    subscriptionStatus: "trialing",
    trialEndsAt,
  });
}
