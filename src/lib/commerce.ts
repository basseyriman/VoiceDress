import type { CommerceConnection, CommerceSource, Garment } from "./types";

export {
  assertGarmentCategoryGuards,
  categorizeFromTitle,
  ensureLookHasFootwear,
  inferCategoryFromText,
  isHosieryOrSocks,
  isRealFootwear,
  isUnderwearOrLounge,
  isApparelMislabeledAsShoes,
  normalizeGarmentCategory,
  sanitizeGarmentCategory,
  sanitizeWardrobe,
} from "./garment-category";

/** Real commerce surfaces — no fake sample SKUs. */
const STORE_META: Record<
  Exclude<CommerceSource, "manual">,
  { label: string; blurb: string; kind: "oauth" | "ingest" }
> = {
  shopify: {
    label: "Shopify",
    blurb:
      "Connect your Shopify store — new orders sync into your wardrobe automatically.",
    kind: "oauth",
  },
  receipt: {
    label: "Order / receipt photo",
    blurb:
      "Upload a receipt, order screenshot, or product photo — AI adds the piece to your wardrobe.",
    kind: "ingest",
  },
  amazon: {
    label: "Amazon",
    blurb: "Upload your Amazon order screenshot or product photo to add pieces.",
    kind: "ingest",
  },
  asos: {
    label: "ASOS",
    blurb: "Upload an ASOS order confirmation or product shot.",
    kind: "ingest",
  },
  zara: {
    label: "Zara",
    blurb: "Upload a Zara order or product photo.",
    kind: "ingest",
  },
  ebay: {
    label: "eBay",
    blurb: "Upload an eBay purchase screenshot or listing photo.",
    kind: "ingest",
  },
  shein: {
    label: "SHEIN",
    blurb: "Upload a SHEIN order or product photo.",
    kind: "ingest",
  },
  temu: {
    label: "Temu",
    blurb: "Upload a Temu order or product photo.",
    kind: "ingest",
  },
};

export function listCommerceStores() {
  return Object.entries(STORE_META).map(([source, meta]) => ({
    source: source as CommerceSource,
    ...meta,
  }));
}

export function defaultConnections(): CommerceConnection[] {
  return listCommerceStores().map((s) => ({
    source: s.source,
    connected: false,
    itemCount: 0,
    status: "idle",
  }));
}

export function colorNameToHex(color: string): string {
  const map: Record<string, string> = {
    black: "#0B0B0C",
    white: "#F5F5F5",
    ivory: "#F5F0E6",
    cream: "#F5F0E6",
    navy: "#1B2A41",
    charcoal: "#36454F",
    grey: "#6B7280",
    gray: "#6B7280",
    beige: "#D4C4A8",
    brown: "#5C4033",
    cognac: "#8B5A2B",
    green: "#2C3E2D",
    blue: "#1E3A5F",
    red: "#7C3A4A",
    pink: "#D4A5A5",
  };
  const key = color.toLowerCase().trim();
  return map[key] || "#8A8580";
}

export type { Garment };
