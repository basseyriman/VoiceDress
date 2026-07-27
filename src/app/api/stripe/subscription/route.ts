import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  planIdFromStripePrice,
} from "@/lib/stripe";
import { requireAuth, isAuthedUser } from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function planFromSubscription(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id;
  return (
    planIdFromStripePrice(priceId) ||
    (sub.metadata?.planId === "yearly" || sub.metadata?.planId === "monthly"
      ? sub.metadata.planId
      : null) ||
    (priceId === STRIPE_PRICE_YEARLY
      ? "yearly"
      : priceId === STRIPE_PRICE_MONTHLY
        ? "monthly"
        : null)
  );
}

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
  let subscriptionId = data.stripeSubscriptionId as string | undefined;
  const customerId = data.stripeCustomerId as string | undefined;

  try {
    let sub: Stripe.Subscription | null = null;
    if (subscriptionId) {
      try {
        const retrieved = await stripe.subscriptions.retrieve(subscriptionId);
        if (
          retrieved.status === "active" ||
          retrieved.status === "trialing" ||
          retrieved.status === "past_due"
        ) {
          sub = retrieved;
        }
      } catch {
        subscriptionId = undefined;
      }
    }
    if (!sub && customerId) {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });
      sub =
        list.data.find(
          (s) =>
            s.status === "active" ||
            s.status === "trialing" ||
            s.status === "past_due"
        ) || null;
    }

    if (!sub) {
      return NextResponse.json({ ok: true, planId: null, status: null });
    }

    const planId = planFromSubscription(sub);
    const patch: Record<string, unknown> = {
      stripeSubscriptionId: sub.id,
      updatedAt: new Date().toISOString(),
    };
    if (typeof sub.customer === "string") {
      patch.stripeCustomerId = sub.customer;
    }
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
