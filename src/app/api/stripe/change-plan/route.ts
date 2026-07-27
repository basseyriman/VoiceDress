import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  planIdFromStripePrice,
  LIST_PRICE_YEARLY_GBP,
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

async function findLiveSubscription(
  stripe: Stripe,
  customerId: string | undefined,
  subscriptionId: string | undefined
): Promise<Stripe.Subscription | null> {
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (
        sub.status === "active" ||
        sub.status === "trialing" ||
        sub.status === "past_due"
      ) {
        return sub;
      }
    } catch (err) {
      console.warn("change-plan: stored subscriptionId retrieve failed", err);
    }
  }

  if (!customerId) return null;

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  return (
    list.data.find(
      (s) =>
        s.status === "active" ||
        s.status === "trialing" ||
        s.status === "past_due"
    ) || null
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
  const storedSubId = data.stripeSubscriptionId as string | undefined;
  let customerId = data.stripeCustomerId as string | undefined;

  try {
    // Recover customer from email if Firestore never stored stripeCustomerId
    if (!customerId && auth.email) {
      const customers = await stripe.customers.list({
        email: auth.email,
        limit: 5,
      });
      customerId = customers.data[0]?.id;
      if (customerId) {
        await ref.set(
          {
            stripeCustomerId: customerId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    }

    const sub = await findLiveSubscription(stripe, customerId, storedSubId);

    if (!sub) {
      return NextResponse.json(
        {
          error: customerId
            ? "We found your Stripe customer but no live subscription. Finish checkout for Monthly or Annual first, then switch here."
            : "No Stripe subscription on this account yet. Start a plan from Membership, then you can switch to annual.",
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
          ...(typeof sub.customer === "string"
            ? { stripeCustomerId: sub.customer }
            : {}),
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
      // During trial, just change what they’ll pay after — avoid odd prorations.
      proration_behavior:
        sub.status === "trialing" ? "none" : "create_prorations",
      metadata: {
        ...sub.metadata,
        planId: target,
        firebaseUid: auth.uid,
      },
    });

    const planId = planFromSubscription(updated) || target;

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
