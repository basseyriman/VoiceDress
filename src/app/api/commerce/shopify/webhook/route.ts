import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  categorizeFromTitle,
  colorNameToHex,
  sanitizeGarmentCategory,
} from "@/lib/commerce";
import type { Garment } from "@/lib/types";

/**
 * Shopify order webhook → wardrobe garments.
 * Configure in Shopify Admin → Settings → Notifications → Webhooks
 * or via app subscriptions for orders/create + orders/paid.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  if (secret && hmacHeader) {
    const digest = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
    const a = Buffer.from(digest);
    const b = Buffer.from(hmacHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(raw) as ShopifyOrder;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shop = req.headers.get("x-shopify-shop-domain") || "shopify";
  const userId = String(
    req.nextUrl.searchParams.get("userId") || "voicedress_local_user"
  );
  const now = new Date().toISOString();

  const garments: Garment[] = (order.line_items || []).map((line, i) => {
    const title = line.title || line.name || "Shopify item";
    const colors = extractColors(line);
    return sanitizeGarmentCategory({
      id: `shopify_${order.id}_${line.id || i}`,
      userId,
      name: title,
      brand: line.vendor || shop.replace(".myshopify.com", ""),
      category: categorizeFromTitle(title),
      colors,
      hexColors: colors.map(colorNameToHex),
      formality: "smart_casual" as const,
      season: ["all"],
      imageUrl:
        line.image?.src ||
        "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
      source: "shopify" as const,
      price: line.price ? Number(line.price) : undefined,
      currency: order.currency || "GBP",
      orderId: String(order.id || order.order_number || ""),
      tags: ["shopify", ...(line.sku ? [line.sku] : [])],
      purchaseDate: order.created_at || now,
      createdAt: now,
      updatedAt: now,
    });
  });

  return NextResponse.json({
    ok: true,
    shop,
    imported: garments.length,
    items: garments,
    // Client polls / syncs; production would persist to Firebase by userId
  });
}

function extractColors(line: ShopifyLineItem): string[] {
  const props = line.properties || [];
  const colorProp = props.find((p) => /color|colour/i.test(p.name || ""));
  if (colorProp?.value) return [String(colorProp.value)];
  const variant = (line.variant_title || "").toLowerCase();
  if (variant && variant !== "default title") {
    return variant.split(" / ").map((s) => s.trim()).filter(Boolean).slice(0, 2);
  }
  return ["neutral"];
}

type ShopifyLineItem = {
  id?: number;
  title?: string;
  name?: string;
  vendor?: string;
  price?: string;
  sku?: string;
  variant_title?: string;
  properties?: { name?: string; value?: string }[];
  image?: { src?: string };
};

type ShopifyOrder = {
  id?: number;
  order_number?: number;
  currency?: string;
  created_at?: string;
  line_items?: ShopifyLineItem[];
};
