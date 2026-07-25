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

/**
 * Standardize a body photo for outfit try-on: 2:3 framing + soft studio grade.
 * Does not crop the person — pads and grades so garments land cleanly.
 */
export async function normalizeBodyPhotoForTryOn(src: string): Promise<string> {
  const framed = await letterboxForTryOn(src);
  const img = await loadHtmlImage(framed);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return framed;

  ctx.drawImage(img, 0, 0);

  // Soft warm grade so the plate reads finished, not a phone dump
  ctx.fillStyle = "rgba(201,168,124,0.06)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const vignette = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height * 0.42,
    canvas.height * 0.18,
    canvas.width / 2,
    canvas.height * 0.5,
    canvas.height * 0.78
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Gentle lift on midtones for try-on contrast
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(245,240,232,0.12)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Place a transparent cutout on a clean VoiceDress studio plate (2:3).
 * Crops to the subject’s opaque bounds so the person fills the frame.
 */
export async function composeCutoutOnStudio(cutoutSrc: string): Promise<string> {
  const img = await loadHtmlImage(cutoutSrc);
  const targetRatio = 2 / 3;
  const maxEdge = 1296;

  let canvasH = Math.min(maxEdge, 1200);
  let canvasW = Math.round(canvasH * targetRatio);
  if (canvasW > maxEdge) {
    canvasW = maxEdge;
    canvasH = Math.round(canvasW / targetRatio);
  }

  // Measure opaque subject so we don't keep rembg's empty padding
  const measure = document.createElement("canvas");
  measure.width = img.width;
  measure.height = img.height;
  const mctx = measure.getContext("2d", { willReadFrequently: true });
  if (!mctx) return cutoutSrc;
  mctx.drawImage(img, 0, 0);
  const { data } = mctx.getImageData(0, 0, img.width, img.height);
  let minX = img.width;
  let minY = img.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const a = data[(y * img.width + x) * 4 + 3];
      if (a > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) {
    minX = 0;
    minY = 0;
    maxX = img.width - 1;
    maxY = img.height - 1;
  }
  // Small pad around subject
  const pad = Math.round(Math.max(img.width, img.height) * 0.02);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(img.width - 1, maxX + pad);
  maxY = Math.min(img.height - 1, maxY + pad);
  const subW = maxX - minX + 1;
  const subH = maxY - minY + 1;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return cutoutSrc;

  const bg = ctx.createRadialGradient(
    canvasW * 0.5,
    canvasH * 0.32,
    canvasH * 0.08,
    canvasW * 0.5,
    canvasH * 0.55,
    canvasH * 0.72
  );
  bg.addColorStop(0, "#2a261f");
  bg.addColorStop(0.45, "#161512");
  bg.addColorStop(1, "#0b0b0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Fill ~92% of plate height with the person
  const marginX = canvasW * 0.04;
  const marginTop = canvasH * 0.03;
  const marginBottom = canvasH * 0.02;
  const boxW = canvasW - marginX * 2;
  const boxH = canvasH - marginTop - marginBottom;
  const scale = Math.min(boxW / subW, boxH / subH);
  const drawW = subW * scale;
  const drawH = subH * scale;
  const dx = (canvasW - drawW) / 2;
  const dy = marginTop + (boxH - drawH) / 2;

  ctx.drawImage(img, minX, minY, subW, subH, dx, dy, drawW, drawH);

  const vignette = ctx.createRadialGradient(
    canvasW / 2,
    canvasH * 0.4,
    canvasH * 0.2,
    canvasW / 2,
    canvasH * 0.5,
    canvasH * 0.78
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvasW, canvasH);

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function removeBackgroundViaApi(
  imageDataUrl: string
): Promise<{ cutoutUrl?: string; error?: string; needsKey?: boolean }> {
  const res = await fetch("/api/avatar/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return {
      error:
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        "Background removal failed",
      needsKey: Boolean(data.needsKey),
    };
  }
  if (typeof data.cutoutUrl !== "string") {
    return { error: "No cutout returned" };
  }
  return { cutoutUrl: data.cutoutUrl };
}

/**
 * Prefer the user’s real photo (framed for try-on).
 * Optional studio clear is off by default — most people want to look like themselves.
 */
export async function processBodyPhotoForTryOn(
  file: File,
  options?: { minMs?: number; clearBackground?: boolean }
): Promise<{ dataUrl: string; error?: string; clearedBackground?: boolean }> {
  const started = Date.now();
  const prepared = await prepareProfilePhoto(file);
  if (prepared.error || !prepared.dataUrl) {
    return { dataUrl: "", error: prepared.error || "Invalid photo" };
  }

  try {
    let dataUrl: string;
    let clearedBackground = false;

    if (options?.clearBackground) {
      const rembg = await removeBackgroundViaApi(prepared.dataUrl);
      if (rembg.cutoutUrl) {
        dataUrl = await composeCutoutOnStudio(rembg.cutoutUrl);
        clearedBackground = true;
      } else if (rembg.needsKey) {
        return {
          dataUrl: "",
          error:
            rembg.error ||
            "Add FAL_KEY in .env.local to clear photo backgrounds for try-on.",
        };
      } else {
        dataUrl = await letterboxForTryOn(prepared.dataUrl);
      }
    } else {
      // Keep the real photo — pad to 2:3 without shrinking the person
      dataUrl = await letterboxForTryOn(prepared.dataUrl);
    }

    const minMs = options?.minMs ?? 0;
    const wait = Math.max(0, minMs - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return { dataUrl, clearedBackground };
  } catch {
    return {
      dataUrl: "",
      error: "Couldn’t prepare that photo for dressing. Try another.",
    };
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (src.startsWith("http://") || src.startsWith("https://")) {
      img.crossOrigin = "anonymous";
    }
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
