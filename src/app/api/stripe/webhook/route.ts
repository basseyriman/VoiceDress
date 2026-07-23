import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    return NextResponse.json({ received: true, demo: true });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const body = await req.text();
  try {
    const event = stripe.webhooks.constructEvent(body, sig, secret);
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.updated"
    ) {
      // Persist subscription status to Firestore in production
      console.log("Stripe event", event.type);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "webhook error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
