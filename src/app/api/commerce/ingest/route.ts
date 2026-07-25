import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  DEFAULT_VISION_MODEL,
  getOpenAI,
  hasAIKey,
} from "@/lib/ai";
import {
  categorizeFromTitle,
  colorNameToHex,
} from "@/lib/commerce";
import type { CommerceSource, Formality, Garment } from "@/lib/types";

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
  const body = await req.json();
  const imageDataUrl = String(body.imageDataUrl || "");
  const userId = String(body.userId || "voicedress_local_user");
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
    const { output } = await generateText({
      model: openai(DEFAULT_VISION_MODEL),
      output: Output.object({ schema: garmentExtractSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract clothing / footwear / accessory items from this receipt, order screenshot, or product photo for a wardrobe app.
Return every distinct wearable item. Prefer accurate names and brands.
If it's a product photo of one garment, return one item.
detectedStore should be amazon|asos|zara|ebay|shein|temu|shopify|receipt when recognizable.`,
            },
            { type: "image", image: imageDataUrl },
          ],
        },
      ],
    });

    if (!output?.items?.length) {
      return NextResponse.json(
        { error: "Couldn’t find clothing items in that image. Try a clearer photo." },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const garments: Garment[] = output.items.map((item, i) => {
      const storeHint = (item.detectedStore || preferredSource).toLowerCase();
      const source = normalizeSource(storeHint, preferredSource);
      const colors = item.colors.length ? item.colors : ["neutral"];
      return {
        id: `ingest_${Date.now()}_${i}`,
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
      };
    });

    return NextResponse.json({
      ok: true,
      imported: garments.length,
      items: garments,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to extract garments from image",
      },
      { status: 500 }
    );
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
