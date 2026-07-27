import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  CUSTOM_LOOK_TOPUP_ID,
  lookTopupPack,
  quoteLookTopup,
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

  let customerId: string | undefined;
  if (isAdminConfigured()) {
    const db = getAdminDb();
    const snap = await db!.collection("users").doc(auth.uid).get();
    customerId = snap.data()?.stripeCustomerId as string | undefined;
  }

  const customerOpts = customerId
    ? { customer: customerId }
    : auth.email
      ? { customer_email: auth.email }
      : {};

  // —— One-time look top-up (fixed pack or custom quantity) ——
  const pack = lookTopupPack(planId);
  const isCustomTopup = planId === CUSTOM_LOOK_TOPUP_ID;
  if (pack || isCustomTopup) {
    const looksRequested = isCustomTopup ? Number(body.looks) : pack!.looks;
    const quote = quoteLookTopup(looksRequested);
    if (!quote) {
      return NextResponse.json(
        {
          error:
            "Choose between 5 and 100 on-photo looks for a custom top-up.",
        },
        { status: 400 }
      );
    }

    try {
      const envPrice =
        pack && quote.packId === pack.id
          ? process.env[pack.priceEnv]?.trim() || ""
          : "";
      const usePriceId =
        Boolean(pack) &&
        quote.packId === pack!.id &&
        envPrice.startsWith("price_") &&
        !/voicedress|vestoir|aether/i.test(envPrice);

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...customerOpts,
        client_reference_id: auth.uid,
        line_items: [
          usePriceId
            ? { price: envPrice, quantity: 1 }
            : {
                price_data: {
                  currency: "gbp",
                  unit_amount: quote.pence,
                  product_data: {
                    name: `VoiceDress — ${quote.looks} extra looks`,
                    description: `${quote.looks} on-photo looks (banked until used)`,
                  },
                },
                quantity: 1,
              },
        ],
        success_url: `${origin}/billing?topup=1`,
        cancel_url: `${origin}/billing?canceled=1`,
        metadata: {
          type: "look_topup",
          packId: quote.packId,
          looks: String(quote.looks),
          expectedPence: String(quote.pence),
          firebaseUid: auth.uid,
          name: String(body.name || ""),
        },
        allow_promotion_codes: true,
      });

      return NextResponse.json({
        url: session.url,
        packId: quote.packId,
        looks: quote.looks,
        priceGbp: quote.priceGbp,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      console.error("Stripe top-up checkout error", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // —— Subscription plans ——
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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...customerOpts,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    console.error("Stripe checkout error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
