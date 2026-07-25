/** Compress / normalize profile photos for avatar preview. */

export async function prepareProfilePhoto(file: File): Promise<{
  dataUrl: string;
  error?: string;
}> {
  const name = file.name.toLowerCase();
  const isHeic =
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif";

  try {
    let source: Blob = file;

    if (isHeic) {
      const converted = await convertHeicOnServer(file);
      if (!converted.ok || !converted.blob) {
        return {
          dataUrl: "",
          error:
            converted.error ||
            "This iPhone HEIC photo couldn’t be converted. Please export as JPG/PNG in Photos, then upload.",
        };
      }
      source = converted.blob;
    } else if (file.type && !file.type.startsWith("image/")) {
      return { dataUrl: "", error: "Please upload a JPG, PNG, WebP, or HEIC photo." };
    }

    return { dataUrl: await compressBlob(source, 1200, 0.82) };
  } catch {
    return {
      dataUrl: "",
      error: "Couldn’t read that photo. Try a JPG/PNG export from your Photos app.",
    };
  }
}

/**
 * Pad (never crop) to FASHN’s 2:3 canvas so try-on keeps head-to-toe framing
 * instead of zooming into a waist-up fashion crop.
 */
export async function letterboxForTryOn(src: string): Promise<string> {
  const img = await loadHtmlImage(src);
  const targetRatio = 2 / 3; // width / height — FASHN native
  const srcRatio = img.width / img.height;

  let canvasW: number;
  let canvasH: number;
  if (srcRatio > targetRatio) {
    canvasW = img.width;
    canvasH = Math.round(img.width / targetRatio);
  } else {
    canvasH = img.height;
    canvasW = Math.round(img.height * targetRatio);
  }

  const maxEdge = 1296;
  const scale = Math.min(1, maxEdge / Math.max(canvasW, canvasH));
  canvasW = Math.max(1, Math.round(canvasW * scale));
  canvasH = Math.max(1, Math.round(canvasH * scale));
  const drawW = Math.round(img.width * scale);
  const drawH = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.fillStyle = "#0e0e0d";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.drawImage(
    img,
    Math.round((canvasW - drawW) / 2),
    Math.round((canvasH - drawH) / 2),
    drawW,
    drawH
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

async function convertHeicOnServer(
  file: File
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  try {
    const form = new FormData();
    form.append("file", file, file.name || "photo.heic");
    const res = await fetch("/api/avatar/convert-heic", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        error:
          typeof data.error === "string"
            ? data.error
            : "HEIC conversion failed on the server.",
      };
    }
    const blob = await res.blob();
    return { ok: true, blob };
  } catch {
    // Fallback: try client-side heic2any if server route is unavailable
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.82,
      });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      return { ok: true, blob: blob as Blob };
    } catch {
      return { ok: false };
    }
  }
}

async function compressBlob(
  blob: Blob,
  maxEdge: number,
  quality: number
): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
