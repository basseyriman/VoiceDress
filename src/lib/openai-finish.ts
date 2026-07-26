import OpenAI, { toFile } from "openai";

export type FinishPiece = {
  imageUrl: string;
  category: string;
  name?: string;
  colors?: string[];
  hexColors?: string[];
  fabric?: string;
  texture?: string;
  tags?: string[];
};

type TryResult =
  | { ok: true; url: string }
  | { ok: false; status: number; detail: string };

function pieceLook(piece: FinishPiece) {
  const bits = [
    piece.name || piece.category,
    piece.colors?.length ? `color ${piece.colors.join(", ")}` : "",
    piece.hexColors?.length ? `hex ${piece.hexColors.join(", ")}` : "",
    [piece.fabric, piece.texture].filter(Boolean).join(" "),
  ].filter(Boolean);
  return bits.join(" — ");
}

export function isWatchPiece(piece: FinishPiece) {
  return /watch|wrist|chrono|time/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

export function isEyewearPiece(piece: FinishPiece) {
  return /glass|frame|optic|sunglass|spec/i.test(
    `${piece.name || ""} ${(piece.tags || []).join(" ")}`
  );
}

function openaiFinishPrompt(piece: FinishPiece): string {
  const look = pieceLook(piece);
  const keep =
    "Image 1 is the person. Keep their EXACT face, skin, hair, body, pose, hands, background, camera distance, and framing. Photorealistic only — no stickers, no cutouts.";

  if (piece.category === "shoes") {
    return [
      keep,
      `Image 2 is the shoe product (${look}).`,
      "Replace ONLY the footwear on BOTH feet with those shoes. Match color and material from Image 2.",
      "Do not change jeans, top, face, or anything above the ankles.",
    ].join(" ");
  }

  if (isWatchPiece(piece)) {
    return [
      keep,
      piece.imageUrl
        ? `Image 2 shows a watch product (${look}). Ignore any hand holding it — use only the watch.`
        : `Add a wristwatch: ${look}.`,
      "Place one realistic watch on the most visible wrist, natural size. Do not change face or clothes.",
    ].join(" ");
  }

  return [
    keep,
    `Image 2 is eyewear (${look}).`,
    "Place ONLY those glasses on the existing face — on the nose and ears. Do not redesign the face. Same eyes, nose, mouth, skin.",
  ].join(" ");
}

async function srcToFile(src: string, filename: string) {
  if (src.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(src);
    if (!match) throw new Error("invalid data URL");
    const mime = match[1] || "image/jpeg";
    const buf = Buffer.from(match[2], "base64");
    return toFile(buf, filename, { type: mime });
  }

  const res = await fetch(src);
  if (!res.ok) throw new Error(`fetch image failed (${res.status})`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return toFile(buf, filename, { type: mime });
}

/**
 * OpenAI Images Edit for shoes / glasses / watch on an already-dressed photo.
 * Uses OPENAI_API_KEY. Model via OPENAI_IMAGE_MODEL (default gpt-image-1).
 */
export async function openaiFinishEdit(opts: {
  personImage: string;
  productImage?: string;
  piece: FinishPiece;
}): Promise<TryResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, detail: "OPENAI_API_KEY missing" };
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
  const client = new OpenAI({ apiKey });

  try {
    const person = await srcToFile(opts.personImage, "person.png");
    const images = [person];
    if (opts.productImage) {
      images.push(await srcToFile(opts.productImage, "product.png"));
    }

    const result = await client.images.edit({
      model,
      image: images.length === 1 ? images[0] : images,
      prompt: openaiFinishPrompt(opts.piece),
      size: "1024x1536",
      quality: "medium",
    });

    const first = result.data?.[0];
    if (!first) {
      return { ok: false, status: 502, detail: "OpenAI returned no image" };
    }

    if (first.b64_json) {
      return {
        ok: true,
        url: `data:image/png;base64,${first.b64_json}`,
      };
    }
    if (first.url) {
      return { ok: true, url: first.url };
    }
    return { ok: false, status: 502, detail: "OpenAI image missing url/b64" };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "OpenAI image edit failed";
    console.error("[tryon] openai finish:", detail.slice(0, 400));
    return { ok: false, status: 502, detail };
  }
}

export function hasOpenAIImageKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
