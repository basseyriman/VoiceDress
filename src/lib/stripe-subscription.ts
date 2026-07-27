import type Stripe from "stripe";
import {
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  planIdFromStripePrice,
} from "@/lib/stripe";

const USABLE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "paused",
]);

export function planFromSubscription(sub: Stripe.Subscription) {
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

function pickUsable(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  return (
    subs.find((s) => USABLE_STATUSES.has(s.status)) ||
    subs.find((s) => s.status !== "canceled" && s.status !== "incomplete_expired") ||
    null
  );
}

async function subscriptionFromInvoices(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.Subscription | null> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 15,
  });
  for (const inv of invoices.data) {
    const raw = inv as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    };
    const sid =
      typeof raw.subscription === "string"
        ? raw.subscription
        : raw.subscription?.id ||
          (typeof inv.parent?.subscription_details?.subscription === "string"
            ? inv.parent.subscription_details.subscription
            : inv.parent?.subscription_details?.subscription &&
                typeof inv.parent.subscription_details.subscription === "object"
              ? inv.parent.subscription_details.subscription.id
              : undefined);
    if (!sid) continue;
    try {
      const sub = await stripe.subscriptions.retrieve(sid);
      if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
        return sub;
      }
    } catch {
      // try next invoice
    }
  }
  return null;
}

async function subscriptionsForCustomer(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.Subscription | null> {
  // Default list (excludes canceled) — includes trialing/active
  const primary = await stripe.subscriptions.list({
    customer: customerId,
    limit: 20,
  });
  const fromPrimary = pickUsable(primary.data);
  if (fromPrimary) return fromPrimary;

  // Explicit statuses in case default filtering is odd for this account
  for (const status of ["trialing", "active", "past_due", "incomplete"] as const) {
    const listed = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 10,
    });
    const hit = pickUsable(listed.data);
    if (hit) return hit;
  }

  // Portal showed trial invoices — recover subscription id from invoices
  return subscriptionFromInvoices(stripe, customerId);
}

/**
 * Find the member's live Stripe subscription across stored ids, customer, email, and invoices.
 */
export async function findLiveSubscription(
  stripe: Stripe,
  opts: {
    customerId?: string;
    subscriptionId?: string;
    email?: string;
    firebaseUid?: string;
  }
): Promise<{
  sub: Stripe.Subscription | null;
  customerId?: string;
}> {
  const { subscriptionId, email, firebaseUid } = opts;
  let customerId = opts.customerId;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
        const cid =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        return { sub, customerId: cid || customerId };
      }
    } catch (err) {
      console.warn("findLiveSubscription: stored sub retrieve failed", err);
    }
  }

  if (customerId) {
    const sub = await subscriptionsForCustomer(stripe, customerId);
    if (sub) return { sub, customerId };
  }

  // Wrong / empty customer on profile — find any customer for this email with a sub
  if (email) {
    const customers = await stripe.customers.list({ email, limit: 10 });
    for (const customer of customers.data) {
      const sub = await subscriptionsForCustomer(stripe, customer.id);
      if (sub) return { sub, customerId: customer.id };
    }
  }

  // Last resort: metadata search (Stripe Search API)
  if (firebaseUid) {
    try {
      const found = await stripe.subscriptions.search({
        query: `metadata['firebaseUid']:'${firebaseUid}'`,
        limit: 10,
      });
      const sub = pickUsable(found.data);
      if (sub) {
        const cid =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        return { sub, customerId: cid || customerId };
      }
    } catch (err) {
      console.warn("findLiveSubscription: search unavailable", err);
    }
  }

  return { sub: null, customerId };
}
