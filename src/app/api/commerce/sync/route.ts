import { NextRequest, NextResponse } from "next/server";
import {
  categorizeFromTitle,
  colorNameToHex,
} from "@/lib/commerce";
import type { Garment } from "@/lib/types";

/**
 * Manual Shopify sync when a shop + access token are available.
 * Production stores the token encrypted per user after OAuth.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const shop = String(body.shop || "").toLowerCase();
  const accessToken = String(body.accessToken || "");
  const userId = String(body.userId || "voicedress_local_user");

  if (!shop.includes("myshopify.com")) {
    return NextResponse.json(
      { error: "shop must be *.myshopify.com" },
      { status: 400 }
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error:
          "No access token. Connect via /api/commerce/shopify/auth?shop=… first.",
      },
      { status: 400 }
    );
  }

  const ordersRes = await fetch(
    `https://${shop}/admin/api/2024-10/orders.json?status=any&limit=50`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    }
  );

  if (!ordersRes.ok) {
    return NextResponse.json(
      { error: "Shopify order fetch failed", status: ordersRes.status },
      { status: 502 }
    );
  }

  const data = (await ordersRes.json()) as {
    orders?: {
      id: number;
      created_at?: string;
      currency?: string;
      line_items?: {
        id: number;
        title?: string;
        name?: string;
        vendor?: string;
        price?: string;
        sku?: string;
      }[];
    }[];
  };

  const now = new Date().toISOString();
  const items: Garment[] = [];
  for (const order of data.orders || []) {
    for (const line of order.line_items || []) {
      const title = line.title || line.name || "Shopify item";
      items.push({
        id: `shopify_${order.id}_${line.id}`,
        userId,
        name: title,
        brand: line.vendor || shop.replace(".myshopify.com", ""),
        category: categorizeFromTitle(title),
        colors: ["neutral"],
        hexColors: [colorNameToHex("neutral")],
        formality: "smart_casual",
        season: ["all"],
        imageUrl:
          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png",
        source: "shopify",
        price: line.price ? Number(line.price) : undefined,
        currency: order.currency || "GBP",
        orderId: String(order.id),
        tags: ["shopify"],
        purchaseDate: order.created_at || now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    source: "shopify",
    imported: items.length,
    items,
  });
}
