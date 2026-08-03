/** Compress / normalize profile photos for avatar preview. */

export async function prepareProfilePhoto(file: File): Promise<{
  dataUrl: string;
  error?: string;
}> {
  return prepareImageUpload(file, 1800, 0.92);
}

/**
 * Receipt / product photos for wardrobe ingest — keep under Vercel body limits
 * so repeated uploads don’t hang the “Extracting…” button.
 */
export async function prepareWardrobeIngestPhoto(file: File): Promise<{
  dataUrl: string;
  error?: string;
}> {
  // Smaller images = fewer vision tokens → fewer OpenAI TPM rate limits
  return prepareImageUpload(file, 720, 0.68);
}

async function prepareImageUpload(
  file: File,
  maxEdge: number,
  quality: number
): Promise<{ dataUrl: string; error?: string }> {
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

    return { dataUrl: await compressBlob(source, maxEdge, quality) };
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

  const maxEdge = 2048;
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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0e0e0d";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.drawImage(
    img,
    Math.round((canvasW - drawW) / 2),
    Math.round((canvasH - drawH) / 2),
    drawW,
    drawH
  );

  return canvas.toDataURL("image/jpeg", 0.97);
}

/**
 * Final display polish — mild contrast/clarity without AI re-generation.
 * Cuts muddy multi-pass look so the dressed photo feels premium next to UI.
 */
export async function polishTryOnResult(src: string): Promise<string> {
  const img = await loadHtmlImage(src);
  const w = img.width;
  const h = img.height;
  if (w < 8 || h < 8) return src;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Tone: slight clarity only — heavy saturate was turning finishes neon
  ctx.filter = "contrast(1.03) saturate(1.01) brightness(1.01)";
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = "none";

  // Unsharp only on moderate sizes — full 2k pixel loops stall phones
  if (w * h > 1_600_000) {
    return canvas.toDataURL("image/jpeg", 0.95);
  }

  const sharp = document.createElement("canvas");
  sharp.width = w;
  sharp.height = h;
  const sctx = sharp.getContext("2d");
  if (!sctx) return canvas.toDataURL("image/jpeg", 0.95);

  sctx.drawImage(canvas, 0, 0);
  const srcData = sctx.getImageData(0, 0, w, h);
  const out = sctx.createImageData(w, h);
  const s = srcData.data;
  const d = out.data;
  const k = [0, -0.12, 0, -0.12, 1.48, -0.12, 0, -0.12, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let v = 0;
        let ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            v += s[((y + dy) * w + (x + dx)) * 4 + c] * k[ki++];
          }
        }
        d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      d[i + 3] = s[i + 3];
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      d[x * 4 + c] = s[x * 4 + c];
      d[((h - 1) * w + x) * 4 + c] = s[((h - 1) * w + x) * 4 + c];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      d[y * w * 4 + c] = s[y * w * 4 + c];
      d[(y * w + w - 1) * 4 + c] = s[(y * w + w - 1) * 4 + c];
    }
  }
  sctx.putImageData(out, 0, 0);

  ctx.globalAlpha = 0.4;
  ctx.drawImage(sharp, 0, 0);
  ctx.globalAlpha = 1;

  return canvas.toDataURL("image/jpeg", 0.95);
}

/**
 * Paste the real face/head from the original photo onto the dressed result
 * so try-on can’t cartoonize or swap your identity.
 *
 * - strong: full head (face + hairline + ears), stops above the collar
 * - soft: real skin/hair with a narrow eye band open so glasses frames can remain
 */
export async function lockFaceIdentity(
  identitySrc: string,
  dressedSrc: string,
  strength: "strong" | "soft" = "strong",
  faceBox?: { x: number; y: number; w: number; h: number }
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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(dressed, 0, 0, w, h);

  const faceLayer = document.createElement("canvas");
  faceLayer.width = w;
  faceLayer.height = h;
  const fctx = faceLayer.getContext("2d");
  if (!fctx) return dressedSrc;
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = "high";

  // Draw identity with the same letterbox framing as the dressed canvas
  const idRatio = identity.width / identity.height;
  const canvasRatio = w / h;
  let dw = w;
  let dh = h;
  let dx = 0;
  let dy = 0;
  if (idRatio > canvasRatio) {
    dw = w;
    dh = Math.round(w / idRatio);
    dy = Math.round((h - dh) / 2);
  } else {
    dh = h;
    dw = Math.round(h * idRatio);
    dx = Math.round((w - dw) / 2);
  }
  fctx.drawImage(identity, dx, dy, dw, dh);

  // Dynamic face box support
  const cx = faceBox ? faceBox.x + faceBox.w / 2 : w * 0.5;
  const cy = faceBox ? faceBox.y + faceBox.h / 2 : h * 0.138;
  const rx = faceBox ? faceBox.w * 0.7 : w * 0.34;
  const ry = faceBox ? faceBox.h * 0.8 : h * 0.2;
  const maxY = faceBox ? faceBox.y + faceBox.h * 1.5 : h * 0.36;

  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext("2d");
  if (!mctx) return dressedSrc;

  const inner = ry * 0.55;
  const grad = mctx.createRadialGradient(cx, cy, inner, cx, cy, ry);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(0.72, "rgba(0,0,0,1)");
  grad.addColorStop(0.9, "rgba(0,0,0,0.96)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  mctx.fillStyle = grad;
  mctx.beginPath();
  mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  mctx.fill();

  // Clip anything below the collar line
  mctx.globalCompositeOperation = "destination-in";
  mctx.fillStyle = "#000";
  mctx.fillRect(0, 0, w, Math.floor(maxY));

  fctx.globalCompositeOperation = "destination-in";
  fctx.drawImage(mask, 0, 0);

  ctx.drawImage(faceLayer, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.98);
}

/**
 * After accessory/shoe AI passes, pull overall color grade back toward the
 * already-dressed clothes frame so watches/glasses don’t neon the whole look.
 */
export async function stabilizeTryOnColors(
  referenceSrc: string,
  editedSrc: string
): Promise<string> {
  const [ref, edited] = await Promise.all([
    loadHtmlImage(referenceSrc),
    loadHtmlImage(editedSrc),
  ]);
  const w = edited.width;
  const h = edited.height;
  if (w < 8 || h < 8) return editedSrc;

  const refCanvas = document.createElement("canvas");
  refCanvas.width = w;
  refCanvas.height = h;
  const rctx = refCanvas.getContext("2d");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!rctx || !ctx) return editedSrc;

  rctx.drawImage(ref, 0, 0, w, h);
  ctx.drawImage(edited, 0, 0, w, h);
  const refData = rctx.getImageData(0, 0, w, h);
  const editData = ctx.getImageData(0, 0, w, h);

  // Sample torso/mid body — skip face (top) and shoes (bottom edge)
  const y0 = Math.floor(h * 0.28);
  const y1 = Math.floor(h * 0.72);
  const x0 = Math.floor(w * 0.22);
  const x1 = Math.floor(w * 0.78);
  let rr = 0;
  let rg = 0;
  let rb = 0;
  let er = 0;
  let eg = 0;
  let eb = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * w + x) * 4;
      rr += refData.data[i];
      rg += refData.data[i + 1];
      rb += refData.data[i + 2];
      er += editData.data[i];
      eg += editData.data[i + 1];
      eb += editData.data[i + 2];
      n += 1;
    }
  }
  if (n < 50) return editedSrc;
  rr /= n;
  rg /= n;
  rb /= n;
  er /= n;
  eg /= n;
  eb /= n;
  if (er < 8 || eg < 8 || eb < 8) return editedSrc;

  // Soft correction — don’t fully flatten intentional shoe/watch color
  const mix = 0.55;
  const sr = 1 + ((rr / er) - 1) * mix;
  const sg = 1 + ((rg / eg) - 1) * mix;
  const sb = 1 + ((rb / eb) - 1) * mix;
  // Ignore tiny drifts
  if (
    Math.abs(sr - 1) < 0.02 &&
    Math.abs(sg - 1) < 0.02 &&
    Math.abs(sb - 1) < 0.02
  ) {
    return editedSrc;
  }

  const d = editData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, d[i] * sr));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * sg));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * sb));
  }
  ctx.putImageData(editData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.96);
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
    const blob = (opts?.colors || []).join(" ").toLowerCase();
    // Prefer light-neutral coat targets — brown defaults paint hallway smudges
    // onto shirts when the blazer is beige/stone and hexColors are missing.
    if (/beige|stone|khaki|sand|camel|tan|taupe|cream|ivory|oat|linen/.test(blob)) {
      targets.push(
        { r: 210, g: 190, b: 160 },
        { r: 190, g: 165, b: 130 },
        { r: 170, g: 145, b: 110 }
      );
    } else if (/navy|midnight|ink|black|charcoal/.test(blob)) {
      targets.push(
        { r: 30, g: 42, b: 65 },
        { r: 40, g: 40, b: 42 }
      );
    } else {
      targets.push(
        { r: 200, g: 180, b: 150 },
        { r: 40, g: 50, b: 75 }
      );
    }
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
  return canvas.toDataURL("image/jpeg", 0.97);
}

/**
 * Copy the trouser/skirt band from a trusted base frame onto a later AI result.
 * Stops outerwear (e.g. full-suit product shots) and accessory passes from
 * inventing denim or recoloring bottoms. Leaves torso (jacket) and feet free.
 */
export async function preserveLowerBodyFromBase(
  baseSrc: string,
  dressedSrc: string,
  opts?: { yStart?: number; yEnd?: number }
): Promise<string> {
  const [base, dressed] = await Promise.all([
    loadHtmlImage(baseSrc),
    loadHtmlImage(dressedSrc),
  ]);
  const w = dressed.width;
  const h = dressed.height;
  if (w < 8 || h < 8) return dressedSrc;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dressedSrc;

  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = w;
  baseCanvas.height = h;
  const bctx = baseCanvas.getContext("2d");
  if (!bctx) return dressedSrc;

  ctx.drawImage(dressed, 0, 0, w, h);
  bctx.drawImage(base, 0, 0, w, h);
  const out = ctx.getImageData(0, 0, w, h);
  const src = bctx.getImageData(0, 0, w, h);

  const y0 = Math.floor(h * (opts?.yStart ?? 0.46));
  const y1 = Math.floor(h * (opts?.yEnd ?? 0.86));
  const x0 = Math.floor(w * 0.1);
  const x1 = Math.floor(w * 0.9);
  // Soft blend at top/bottom edges so jacket hem and shoe tops don't hard-cut
  const feather = Math.max(4, Math.floor(h * 0.03));

  for (let y = y0; y < y1; y++) {
    let edge = 1;
    if (y - y0 < feather) edge = (y - y0) / feather;
    else if (y1 - y < feather) edge = (y1 - y) / feather;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      out.data[i] = Math.round(out.data[i] * (1 - edge) + src.data[i] * edge);
      out.data[i + 1] = Math.round(
        out.data[i + 1] * (1 - edge) + src.data[i + 1] * edge
      );
      out.data[i + 2] = Math.round(
        out.data[i + 2] * (1 - edge) + src.data[i + 2] * edge
      );
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.97);
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
 * Cheap trust check — catch only clear apparel misses (e.g. light trousers
 * still reading as dark denim). Mid-tone stone/khaki bottoms are often shaded
 * under jackets; do not false-fail those when they clearly landed.
 */
export async function verifyApparelLook(
  wornSrc: string,
  pieces: {
    id: string;
    category: string;
    name?: string;
    colors?: string[];
    hexColors?: string[];
  }[],
  opts?: { skipTops?: boolean }
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
    // Blazer/coat covers the torso — don't fail ivory tops as "dark"
    if (opts?.skipTops && (piece.category === "top" || piece.category === "dress")) {
      continue;
    }
    const colorBlob = `${(piece.colors || []).join(" ")} ${piece.name || ""}`.toLowerCase();
    const targets = [
      ...(piece.hexColors || []).map(hexToRgb).filter(Boolean),
      ...namedColorHints(piece.colors),
    ] as { r: number; g: number; b: number }[];
    if (!targets.length) continue;

    // Bottoms: sample thigh band — avoid shoes/ankles that pull the average dark
    const region =
      piece.category === "bottom"
        ? sampleRegionAvg(data, img.width, img.height, 0.32, 0.68, 0.44, 0.58)
        : sampleRegionAvg(data, img.width, img.height, 0.35, 0.65, 0.28, 0.42);

    const expectedLight = targets.some(
      (t) => 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b > 180
    );
    const expectedDark = targets.some(
      (t) => 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b < 70
    );
    const expectedMidLight =
      piece.category === "bottom" &&
      /stone|khaki|beige|sand|tan|camel|cream|taupe|nude|champagne|oat|linen/.test(
        colorBlob
      );

    let nearest = Infinity;
    for (const t of targets) {
      nearest = Math.min(nearest, colorDistance(region, t));
    }

    // Catastrophic only: expected white/ivory stayed near-black (shadowed
    // hallways often read real white shirts as ~120–160 lum — don’t false-fail).
    if (expectedLight && region.lum < 75) {
      failedIds.push(piece.id);
      reasons.push(`${piece.name || piece.category} stayed dark`);
      continue;
    }
    // Catastrophic only: expected black stayed near-white
    if (expectedDark && region.lum > 175) {
      failedIds.push(piece.id);
      reasons.push(`${piece.name || piece.category} stayed light`);
      continue;
    }
    // Stone/khaki trousers: pass if the lower body reads mid-light (they landed)
    if (expectedMidLight) {
      if (region.lum < 70) {
        failedIds.push(piece.id);
        reasons.push(`${piece.name || "trousers"} stayed too dark`);
      }
      continue;
    }
    // Exact hex match is unreliable under jackets / hallway light — bottoms
    // only fail on a very large distance AND wrong lightness family.
    if (piece.category === "bottom") {
      if (nearest > 160 && expectedLight && region.lum < 130) {
        failedIds.push(piece.id);
        reasons.push(`${piece.name || piece.category} color didn’t land`);
      }
      continue;
    }
    // Light tops: pass once the torso is clearly light — don’t require near-white
    if (expectedLight && (piece.category === "top" || piece.category === "dress")) {
      if (region.lum < 110 && nearest > 140) {
        failedIds.push(piece.id);
        reasons.push(`${piece.name || piece.category} color didn’t land`);
      }
      continue;
    }
    if (nearest > 120 && !(expectedLight && region.lum > 150)) {
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
 * True when the head band looks wiped (near-white / blown) — common after a
 * failed glasses Kontext pass. Caller should strong-lock identity instead.
 */
export async function faceRegionBlown(src: string): Promise<boolean> {
  try {
    const img = await loadHtmlImage(src);
    const canvas = document.createElement("canvas");
    const w = Math.min(img.width, 360);
    const h = Math.min(img.height, 540);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const region = sampleRegionAvg(data, w, h, 0.32, 0.68, 0.04, 0.22);
    // Blown flash / erased head reads very bright with low chroma
    const chroma = Math.max(region.r, region.g, region.b) - Math.min(region.r, region.g, region.b);
    return region.lum > 220 && chroma < 28;
  } catch {
    return false;
  }
}

/**
 * Detect black blotches / glitch patches common in failed outerwear composites.
 *
 * Black clothing is not a glitch: leather, wool and denim keep folds, sheen and
 * sensor noise. A dead patch is near-pure black AND flat, so texture is what
 * separates a real black jacket from a hole in the render.
 */
export async function hasTryOnArtifacts(
  src: string,
  opts?: { expectDark?: boolean }
): Promise<boolean> {
  try {
    const img = await loadHtmlImage(src);
    const canvas = document.createElement("canvas");
    const w = Math.min(img.width, 360);
    const h = Math.min(img.height, 540);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const y0 = Math.floor(h * 0.2);
    const y1 = Math.floor(h * 0.75);
    const x0 = Math.floor(w * 0.12);
    const x1 = Math.floor(w * 0.88);

    const lumAt = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    };

    const step = 4;
    let flatBlack = 0;
    let total = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        total++;
        if (lumAt(x, y) > 12) continue;
        // Flat means neighbours are equally dead — fabric always varies
        let spread = 0;
        for (const [ox, oy] of [
          [step, 0],
          [-step, 0],
          [0, step],
          [0, -step],
        ]) {
          const nx = Math.min(w - 1, Math.max(0, x + ox));
          const ny = Math.min(h - 1, Math.max(0, y + oy));
          spread = Math.max(spread, Math.abs(lumAt(nx, ny) - lumAt(x, y)));
        }
        if (spread < 6) flatBlack++;
      }
    }
    if (!total) return false;
    const limit = opts?.expectDark ? 0.35 : 0.18;
    return flatBlack / total > limit;
  } catch {
    return false;
  }
}

/** True when the piece is described as a dark colour (black leather, navy wool…). */
export function pieceReadsDark(piece: {
  colors?: string[];
  hexColors?: string[];
  name?: string;
}): boolean {
  const blob = `${(piece.colors || []).join(" ")} ${piece.name || ""}`.toLowerCase();
  if (/black|charcoal|graphite|onyx|jet|navy|midnight|ink|espresso/.test(blob)) {
    return true;
  }
  return (piece.hexColors || []).some((hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b < 70;
  });
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
        quality: 0.92,
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
