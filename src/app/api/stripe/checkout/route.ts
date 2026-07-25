import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { planId, email, name } = await req.json();
  const stripe = getStripe();
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!stripe) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message:
        "STRIPE_SECRET_KEY missing — local trial activated. Add your Stripe secret in .env.local.",
    });
  }

  const priceId =
    planId === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

  // If placeholder price IDs, return demo activation
  if (!priceId.startsWith("price_")) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message: "Create Stripe Prices and set STRIPE_PRICE_ID_MONTHLY / YEARLY.",
    });
  }

  // Detect unresolved placeholder names
  if (
    priceId.includes("voicedress") ||
    priceId.includes("vestoir") ||
    priceId.includes("aether")
  ) {
    return NextResponse.json({
      ok: true,
      demo: true,
      message:
        "Stripe is keyed. Create products in Stripe Dashboard, then set STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_YEARLY.",
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    metadata: { planId, name: name || "" },
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: 7,
      metadata: { planId },
    },
  });

  return NextResponse.json({ url: session.url });
}
