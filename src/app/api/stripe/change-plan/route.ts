import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  LIST_PRICE_YEARLY_GBP,
} from "@/lib/stripe";
import {
  findLiveSubscription,
  planFromSubscription,
} from "@/lib/stripe-subscription";
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
      { error: "planId must be monthly or yearly.", code: "bad_plan" },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe isn’t configured yet.", code: "no_stripe" },
      { status: 503 }
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      {
        error: "Server auth isn’t ready — Firebase Admin required.",
        code: "no_admin",
      },
      { status: 503 }
    );
  }

  const targetPrice =
    target === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
  if (!isLivePriceId(targetPrice)) {
    return NextResponse.json(
      {
        error:
          "Annual price isn’t linked yet. Set STRIPE_PRICE_ID_YEARLY in Vercel to your Stripe yearly Price ID.",
        code: "missing_price",
      },
      { status: 503 }
    );
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
      return NextResponse.json(
        {
          error:
            "Couldn’t find your membership subscription in Stripe. Open Billing details, confirm the Monthly trial is there, then try again — or contact support.",
          code: "no_subscription",
        },
        { status: 400 }
      );
    }

    const item = sub.items.data[0];
    if (!item?.id) {
      return NextResponse.json(
        {
          error: "Subscription has no price item to update.",
          code: "no_item",
        },
        { status: 400 }
      );
    }

    const currentPlan = planFromSubscription(sub);
    if (item.price.id === targetPrice || currentPlan === target) {
      await ref.set(
        {
          subscriptionPlan: target,
          stripeSubscriptionId: sub.id,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return NextResponse.json({
        ok: true,
        planId: target,
        message:
          target === "yearly"
            ? "You’re already on annual."
            : "You’re already on monthly.",
      });
    }

    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: targetPrice }],
      proration_behavior:
        sub.status === "trialing" ? "none" : "create_prorations",
      metadata: {
        ...sub.metadata,
        planId: target,
        firebaseUid: auth.uid,
      },
    });

    const planId = planFromSubscription(updated) || target;
    const updatedCustomer =
      typeof updated.customer === "string"
        ? updated.customer
        : updated.customer?.id || customerId;

    await ref.set(
      {
        subscriptionPlan: planId,
        stripeSubscriptionId: updated.id,
        ...(updatedCustomer ? { stripeCustomerId: updatedCustomer } : {}),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      planId,
      status: updated.status,
      message:
        planId === "yearly"
          ? `You’re on annual — £${LIST_PRICE_YEARLY_GBP}/year.`
          : "You’re on monthly.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plan change failed";
    console.error("Stripe change-plan error", message);
    return NextResponse.json(
      { error: message, code: "stripe_error" },
      { status: 500 }
    );
  }
}
