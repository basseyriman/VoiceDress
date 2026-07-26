/**
 * Build a single product sheet from multiple garments so FASHN Try-On Max
 * can dress top + bottom in one credit-consuming call (API is one product_image).
 */

async function toBuffer(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const b64 = src.split(",")[1] || "";
    return Buffer.from(b64, "base64");
  }
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to fetch collage image (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Side-by-side white-backed product collage (data URL). */
export async function composeApparelCollage(
  productImages: string[]
): Promise<string> {
  if (productImages.length < 2) {
    throw new Error("Collage needs at least two product images");
  }

  const sharp = (await import("sharp")).default;
  const cellW = 640;
  const cellH = 840;
  const gap = 24;
  const pad = 32;
  const n = Math.min(productImages.length, 3);
  const width = pad * 2 + n * cellW + (n - 1) * gap;
  const height = pad * 2 + cellH;

  const tiles = await Promise.all(
    productImages.slice(0, n).map(async (src) => {
      const buf = await toBuffer(src);
      return sharp(buf)
        .resize(cellW, cellH, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();
    })
  );

  const composites = tiles.map((input, i) => ({
    input,
    left: pad + i * (cellW + gap),
    top: pad,
  }));

  const out = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return `data:image/png;base64,${out.toString("base64")}`;
}
