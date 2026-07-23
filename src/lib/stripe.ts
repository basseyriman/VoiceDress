import Stripe from "stripe";

export const STRIPE_PRICE_MONTHLY =
  process.env.STRIPE_PRICE_ID_MONTHLY || "price_aether_monthly";
export const STRIPE_PRICE_YEARLY =
  process.env.STRIPE_PRICE_ID_YEARLY || "price_aether_yearly";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export const PLANS = [
  {
    id: "monthly",
    name: "Aether Monthly",
    price: 19,
    interval: "month" as const,
    description: "Unlimited voice styling, avatar try-on, and commerce sync.",
    features: [
      "Voice-first outfit engine",
      "Live weather & calendar context",
      "Commerce auto-ingest",
      "Lookalike avatar try-on",
      "Unlimited wardrobe items",
    ],
  },
  {
    id: "yearly",
    name: "Aether Annual",
    price: 149,
    interval: "year" as const,
    description: "Best value for founders who dress with intention.",
    features: [
      "Everything in Monthly",
      "Priority avatar generation",
      "Early retailer connectors",
      "2 months free",
    ],
  },
];
