import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  findLiveSubscription,
  planFromSubscription,
} from "@/lib/stripe-subscription";
import { requireAuth, isAuthedUser } from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/** Sync live Stripe plan onto the member profile for Membership UI. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const stripe = getStripe();
  if (!stripe || !isAdminConfigured()) {
    return NextResponse.json({ ok: false, planId: null });
  }

  const db = getAdminDb()!;
  const ref = db.collection("users").doc(auth.uid);
  const snap = await ref.get();
  const data = snap.data() || {};

  try {
    const { sub, customerId } = await findLiveSubscription(stripe, {
      customerId: data.stripeCustomerId as string | undefined,
      subscriptionId: data.stripeSubscriptionId as string | undefined,
      email: auth.email || data.email,
      firebaseUid: auth.uid,
    });

    if (!sub) {
      return NextResponse.json({ ok: true, planId: null, status: null });
    }

    const planId = planFromSubscription(sub);
    const patch: Record<string, unknown> = {
      stripeSubscriptionId: sub.id,
      updatedAt: new Date().toISOString(),
    };
    if (customerId) patch.stripeCustomerId = customerId;
    if (planId) patch.subscriptionPlan = planId;

    await ref.set(patch, { merge: true });

    return NextResponse.json({
      ok: true,
      planId,
      status: sub.status,
      subscriptionId: sub.id,
    });
  } catch (err) {
    console.error("stripe subscription sync failed", err);
    return NextResponse.json({ ok: false, planId: null }, { status: 500 });
  }
}
