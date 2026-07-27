import { NextRequest, NextResponse } from "next/server";
import {
  categorizeFromTitle,
  colorNameToHex,
  sanitizeGarmentCategory,
} from "@/lib/commerce";
import type { Garment } from "@/lib/types";

/** OAuth callback — exchange code for token, pull recent orders → garments. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const shop = req.nextUrl.searchParams.get("shop")?.toLowerCase();
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

  if (!code || !shop || !apiKey || !apiSecret) {
    return NextResponse.redirect(
      `${origin}/connect?shopify=error&reason=missing_params`
    );
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      }),
    });
    if (!tokenRes.ok) {
      return NextResponse.redirect(
        `${origin}/connect?shopify=error&reason=token`
      );
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.redirect(
        `${origin}/connect?shopify=error&reason=token`
      );
    }

    const ordersRes = await fetch(
      `https://${shop}/admin/api/2024-10/orders.json?status=any&limit=25`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const garments: Garment[] = [];
    const now = new Date().toISOString();
    const userId = "voicedress_local_user";

    if (ordersRes.ok) {
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
      for (const order of data.orders || []) {
        for (const line of order.line_items || []) {
          const title = line.title || line.name || "Shopify item";
          garments.push(
            sanitizeGarmentCategory({
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
              tags: ["shopify", ...(line.sku ? [line.sku] : [])],
              purchaseDate: order.created_at || now,
              createdAt: now,
              updatedAt: now,
            })
          );
        }
      }
    }

    // Pass items via cookie-sized redirect is impossible — use sessionStorage via a bridge page
    const payload = Buffer.from(
      JSON.stringify({
        shop,
        accessToken: "stored_server_side_in_production",
        items: garments,
      }),
      "utf8"
    ).toString("base64url");

    // Truncate if huge — client will get count at least
    const safe =
      payload.length > 6000
        ? Buffer.from(
            JSON.stringify({
              shop,
              items: garments.slice(0, 8),
              truncated: true,
              total: garments.length,
            }),
            "utf8"
          ).toString("base64url")
        : payload;

    return NextResponse.redirect(
      `${origin}/connect?shopify=connected&payload=${safe}`
    );
  } catch {
    return NextResponse.redirect(
      `${origin}/connect?shopify=error&reason=sync`
    );
  }
}
