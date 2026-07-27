import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  planIdFromStripePrice,
} from "@/lib/stripe";
import { requireAuth, isAuthedUser } from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function isLivePriceId(priceId: string) {
  return (
    priceId.startsWith("price_") &&
    !/voicedress|vestoir|aether/i.test(priceId)
  );
}

/**
 * Switch an existing VoiceDress subscription between monthly and yearly.
 * Uses Stripe proration — does not open a second checkout or restart trial.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const target = String(body.planId || "") as "monthly" | "yearly";
  if (target !== "monthly" && target !== "yearly") {
    return NextResponse.json(
      { error: "planId must be monthly or yearly." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe isn’t configured yet." },
      { status: 503 }
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Server auth isn’t ready — Firebase Admin required." },
      { status: 503 }
    );
  }

  const targetPrice =
    target === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
  if (!isLivePriceId(targetPrice)) {
    return NextResponse.json(
      {
        error:
          "Set STRIPE_PRICE_ID_MONTHLY / YEARLY to real Stripe Price IDs before changing plans.",
      },
      { status: 503 }
    );
  }

  const db = getAdminDb()!;
  const ref = db.collection("users").doc(auth.uid);
  const snap = await ref.get();
  const data = snap.data() || {};
  let subscriptionId = data.stripeSubscriptionId as string | undefined;
  const customerId = data.stripeCustomerId as string | undefined;

  try {
    if (!subscriptionId && customerId) {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 5,
      });
      const live = list.data.find(
        (s) =>
          s.status === "active" ||
          s.status === "trialing" ||
          s.status === "past_due"
      );
      subscriptionId = live?.id;
    }

    if (!subscriptionId) {
      return NextResponse.json(
        {
          error:
            "No active Stripe subscription found. Start a plan first, then switch here.",
        },
        { status: 400 }
      );
    }

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (
      sub.status !== "active" &&
      sub.status !== "trialing" &&
      sub.status !== "past_due"
    ) {
      return NextResponse.json(
        { error: "Subscription isn’t active — restart from Membership." },
        { status: 400 }
      );
    }

    const item = sub.items.data[0];
    if (!item) {
      return NextResponse.json(
        { error: "Subscription has no price item to update." },
        { status: 400 }
      );
    }

    const currentPlan = planIdFromStripePrice(item.price.id);
    if (currentPlan === target) {
      return NextResponse.json({
        ok: true,
        planId: target,
        message: `You’re already on the ${target} plan.`,
      });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: targetPrice }],
      proration_behavior: "create_prorations",
      metadata: {
        ...sub.metadata,
        planId: target,
        firebaseUid: auth.uid,
      },
    });

    const newPriceId = updated.items.data[0]?.price.id;
    const planId = planIdFromStripePrice(newPriceId) || target;

    await ref.set(
      {
        subscriptionPlan: planId,
        stripeSubscriptionId: updated.id,
        ...(typeof updated.customer === "string"
          ? { stripeCustomerId: updated.customer }
          : {}),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      planId,
      message:
        planId === "yearly"
          ? "Switched to annual. Stripe will prorate the difference on your next invoice."
          : "Switched to monthly. Stripe will prorate the difference on your next invoice.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan change failed";
    console.error("Stripe change-plan error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
