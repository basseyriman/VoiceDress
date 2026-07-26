import { NextRequest, NextResponse } from "next/server";
import {
  isAuthedUser,
  isCompedAccount,
  requireAuth,
} from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

/**
 * Founder/comp accounts: mark Firestore as active so the Billing UI matches
 * server entitlement bypass (ENTITLEMENT_BYPASS_UIDS / EMAILS).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  if (!isCompedAccount(auth)) {
    return NextResponse.json(
      { error: "Not a comped account.", code: "forbidden" },
      { status: 403 }
    );
  }

  if (!isAdminConfigured() || !getAdminDb()) {
    return NextResponse.json({
      ok: true,
      comped: true,
      message: "Comped for API access; Admin DB not available to sync UI status.",
    });
  }

  const trialEndsAt = new Date(
    Date.now() + 100 * 365 * 24 * 60 * 60 * 1000
  ).toISOString();

  await getAdminDb()!
    .collection("users")
    .doc(auth.uid)
    .set(
      {
        subscriptionStatus: "active",
        trialEndsAt,
        comped: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  return NextResponse.json({
    ok: true,
    comped: true,
    subscriptionStatus: "active",
    trialEndsAt,
  });
}
