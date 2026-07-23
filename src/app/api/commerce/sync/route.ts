import { NextRequest, NextResponse } from "next/server";
import { simulatePurchaseIngest } from "@/lib/commerce";
import type { CommerceSource } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { source, userId = "aether_local_user" } = await req.json();
  if (!source) {
    return NextResponse.json({ error: "source required" }, { status: 400 });
  }

  // Production: OAuth + retailer order webhooks (Amazon, eBay, Temu, SHEIN, ASOS, Zara)
  const items = simulatePurchaseIngest(userId, source as CommerceSource);

  return NextResponse.json({
    ok: true,
    source,
    imported: items.length,
    items,
    message: `Synced successful clothing purchases from ${source}`,
  });
}
