import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
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
  const planId = String(body.planId || "looks_10");
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
        "STRIPE_SECRET_KEY missing. Add Stripe keys for live checkout.",
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
    : { customer_email: auth.email };

  // Only Top-ups
  const pack = lookTopupPack(planId);
  const customLooks =
    planId === CUSTOM_LOOK_TOPUP_ID ? Number(body.looks) : undefined;
  const quote =
    customLooks !== undefined
      ? quoteLookTopup(customLooks)
      : pack
        ? quoteLookTopup(pack.looks)
        : null;

  if (quote) {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...customerOpts,
        client_reference_id: auth.uid,
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: pack
                  ? pack.label
                  : `${quote.looks} VoiceDress Try-ons`,
                description: pack?.description,
              },
              unit_amount: quote.pence,
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/billing?topup=1`,
        cancel_url: `${origin}/billing?canceled=1`,
        metadata: {
          type: "look_topup",
          looks: quote.looks.toString(),
          packId: quote.packId,
          expectedPence: quote.pence.toString(),
          firebaseUid: auth.uid,
        },
      });
      return NextResponse.json({ url: session.url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Checkout failed";
      console.error("Stripe top-up checkout error", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
}