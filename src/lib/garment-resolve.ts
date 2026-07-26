import { access, readFile } from "fs/promises";
import { join } from "path";
import { normalizeGarmentPublicUrl } from "@/lib/garment-url";

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function mimeForExt(ext: string) {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

/** If /garments/foo.png is missing, try foo.jpg (and the reverse). */
function alternateGarmentPath(rel: string): string | null {
  if (rel.endsWith(".png")) return rel.replace(/\.png$/i, ".jpg");
  if (rel.endsWith(".jpg") || rel.endsWith(".jpeg"))
    return rel.replace(/\.(jpg|jpeg)$/i, ".png");
  return null;
}

/** Resolve local /garments/* paths to base64 data URLs for fal.ai */
export async function resolveGarmentImageForFal(
  imageUrl: string
): Promise<string> {
  // fal.ai cannot fetch localhost — turn those into filesystem paths
  let url = imageUrl;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const privateLan =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
      if (privateLan && parsed.pathname.startsWith("/garments/")) {
        url = parsed.pathname;
      } else {
        return imageUrl;
      }
    }
  } catch {
    // keep url as-is
  }

  if (url.startsWith("data:")) {
    return url;
  }

  const normalized = normalizeGarmentPublicUrl(url);
  const rel = normalized.replace(/^\//, "").split("?")[0];
  if (!rel.startsWith("garments/")) {
    throw new Error(`Unsupported garment path: ${imageUrl}`);
  }

  const publicDir = join(process.cwd(), "public");
  let chosen = rel;
  let filePath = join(publicDir, chosen);

  if (!(await fileExists(filePath))) {
    const alt = alternateGarmentPath(chosen);
    if (alt && (await fileExists(join(publicDir, alt)))) {
      chosen = alt;
      filePath = join(publicDir, chosen);
    } else {
      throw new Error(`Missing garment file: public/${rel}`);
    }
  }

  const buf = await readFile(filePath);
  if (buf.length < 1000) {
    throw new Error(`Garment file too small or corrupt: public/${chosen}`);
  }

  // Side-by-side front/back product sheets confuse FASHN — keep the left panel only.
  let outBuf: Buffer = buf;
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w > 0 && h > 0 && w / h > 1.25) {
      outBuf = await sharp(buf)
        .extract({ left: 0, top: 0, width: Math.floor(w / 2), height: h })
        .jpeg({ quality: 92 })
        .toBuffer();
      return `data:image/jpeg;base64,${outBuf.toString("base64")}`;
    }
  } catch {
    // sharp unavailable — send original
  }

  const ext = chosen.split(".").pop()?.toLowerCase() || "jpeg";
  return `data:${mimeForExt(ext)};base64,${outBuf.toString("base64")}`;
}

export { normalizeGarmentPublicUrl } from "@/lib/garment-url";
