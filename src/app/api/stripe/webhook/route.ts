import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  quoteLookTopup,
} from "@/lib/stripe";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function uidFromSession(session: Stripe.Checkout.Session): string | null {
  return (
    session.client_reference_id ||
    session.metadata?.firebaseUid ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !secret) {
      return NextResponse.json({ received: true, demo: true });
    }

    if (!isAdminConfigured()) {
      console.error("Stripe webhook: Firebase Admin not configured");
      return NextResponse.json(
        { error: "Firebase Admin required for webhooks" },
        { status: 503 }
      );
    }

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "missing signature" }, { status: 400 });
    }

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "webhook error";
      console.error("Stripe webhook signature failed", message);
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const uid = uidFromSession(session);
          if (!uid) {
            console.warn("checkout.session.completed missing firebase uid");
            break;
          }
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;

          // One-time look top-up
          const isLookTopup =
            session.mode === "payment" &&
            (session.metadata?.type === "look_topup" ||
              Boolean(session.metadata?.looks));
          if (isLookTopup) {
            const add = Math.max(
              0,
              Math.floor(Number(session.metadata?.looks || 0))
            );
            const quote = add > 0 ? quoteLookTopup(add) : null;
            const expectedPence = Number(
              session.metadata?.expectedPence || quote?.pence || 0
            );
            const paid = session.amount_total;
            if (
              quote &&
              typeof paid === "number" &&
              expectedPence > 0 &&
              paid + 1 < expectedPence
            ) {
              console.error(
                `look_topup amount mismatch uid=${uid} looks=${add} paid=${paid} expected=${expectedPence}`
              );
              break;
            }
            if (add > 0) {
              const db = getAdminDb()!;
              const ref = db.collection("users").doc(uid);
              await db.runTransaction(async (tx: any) => {
                const snap = await tx.get(ref);
                const prev = Math.max(
                  0,
                  Math.floor(Number(snap.data()?.photoTryOnCredits || 0))
                );
                tx.set(
                  ref,
                  {
                    photoTryOnCredits: prev + add,
                    ...(customerId ? { stripeCustomerId: customerId } : {}),
                    updatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                );
              });
            }
            break;
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("Stripe webhook handler failed", err);
      return NextResponse.json({ error: "handler failed" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook fatal", err);
    return NextResponse.json({ error: "fatal" }, { status: 500 });
  }
}

