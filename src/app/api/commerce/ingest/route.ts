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

const garmentCategoryEnum = z.enum([
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
  "dress",
  "bag",
]);

const extractedItemSchema = z.object({
  name: z.string(),
  brand: z.string(),
  category: garmentCategoryEnum,
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
});

const garmentExtractSchema = z.object({
  /** What the photo is mainly selling (not a prop the model holds). */
  dominantProduct: garmentCategoryEnum,
  items: z.array(extractedItemSchema),
});

const bagGuardSchema = z.object({
  mainProductIsBag: z.boolean(),
  category: garmentCategoryEnum,
  name: z.string(),
  brand: z.string(),
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

    let rawItems = finalizeExtractedItems(output);
    // Model often labels a dress photo as "Handbag" because a clutch is held —
    // second look when the only result is a bag.
    if (rawItems.length === 1 && rawItems[0].category === "bag") {
      const corrected = await guardBagOnlyExtraction(
        openai,
        imageDataUrl,
        rawItems[0]
      );
      rawItems = corrected;
    }
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

Set dominantProduct to what the photo is MAINLY selling (the product a shopper would buy) — never a prop.
Examples:
- Model in a midi dress holding a small clutch → dominantProduct=dress, items=[the dress only]. Do NOT return the clutch.
- Close-up of a tote on a white background → dominantProduct=bag, items=[the bag].
- Receipt with dress + sandals lines → dominantProduct can be dress or the first apparel line; include each purchased line item (still omit styling props not on the receipt).

Return every distinct wearable item the shopper is actually buying. Prefer accurate names and brands.
Category rules: socks, stockings, tights, no-show socks → accessory (NOT shoes). shoes/boots/loafers/sneakers/heels/pumps/flats/sandals/wedges → shoes. dresses/jumpsuits/rompers → dress. skirts → bottom. blouses/tops → top.
CRITICAL — bags / handbags:
- A bag the model is holding, wearing, or styled with is a PROP, not a wardrobe item.
- NEVER return category "bag" for dress, top, skirt, or jumpsuit product photos — even if a handbag is visible.
- Only return category "bag" when the bag itself is the product (bag fills most of the frame, bag listing page, or receipt line is a bag).
If it's a product photo of one garment, return exactly one item matching dominantProduct.
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

type ExtractedItem = z.infer<typeof extractedItemSchema>;
type ExtractOutput = z.infer<typeof garmentExtractSchema>;

const APPAREL_CATS = new Set(["dress", "top", "bottom", "outerwear"]);

/** Drop prop bags; coerce when dominant product is apparel but model returned bags. */
function finalizeExtractedItems(output: ExtractOutput): ExtractedItem[] {
  const { dominantProduct, items } = output;
  if (!items.length) return [];

  if (APPAREL_CATS.has(dominantProduct)) {
    const apparel = items.filter((i) => APPAREL_CATS.has(i.category));
    if (apparel.length) {
      // Keep apparel + real shoes from multi-item receipts; never bags
      const shoes = items.filter((i) => i.category === "shoes");
      return [...apparel, ...shoes];
    }
    // Dominant is apparel but model only returned bag/accessory — coerce first item
    const seed = items[0];
    return [
      {
        ...seed,
        category: dominantProduct as ExtractedItem["category"],
        name: looksLikeBagName(seed.name)
          ? defaultNameForCategory(dominantProduct)
          : seed.name,
        tags: [
          ...(seed.tags || []).filter((t) => !/bag|clutch|tote|purse/i.test(t)),
          "corrected_prop_bag",
        ],
      },
    ];
  }

  if (dominantProduct === "bag") {
    return items.filter((i) => i.category === "bag");
  }

  // Receipts / mixed: drop bags whenever apparel is also present
  const apparel = items.filter((i) => APPAREL_CATS.has(i.category));
  if (apparel.length) {
    return items.filter((i) => i.category !== "bag");
  }
  return items;
}

function looksLikeBagName(name: string): boolean {
  return /^(hand\s*)?bag|clutch|tote|purse|crossbody$/i.test(name.trim());
}

function defaultNameForCategory(cat: string): string {
  switch (cat) {
    case "dress":
      return "Dress";
    case "top":
      return "Top";
    case "bottom":
      return "Bottom";
    case "outerwear":
      return "Outerwear";
    default:
      return "Garment";
  }
}

/** Second vision pass when extraction returned only a bag — catch dress-with-clutch shots. */
async function guardBagOnlyExtraction(
  openai: NonNullable<ReturnType<typeof getOpenAI>>,
  imageDataUrl: string,
  bagItem: ExtractedItem
): Promise<ExtractedItem[]> {
  try {
    const { output } = await generateText({
      model: openai(INGEST_VISION_MODEL),
      output: Output.object({ schema: bagGuardSchema }),
      maxRetries: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This photo was classified as a handbag. Double-check carefully.

Is the MAIN product being sold a bag/purse/clutch, OR is it clothing (dress, top, skirt, jumpsuit, etc.) where a bag is only held or styled as a prop?

- If clothing dominates the frame (person wearing a dress/outfit), set mainProductIsBag=false and fill category/name/brand/colors for the CLOTHING (e.g. category=dress).
- Only set mainProductIsBag=true if this is clearly a bag product shot (bag is the subject for sale).`,
            },
            { type: "image", image: imageDataUrl },
          ],
        },
      ],
    });

    if (!output) return [bagItem];
    if (output.mainProductIsBag) return [bagItem];
    if (!APPAREL_CATS.has(output.category) && output.category !== "shoes") {
      return [bagItem];
    }
    return [
      {
        name: output.name || defaultNameForCategory(output.category),
        brand: output.brand || bagItem.brand,
        category: output.category,
        colors: output.colors?.length ? output.colors : bagItem.colors,
        fabric: output.fabric,
        formality: output.formality || bagItem.formality,
        tags: [
          ...(output.tags || []),
          "corrected_prop_bag",
        ],
        price: bagItem.price,
        currency: bagItem.currency,
        orderId: bagItem.orderId,
        detectedStore: bagItem.detectedStore,
      },
    ];
  } catch {
    return [bagItem];
  }
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

