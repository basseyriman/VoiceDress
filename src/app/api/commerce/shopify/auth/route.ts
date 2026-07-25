import { NextRequest, NextResponse } from "next/server";

/** Start Shopify OAuth — requires SHOPIFY_API_KEY + shop domain. */
export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop")?.trim().toLowerCase();
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const scopes =
    process.env.SHOPIFY_SCOPES?.trim() || "read_orders,read_products";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    req.nextUrl.origin ||
    "http://localhost:3000";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to .env.local. Create a custom app in Shopify Partners.",
      },
      { status: 503 }
    );
  }

  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json(
      {
        error:
          "Pass ?shop=your-store.myshopify.com (must be a *.myshopify.com domain).",
      },
      { status: 400 }
    );
  }

  const redirectUri = `${origin}/api/commerce/shopify/callback`;
  const state = Buffer.from(
    JSON.stringify({ shop, ts: Date.now() }),
    "utf8"
  ).toString("base64url");

  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
