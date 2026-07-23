import type { CommerceConnection, CommerceSource, Garment } from "./types";

const STORE_META: Record<
  Exclude<CommerceSource, "manual" | "receipt">,
  { label: string; blurb: string }
> = {
  amazon: {
    label: "Amazon",
    blurb: "Auto-import successful clothing orders with product images and metadata.",
  },
  ebay: {
    label: "eBay",
    blurb: "Sync purchased apparel listings the moment payment clears.",
  },
  temu: {
    label: "Temu",
    blurb: "Capture order thumbnails, titles, colors, and brands automatically.",
  },
  shein: {
    label: "SHEIN",
    blurb: "Pull confirmed fashion purchases into your living wardrobe.",
  },
  asos: {
    label: "ASOS",
    blurb: "Connect order history for precise stock imagery and sizing.",
  },
  zara: {
    label: "Zara",
    blurb: "Import boutique purchases with fabric and color intelligence.",
  },
};

export function listCommerceStores() {
  return Object.entries(STORE_META).map(([source, meta]) => ({
    source: source as CommerceSource,
    ...meta,
  }));
}

/** Simulated commerce purchase ingestion — production wires retailer OAuth + webhooks. */
export function simulatePurchaseIngest(
  userId: string,
  source: CommerceSource
): Garment[] {
  const catalog: Record<string, Omit<Garment, "id" | "userId" | "createdAt" | "updatedAt">[]> = {
    amazon: [
      {
        name: "Merino Quarter-Zip",
        brand: "Amazon Essentials Edit",
        category: "top",
        colors: ["ivory"],
        hexColors: ["#F5F0E6"],
        fabric: "merino wool",
        texture: "fine knit",
        formality: "smart_casual",
        season: ["autumn", "winter", "all"],
        imageUrl:
          "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600&q=80",
        source: "amazon",
        price: 68,
        currency: "GBP",
        orderId: "AMZ-88421",
        tags: ["knit", "layering", "quiet luxury"],
      },
    ],
    ebay: [
      {
        name: "Vintage Leather Loafers",
        brand: "Church's",
        category: "shoes",
        colors: ["cognac"],
        hexColors: ["#8B5A2B"],
        fabric: "leather",
        texture: "polished",
        formality: "business",
        season: ["all"],
        imageUrl:
          "https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=600&q=80",
        source: "ebay",
        price: 210,
        currency: "GBP",
        orderId: "EBY-22901",
        tags: ["old money", "footwear"],
      },
    ],
    temu: [
      {
        name: "Relaxed Linen Shirt",
        brand: "Temu Studio",
        category: "top",
        colors: ["sage"],
        hexColors: ["#9CAF88"],
        fabric: "linen",
        texture: "woven",
        formality: "casual",
        season: ["spring", "summer"],
        imageUrl:
          "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&q=80",
        source: "temu",
        price: 22,
        currency: "GBP",
        orderId: "TMU-1102",
        tags: ["breathable", "summer"],
      },
    ],
    shein: [
      {
        name: "Structured Wide Trousers",
        brand: "SHEIN Premium",
        category: "bottom",
        colors: ["charcoal"],
        hexColors: ["#36454F"],
        fabric: "wool blend",
        texture: "crepe",
        formality: "business",
        season: ["all"],
        imageUrl:
          "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600&q=80",
        source: "shein",
        price: 34,
        currency: "GBP",
        orderId: "SHN-7781",
        tags: ["tailored", "office"],
      },
    ],
    asos: [
      {
        name: "Cashmere Crew",
        brand: "ASOS DESIGN",
        category: "top",
        colors: ["navy"],
        hexColors: ["#1B2A41"],
        fabric: "cashmere",
        texture: "soft knit",
        formality: "smart_casual",
        season: ["autumn", "winter"],
        imageUrl:
          "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&q=80",
        source: "asos",
        price: 55,
        currency: "GBP",
        orderId: "ASO-4410",
        tags: ["knitwear"],
      },
    ],
    zara: [
      {
        name: "Double-Breasted Blazer",
        brand: "Zara",
        category: "outerwear",
        colors: ["black"],
        hexColors: ["#0B0B0C"],
        fabric: "wool",
        texture: "structured",
        formality: "formal",
        season: ["all"],
        imageUrl:
          "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600&q=80",
        source: "zara",
        price: 129,
        currency: "GBP",
        orderId: "ZAR-9921",
        tags: ["tailoring", "old money"],
      },
    ],
  };

  const now = new Date().toISOString();
  const items = catalog[source] || [];
  return items.map((item, i) => ({
    ...item,
    id: `${source}_${Date.now()}_${i}`,
    userId,
    purchaseDate: now,
    createdAt: now,
    updatedAt: now,
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
