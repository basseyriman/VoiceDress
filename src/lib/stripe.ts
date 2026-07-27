import Stripe from "stripe";

export const STRIPE_PRICE_MONTHLY =
  process.env.STRIPE_PRICE_ID_MONTHLY || "price_voicedress_monthly";
export const STRIPE_PRICE_YEARLY =
  process.env.STRIPE_PRICE_ID_YEARLY || "price_voicedress_yearly";

/** Create these in Stripe Dashboard as GBP recurring prices: £19/mo and £149/yr. */
export const LIST_PRICE_MONTHLY_GBP = 19;
export const LIST_PRICE_YEARLY_GBP = 149;
export const TRIAL_DAYS = 7;

/** One-time look top-ups (GBP). Optional Stripe Price IDs override price_data. */
export const LOOK_TOPUP_PACKS = [
  {
    id: "looks_10",
    looks: 10,
    priceGbp: 5,
    label: "10 extra looks",
    description: "Top up when you’ve used this month’s 30.",
    priceEnv: "STRIPE_PRICE_ID_LOOKS_10",
  },
  {
    id: "looks_25",
    looks: 25,
    priceGbp: 10,
    label: "25 extra looks",
    description: "Best value top-up — banked until you use them.",
    priceEnv: "STRIPE_PRICE_ID_LOOKS_25",
    badge: "Popular" as string | null,
  },
] as const;

export type LookTopupPackId = (typeof LOOK_TOPUP_PACKS)[number]["id"];

export function lookTopupPack(id: string) {
  return LOOK_TOPUP_PACKS.find((p) => p.id === id) || null;
}

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
    description:
      "30 full on-photo looks each month — plus unlimited voice styling & piece swaps.",
    badge: null as string | null,
    features: [
      "7-day free trial",
      "Speak the occasion → best look from your wardrobe",
      "30 full on-photo looks / month",
      "Unlimited voice styling & piece swaps",
      "Weather-aware suggestions",
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
      "Everything in Monthly (30 looks / month)",
      "Priority try-on when queues are busy",
      "Early access to new dressing features",
    ],
  },
];
