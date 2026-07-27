import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireAuth, isAuthedUser } from "@/lib/api-auth";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

/**
 * Stripe Customer Portal — update card, cancel, or switch plan
 * (plan switching must be enabled in Stripe Dashboard → Settings → Billing → Portal).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error:
          "Stripe isn’t configured yet. Add STRIPE_SECRET_KEY to open billing management.",
      },
      { status: 503 }
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Server auth isn’t ready — Firebase Admin required." },
      { status: 503 }
    );
  }

  const db = getAdminDb()!;
  const snap = await db.collection("users").doc(auth.uid).get();
  const customerId = snap.data()?.stripeCustomerId as string | undefined;

  if (!customerId) {
    return NextResponse.json(
      {
        error:
          "No Stripe customer on this account yet. Start a plan via checkout first, then manage it here.",
      },
      { status: 400 }
    );
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal failed";
    console.error("Stripe portal error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
