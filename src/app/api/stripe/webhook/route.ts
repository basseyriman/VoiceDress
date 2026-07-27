import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  planIdFromStripePrice,
  quoteLookTopup,
} from "@/lib/stripe";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

async function setUserSubscription(
  uid: string,
  patch: Record<string, unknown>
) {
  const db = getAdminDb();
  if (!db) throw new Error("Firebase Admin not configured");
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        ...patch,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

function uidFromSession(session: Stripe.Checkout.Session): string | null {
  return (
    session.client_reference_id ||
    session.metadata?.firebaseUid ||
    null
  );
}

function mapStripeStatus(
  status: Stripe.Subscription.Status | null | undefined
): "trialing" | "active" | "canceled" | "none" {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired")
    return "canceled";
  if (status === "past_due" || status === "incomplete") return "active"; // grace
  return "none";
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
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;

          // One-time look top-up — bank credits; do not touch subscription status
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
            // Refuse credit if paid amount is below the quoted price (metadata tamper / underpay).
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
              await db.runTransaction(async (tx) => {
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

          if (!subscriptionId && session.mode !== "subscription") {
            break;
          }

          let status: "trialing" | "active" = "active";
          let trialEndsAt: string | undefined;
          let subscriptionPlan =
            session.metadata?.planId === "yearly" ||
            session.metadata?.planId === "monthly"
              ? session.metadata.planId
              : null;
          if (subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            status =
              mapStripeStatus(sub.status) === "trialing" ? "trialing" : "active";
            if (sub.trial_end) {
              trialEndsAt = new Date(sub.trial_end * 1000).toISOString();
            }
            const fromPrice = planIdFromStripePrice(
              sub.items.data[0]?.price.id
            );
            const fromMeta =
              sub.metadata?.planId === "yearly" ||
              sub.metadata?.planId === "monthly"
                ? sub.metadata.planId
                : null;
            subscriptionPlan = fromPrice || fromMeta || subscriptionPlan;
          }

          await setUserSubscription(uid, {
            subscriptionStatus: status,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
            ...(trialEndsAt ? { trialEndsAt } : {}),
            ...(subscriptionPlan ? { subscriptionPlan } : {}),
          });
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
          const uid =
            sub.metadata?.firebaseUid ||
            (customerId ? await findUidByCustomer(customerId) : null);
          if (!uid) {
            console.warn(
              `${event.type} missing firebase uid for customer ${customerId || "unknown"}`
            );
            break;
          }
          const status = mapStripeStatus(
            event.type === "customer.subscription.deleted"
              ? "canceled"
              : sub.status
          );
          const subscriptionPlan =
            planIdFromStripePrice(sub.items.data[0]?.price.id) ||
            (sub.metadata?.planId === "yearly" ||
            sub.metadata?.planId === "monthly"
              ? sub.metadata.planId
              : null);
          await setUserSubscription(uid, {
            subscriptionStatus: status,
            stripeSubscriptionId: sub.id,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            ...(sub.trial_end
              ? { trialEndsAt: new Date(sub.trial_end * 1000).toISOString() }
              : {}),
            ...(subscriptionPlan ? { subscriptionPlan } : {}),
          });
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

async function findUidByCustomer(customerId: string): Promise<string | null> {
  try {
    const db = getAdminDb();
    if (!db) return null;
    const q = await db
      .collection("users")
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();
    if (q.empty) return null;
    return q.docs[0]!.id;
  } catch (err) {
    console.error("findUidByCustomer failed", err);
    return null;
  }
}
