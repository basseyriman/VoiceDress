import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  INGEST_VISION_MODEL,
  getOpenAI,
  hasAIKey,
} from "@/lib/ai";
import {
  categorizeFromTitle,
  colorNameToHex,
  sanitizeGarmentCategory,
} from "@/lib/commerce";
import type { CommerceSource, Formality, Garment } from "@/lib/types";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

const garmentExtractSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      brand: z.string(),
      category: z.enum([
        "top",
        "bottom",
        "outerwear",
        "shoes",
        "accessory",
        "dress",
        "bag",
      ]),
      colors: z.array(z.string()),
      fabric: z.string().nullable(),
      formality: z.enum([
        "casual",
        "smart_casual",
        "business",
        "formal",
        "black_tie",
      ]),
      tags: z.array(z.string()),
      price: z.number().nullable(),
      currency: z.string().nullable(),
      orderId: z.string().nullable(),
      detectedStore: z.string().nullable(),
    })
  ),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const imageDataUrl = String(body.imageDataUrl || "");
  const userId = auth.uid;
  const preferredSource = (body.source || "receipt") as CommerceSource;

  if (!imageDataUrl.startsWith("data:image")) {
    return NextResponse.json(
      { error: "imageDataUrl (data URL) required" },
      { status: 400 }
    );
  }

  if (!hasAIKey()) {
    return NextResponse.json(
      {
        error:
          "Add OPENAI_API_KEY (or AI_GATEWAY_API_KEY) to .env.local to extract garments from photos.",
      },
      { status: 503 }
    );
  }

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  try {
    const { output } = await generateTextWithRateLimit(openai, imageDataUrl);

    if (!output?.items?.length) {
      return NextResponse.json(
        { error: "Couldn’t find clothing items in that image. Try a clearer photo." },
        { status: 422 }
      );
    }

    // Drop incidental handbags held in apparel product shots
    const rawItems = dropIncidentalBags(output.items);
    if (!rawItems.length) {
      return NextResponse.json(
        { error: "Couldn’t find clothing items in that image. Try a clearer photo." },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const garments: Garment[] = rawItems.map((item, i) => {
      const storeHint = (item.detectedStore || preferredSource).toLowerCase();
      const source = normalizeSource(storeHint, preferredSource);
      const colors = item.colors.length ? item.colors : ["neutral"];
      return sanitizeGarmentCategory({
        id: `ingest_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        name: item.name,
        brand: item.brand || "Unknown",
        category: item.category || categorizeFromTitle(item.name),
        colors,
        hexColors: colors.map(colorNameToHex),
        fabric: item.fabric || undefined,
        formality: item.formality as Formality,
        season: ["all"],
        imageUrl: imageDataUrl,
        source,
        price: item.price ?? undefined,
        currency: item.currency || "GBP",
        orderId: item.orderId || undefined,
        tags: item.tags?.length ? item.tags : ["ingested"],
        purchaseDate: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({
      ok: true,
      imported: garments.length,
      items: garments,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to extract garments from image";
    const rateLimited = /rate limit|tokens per min|TPM|429/i.test(message);
    const retryMatch = /try again in (\d+(?:\.\d+)?)(ms|s)/i.exec(message);
    let retryAfterMs = 1500;
    if (retryMatch) {
      const n = Number(retryMatch[1]);
      retryAfterMs =
        retryMatch[2].toLowerCase() === "s"
          ? Math.ceil(n * 1000)
          : Math.ceil(n);
    }
    return NextResponse.json(
      {
        error: rateLimited
          ? "AI is briefly busy extracting photos. We’ll retry automatically — or wait a moment and continue."
          : message,
        ...(rateLimited ? { retryAfterMs, code: "rate_limited" } : {}),
      },
      { status: rateLimited ? 429 : 500 }
    );
  }
}

async function generateTextWithRateLimit(
  openai: NonNullable<ReturnType<typeof getOpenAI>>,
  imageDataUrl: string
) {
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await generateText({
        model: openai(INGEST_VISION_MODEL),
        output: Output.object({ schema: garmentExtractSchema }),
        maxRetries: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract clothing / footwear / accessory items from this receipt, order screenshot, or product photo for a wardrobe app.
Return every distinct wearable item the shopper is actually buying. Prefer accurate names and brands.
Category rules: socks, stockings, tights, no-show socks → accessory (NOT shoes). shoes/boots/loafers/sneakers/heels/pumps/flats/sandals/wedges → shoes. dresses/jumpsuits/rompers → dress. skirts → bottom. blouses/tops → top. handbags/totes/clutches → bag ONLY when the bag is the product being sold.
CRITICAL — bags / handbags:
- Do NOT add a bag just because a model is holding or wearing one in a dress/top/outfit photo.
- Props, styling accessories, and background bags are NOT wardrobe items.
- Only return category "bag" when the image/receipt is clearly selling a bag as its own product (bag is the main subject, or a receipt line is a bag).
- If the main product is a dress, top, bottom, or outerwear, return that garment only — omit any held handbag.
If it's a product photo of one garment, return one item.
detectedStore should be amazon|asos|zara|ebay|shein|temu|shopify|receipt when recognizable.`,
              },
              { type: "image", image: imageDataUrl },
            ],
          },
        ],
      });
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/rate limit|tokens per min|TPM|429/i.test(message)) throw err;
      const retryMatch = /try again in (\d+(?:\.\d+)?)(ms|s)/i.exec(message);
      let waitMs = 800 * (attempt + 1);
      if (retryMatch) {
        const n = Number(retryMatch[1]);
        waitMs =
          retryMatch[2].toLowerCase() === "s"
            ? Math.ceil(n * 1000) + 200
            : Math.ceil(n) + 200;
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Rate limit — try again shortly");
}

type ExtractedItem = {
  name: string;
  brand: string;
  category:
    | "top"
    | "bottom"
    | "outerwear"
    | "shoes"
    | "accessory"
    | "dress"
    | "bag";
  colors: string[];
  fabric: string | null;
  formality:
    | "casual"
    | "smart_casual"
    | "business"
    | "formal"
    | "black_tie";
  tags: string[];
  price: number | null;
  currency: string | null;
  orderId: string | null;
  detectedStore: string | null;
};

/** Bags held in dress/top photos are props — keep bags only when they're the product. */
function dropIncidentalBags(items: ExtractedItem[]): ExtractedItem[] {
  const apparel = items.filter((i) =>
    ["dress", "top", "bottom", "outerwear"].includes(i.category)
  );
  if (!apparel.length) return items;
  return items.filter((i) => i.category !== "bag");
}

function normalizeSource(
  hint: string,
  fallback: CommerceSource
): CommerceSource {
  const allowed: CommerceSource[] = [
    "amazon",
    "ebay",
    "temu",
    "shein",
    "asos",
    "zara",
    "shopify",
    "receipt",
    "manual",
  ];
  if (allowed.includes(hint as CommerceSource)) return hint as CommerceSource;
  return fallback;
}
