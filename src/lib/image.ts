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
 * Extra margin around the person so feet/head don’t get clipped by the model.
 */
export async function letterboxForTryOn(src: string): Promise<string> {
  const img = await loadHtmlImage(src);
  const targetRatio = 2 / 3; // width / height — FASHN native
  // Keep breathing room so FASHN/Kontext don’t chew the head or shoes
  const edgePad = 0.08;
  const contentW = img.width;
  const contentH = img.height;
  const paddedW = contentW * (1 + edgePad * 2);
  const paddedH = contentH * (1 + edgePad * 2);
  const paddedRatio = paddedW / paddedH;

  let canvasW: number;
  let canvasH: number;
  if (paddedRatio > targetRatio) {
    canvasW = paddedW;
    canvasH = paddedW / targetRatio;
  } else {
    canvasH = paddedH;
    canvasW = paddedH * targetRatio;
  }

  const maxEdge = 1296;
  const scale = Math.min(1, maxEdge / Math.max(canvasW, canvasH));
  canvasW = Math.max(1, Math.round(canvasW * scale));
  canvasH = Math.max(1, Math.round(canvasH * scale));
  const drawW = Math.round(contentW * scale);
  const drawH = Math.round(contentH * scale);

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

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Paste the real face/head from the original photo onto the dressed result
 * so AI try-on can’t replace you with a lookalike.
 *
 * Tight oval on the face only — a larger mask was re-pasting the original
 * shirt/shoulders and undoing white/light tops.
 *
 * - strong: after apparel/shoes — restore face identity
 * - soft: after glasses — restore eyes/nose/mouth only so frames can stay
 */
export async function lockFaceIdentity(
  identitySrc: string,
  dressedSrc: string,
  strength: "strong" | "soft" = "strong"
): Promise<string> {
  const [identity, dressed] = await Promise.all([
    loadHtmlImage(identitySrc),
    loadHtmlImage(dressedSrc),
  ]);

  const w = dressed.width;
  const h = dressed.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dressedSrc;

  ctx.drawImage(dressed, 0, 0, w, h);

  // Face-only: keep above the collar so garment colors survive.
  const cx = w * 0.5;
  const cy = strength === "strong" ? h * 0.14 : h * 0.145;
  const rx = strength === "strong" ? w * 0.16 : w * 0.12;
  const ry = strength === "strong" ? h * 0.1 : h * 0.075;

  const faceLayer = document.createElement("canvas");
  faceLayer.width = w;
  faceLayer.height = h;
  const fctx = faceLayer.getContext("2d");
  if (!fctx) return dressedSrc;

  fctx.drawImage(identity, 0, 0, w, h);

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d");
  if (!mctx) return dressedSrc;

  const grad = mctx.createRadialGradient(
    cx,
    cy,
    ry * (strength === "strong" ? 0.35 : 0.45),
    cx,
    cy,
    ry
  );
  if (strength === "strong") {
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.88)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    grad.addColorStop(0, "rgba(0,0,0,0.95)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
  }
  mctx.fillStyle = grad;
  mctx.beginPath();
  mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  mctx.fill();

  fctx.globalCompositeOperation = "destination-in";
  fctx.drawImage(mask, 0, 0);

  ctx.drawImage(faceLayer, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.93);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function namedColorHints(
  colors: string[] = []
): { r: number; g: number; b: number }[] {
  const out: { r: number; g: number; b: number }[] = [];
  for (const c of colors) {
    const n = c.toLowerCase();
    if (/white|ivory|cream|bone|off[- ]?white/.test(n))
      out.push({ r: 245, g: 242, b: 235 });
    if (/stone|khaki|beige|sand|camel|tan|taupe/.test(n))
      out.push({ r: 190, g: 165, b: 130 });
    if (/navy|midnight|ink/.test(n)) out.push({ r: 30, g: 42, b: 65 });
    if (/black|charcoal|graphite/.test(n)) out.push({ r: 40, g: 40, b: 42 });
    if (/indigo|denim/.test(n)) out.push({ r: 50, g: 60, b: 90 });
  }
  return out;
}

/**
 * After Kontext adds a coat, keep FASHN shirt/trousers from `baseSrc` and only
 * take coat-colored pixels from `outerwearSrc`. Stops coat edits from rewriting
 * the whole outfit (and wasting finish credits on a wrong body).
 */
export async function layerOuterwearPreserveBase(
  baseSrc: string,
  outerwearSrc: string,
  opts?: { hexColors?: string[]; colors?: string[] }
): Promise<string> {
  const [base, outer] = await Promise.all([
    loadHtmlImage(baseSrc),
    loadHtmlImage(outerwearSrc),
  ]);
  const w = base.width;
  const h = base.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return baseSrc;

  const outerCanvas = document.createElement("canvas");
  outerCanvas.width = w;
  outerCanvas.height = h;
  const octx = outerCanvas.getContext("2d");
  if (!octx) return baseSrc;
  octx.drawImage(outer, 0, 0, w, h);
  const outerData = octx.getImageData(0, 0, w, h);

  ctx.drawImage(base, 0, 0, w, h);
  const baseData = ctx.getImageData(0, 0, w, h);

  const targets = [
    ...(opts?.hexColors || []).map(hexToRgb).filter(Boolean),
    ...namedColorHints(opts?.colors),
  ] as { r: number; g: number; b: number }[];

  if (!targets.length) {
    targets.push(
      { r: 180, g: 145, b: 100 },
      { r: 120, g: 90, b: 60 },
      { r: 40, g: 50, b: 75 }
    );
  }

  const y0 = Math.floor(h * 0.12);
  const y1 = Math.floor(h * 0.72);
  const x0 = Math.floor(w * 0.08);
  const x1 = Math.floor(w * 0.92);
  const faceY = h * 0.22;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (y < faceY) {
        const dx = (x - w * 0.5) / (w * 0.18);
        const dy = (y - h * 0.14) / (h * 0.1);
        if (dx * dx + dy * dy < 1) continue;
      }
      const i = (y * w + x) * 4;
      const pr = outerData.data[i];
      const pg = outerData.data[i + 1];
      const pb = outerData.data[i + 2];
      const pixel = { r: pr, g: pg, b: pb };

      let nearCoat = false;
      for (const t of targets) {
        if (colorDistance(pixel, t) < 78) {
          nearCoat = true;
          break;
        }
      }
      if (!nearCoat) continue;

      const br = baseData.data[i];
      const bg = baseData.data[i + 1];
      const bb = baseData.data[i + 2];
      if (colorDistance(pixel, { r: br, g: bg, b: bb }) < 28) continue;

      baseData.data[i] = pr;
      baseData.data[i + 1] = pg;
      baseData.data[i + 2] = pb;
    }
  }

  ctx.putImageData(baseData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.93);
}

function sampleRegionAvg(
  data: ImageData,
  w: number,
  h: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number
) {
  const left = Math.floor(w * x0);
  const right = Math.floor(w * x1);
  const top = Math.floor(h * y0);
  const bottom = Math.floor(h * y1);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const i = (y * w + x) * 4;
      r += data.data[i];
      g += data.data[i + 1];
      b += data.data[i + 2];
      n++;
    }
  }
  if (!n) return { r: 0, g: 0, b: 0, lum: 0 };
  r /= n;
  g /= n;
  b /= n;
  return { r, g, b, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b };
}

/**
 * Cheap trust check — if shirt/trousers colors clearly don't match, don't
 * claim success or burn more fal credits on shoes/glasses.
 */
export async function verifyApparelLook(
  wornSrc: string,
  pieces: {
    id: string;
    category: string;
    name?: string;
    colors?: string[];
    hexColors?: string[];
  }[]
): Promise<{ ok: boolean; failedIds: string[]; reason: string }> {
  const img = await loadHtmlImage(wornSrc);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: true, failedIds: [], reason: "" };
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);

  const failedIds: string[] = [];
  const reasons: string[] = [];

  for (const piece of pieces) {
    if (piece.category === "outerwear") continue;
    const targets = [
      ...(piece.hexColors || []).map(hexToRgb).filter(Boolean),
      ...namedColorHints(piece.colors),
    ] as { r: number; g: number; b: number }[];
    if (!targets.length) continue;

    const region =
      piece.category === "bottom"
        ? sampleRegionAvg(data, img.width, img.height, 0.35, 0.65, 0.48, 0.68)
        : sampleRegionAvg(data, img.width, img.height, 0.35, 0.65, 0.28, 0.42);

    const expectedLight = targets.some(
      (t) => 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b > 180
    );
    const expectedDark = targets.some(
      (t) => 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b < 70
    );

    let nearest = Infinity;
    for (const t of targets) {
      nearest = Math.min(nearest, colorDistance(region, t));
    }

    if (expectedLight && region.lum < 120) {
      failedIds.push(piece.id);
      reasons.push(`${piece.name || piece.category} stayed dark`);
      continue;
    }
    if (expectedDark && region.lum > 160) {
      failedIds.push(piece.id);
      reasons.push(`${piece.name || piece.category} stayed light`);
      continue;
    }
    if (
      piece.category === "bottom" &&
      (piece.colors || []).some((c) => /stone|khaki|beige|sand|tan/.test(c)) &&
      region.lum < 85
    ) {
      failedIds.push(piece.id);
      reasons.push(`${piece.name || "trousers"} stayed too dark`);
      continue;
    }
    if (nearest > 110 && !(expectedLight && region.lum > 170)) {
      failedIds.push(piece.id);
      reasons.push(`${piece.name || piece.category} color didn’t land`);
    }
  }

  return {
    ok: failedIds.length === 0,
    failedIds,
    reason: reasons.join(" · "),
  };
}

/**
 * Keep the good upper body (head → knees) from the clean clothes photo,
 * and only take the lower legs/feet from a shoe edit — so shoe AI can’t
 * spoil the part that already looks right.
 */
export async function keepUpperBlendLower(
  protectedSrc: string,
  editedSrc: string,
  opts?: { seam?: number; feather?: number }
): Promise<string> {
  const [protectedImg, edited] = await Promise.all([
    loadHtmlImage(protectedSrc),
    loadHtmlImage(editedSrc),
  ]);

  const w = protectedImg.width;
  const h = protectedImg.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return protectedSrc;

  // Draw shoe edit full-frame first
  ctx.drawImage(edited, 0, 0, w, h);

  // Soft mask: fully keep protected image above the seam (knees),
  // feather into the shoe edit below.
  const seam = opts?.seam ?? 0.68; // ~knees on a standing full-body shot
  const feather = opts?.feather ?? 0.08;
  const seamY = h * seam;
  const featherPx = h * feather;

  const upper = document.createElement("canvas");
  upper.width = w;
  upper.height = h;
  const uctx = upper.getContext("2d");
  if (!uctx) return protectedSrc;
  uctx.drawImage(protectedImg, 0, 0, w, h);

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d");
  if (!mctx) return protectedSrc;

  const grad = mctx.createLinearGradient(0, seamY - featherPx, 0, seamY + featherPx);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(0.45, "rgba(0,0,0,1)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, w, h);

  uctx.globalCompositeOperation = "destination-in";
  uctx.drawImage(mask, 0, 0);

  ctx.drawImage(upper, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.93);
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
  const { authFetch } = await import("@/lib/auth-fetch");
  const res = await authFetch("/api/avatar/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402) {
    return {
      error: "Your trial has ended — open Billing to continue.",
    };
  }
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
  return new Promise(async (resolve, reject) => {
    try {
      let url = src;
      // Avoid CORS tainting Firebase / CDN URLs for canvas letterbox
      if (src.startsWith("http://") || src.startsWith("https://")) {
        const res = await fetch(src);
        if (!res.ok) throw new Error("image fetch failed");
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    } catch (err) {
      reject(err instanceof Error ? err : new Error("image load failed"));
    }
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
