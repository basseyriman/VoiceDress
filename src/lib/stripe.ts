import Stripe from "stripe";

export const STRIPE_PRICE_MONTHLY =
  process.env.STRIPE_PRICE_ID_MONTHLY || "price_voicedress_monthly";
export const STRIPE_PRICE_YEARLY =
  process.env.STRIPE_PRICE_ID_YEARLY || "price_voicedress_yearly";

/** Create these in Stripe Dashboard as GBP recurring prices: £19/mo and £149/yr. */
export const LIST_PRICE_MONTHLY_GBP = 19;
export const LIST_PRICE_YEARLY_GBP = 149;
export const TRIAL_DAYS = 7;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export const PLANS = [
  {
    id: "monthly",
    name: "Monthly",
    price: LIST_PRICE_MONTHLY_GBP,
    interval: "month" as const,
    description: "Unlimited voice dressing — one look, dressed on your photo.",
    badge: null as string | null,
    features: [
      "7-day free trial",
      "Speak the occasion → best look from your wardrobe",
      "Full-look try-on on your photo",
      "Weather-aware suggestions",
      "Swap any piece by voice or tap",
      "Shopify sync + add from order photo",
    ],
  },
  {
    id: "yearly",
    name: "Annual",
    price: LIST_PRICE_YEARLY_GBP,
    interval: "year" as const,
    description: "Best value — about two months free vs monthly.",
    badge: "Save £79",
    features: [
      "7-day free trial",
      "Everything in Monthly",
      "Priority try-on when queues are busy",
      "Early access to new dressing features",
    ],
  },
];
