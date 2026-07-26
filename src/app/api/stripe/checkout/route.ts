import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
} from "@/lib/stripe";
import { requireAuth, isAuthedUser } from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const planId = String(body.planId || "monthly");
  const stripe = getStripe();
  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  if (!stripe) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message:
        "STRIPE_SECRET_KEY missing — local trial stays active. Add Stripe keys for live checkout.",
    });
  }

  const priceId =
    planId === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

  if (!priceId.startsWith("price_") || /voicedress|vestoir|aether/i.test(priceId)) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message:
        "Create Stripe Prices and set STRIPE_PRICE_ID_MONTHLY / YEARLY in the environment.",
    });
  }

  let customerId: string | undefined;
  if (isAdminConfigured()) {
    const db = getAdminDb();
    const snap = await db!.collection("users").doc(auth.uid).get();
    customerId = snap.data()?.stripeCustomerId as string | undefined;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(customerId
      ? { customer: customerId }
      : auth.email
        ? { customer_email: auth.email }
        : {}),
    client_reference_id: auth.uid,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    metadata: {
      planId,
      firebaseUid: auth.uid,
      name: String(body.name || ""),
    },
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 7,
      metadata: {
        planId,
        firebaseUid: auth.uid,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
