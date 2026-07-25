import type { Garment } from "./types";

type Point = [number, number];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src.slice(0, 48)}`));
    img.src = src;
  });
}

function sampleSkin(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const d = ctx.getImageData(Math.max(0, x), Math.max(0, y), 1, 1).data;
  return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
}

function pathFrom(ctx: CanvasRenderingContext2D, pts: Point[], closed = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Paint a garment texture into a body-shaped clip so it reads as worn clothing. */
function paintGarmentOnBody(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  clip: Point[],
  bounds: { x: number; y: number; w: number; h: number },
  opts?: { alpha?: number; soft?: boolean }
) {
  ctx.save();
  pathFrom(ctx, clip);
  ctx.clip();
  ctx.globalAlpha = opts?.alpha ?? 1;
  drawCover(ctx, img, bounds.x, bounds.y, bounds.w, bounds.h);
  if (opts?.soft) {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.18;
    const g = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y);
    g.addColorStop(0, "#000");
    g.addColorStop(0.5, "transparent");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }
  ctx.restore();
}

/**
 * Renders ONE full-body lookalike wearing the outfit — not stacked product cards.
 * Face comes from the user photo; garments are clipped onto torso/legs/feet.
 */
export async function renderWornLook(input: {
  faceDataUrl: string;
  garments: Garment[];
  width?: number;
  height?: number;
}): Promise<string> {
  const width = input.width ?? 720;
  const height = input.height ?? 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  const cx = width / 2;
  const face = await loadImage(input.faceDataUrl);

  // Studio backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#1c1a17");
  bg.addColorStop(0.45, "#121110");
  bg.addColorStop(1, "#0b0b0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(cx, height * 0.22, 20, cx, height * 0.35, width * 0.55);
  glow.addColorStop(0, "rgba(201,168,124,0.16)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Temp draw face to sample skin
  const headR = width * 0.11;
  const headY = height * 0.14;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, face, cx - headR * 1.15, headY - headR * 1.25, headR * 2.3, headR * 2.3);
  ctx.restore();
  const skin = sampleSkin(ctx, cx, headY + headR * 0.35);

  // Body silhouette (under clothes)
  const shoulderY = height * 0.23;
  const waistY = height * 0.48;
  const hipY = height * 0.52;
  const kneeY = height * 0.72;
  const ankleY = height * 0.9;
  const shoulderW = width * 0.28;
  const waistW = width * 0.16;
  const hipW = width * 0.2;
  const thighW = width * 0.1;
  const calfW = width * 0.07;

  const bodyOutline: Point[] = [
    [cx - shoulderW, shoulderY],
    [cx + shoulderW, shoulderY],
    [cx + waistW, waistY],
    [cx + hipW, hipY],
    [cx + thighW, kneeY],
    [cx + calfW, ankleY],
    [cx - calfW, ankleY],
    [cx - thighW, kneeY],
    [cx - hipW, hipY],
    [cx - waistW, waistY],
  ];

  // Soft contact shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, ankleY + 18, width * 0.16, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Skin / figure base
  ctx.fillStyle = skin;
  pathFrom(ctx, bodyOutline);
  ctx.fill();

  // Neck
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.045, headY + headR * 0.75);
  ctx.lineTo(cx + width * 0.045, headY + headR * 0.75);
  ctx.lineTo(cx + width * 0.06, shoulderY + 8);
  ctx.lineTo(cx - width * 0.06, shoulderY + 8);
  ctx.closePath();
  ctx.fill();

  // Arms (skin, may peek from sleeves)
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW, shoulderY + 10);
  ctx.lineTo(cx - shoulderW - width * 0.04, height * 0.46);
  ctx.lineTo(cx - shoulderW + width * 0.035, height * 0.46);
  ctx.lineTo(cx - shoulderW + width * 0.02, shoulderY + 24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + shoulderW, shoulderY + 10);
  ctx.lineTo(cx + shoulderW + width * 0.04, height * 0.46);
  ctx.lineTo(cx + shoulderW - width * 0.035, height * 0.46);
  ctx.lineTo(cx + shoulderW - width * 0.02, shoulderY + 24);
  ctx.closePath();
  ctx.fill();

  const byCat = (cat: Garment["category"]) =>
    input.garments.find((g) => g.category === cat);

  const top = byCat("top") || byCat("dress");
  const bottom = byCat("bottom") || (byCat("dress") && !top ? byCat("dress") : undefined);
  const outer = byCat("outerwear");
  const shoes = byCat("shoes");
  const accessory = byCat("accessory");

  // BOTTOM — pants / skirt on legs
  if (bottom) {
    try {
      const img = await loadImage(bottom.imageUrl);
      const leftLeg: Point[] = [
        [cx - hipW * 0.95, hipY - 8],
        [cx - width * 0.02, hipY - 8],
        [cx - width * 0.015, ankleY],
        [cx - calfW * 1.15, ankleY],
        [cx - thighW * 1.05, kneeY],
      ];
      const rightLeg: Point[] = [
        [cx + width * 0.02, hipY - 8],
        [cx + hipW * 0.95, hipY - 8],
        [cx + thighW * 1.05, kneeY],
        [cx + calfW * 1.15, ankleY],
        [cx + width * 0.015, ankleY],
      ];
      const waistBand: Point[] = [
        [cx - hipW, hipY - 30],
        [cx + hipW, hipY - 30],
        [cx + hipW * 0.95, hipY + 20],
        [cx - hipW * 0.95, hipY + 20],
      ];
      paintGarmentOnBody(
        ctx,
        img,
        waistBand,
        { x: cx - hipW * 1.1, y: hipY - 50, w: hipW * 2.2, h: 90 },
        { soft: true }
      );
      paintGarmentOnBody(
        ctx,
        img,
        leftLeg,
        { x: cx - hipW * 1.2, y: hipY - 20, w: hipW * 1.15, h: ankleY - hipY + 40 },
        { soft: true }
      );
      paintGarmentOnBody(
        ctx,
        img,
        rightLeg,
        { x: cx + width * 0.02, y: hipY - 20, w: hipW * 1.15, h: ankleY - hipY + 40 },
        { soft: true }
      );
    } catch {
      // skip broken garment art
    }
  }

  // TOP — shirt / knit on torso
  if (top) {
    try {
      const img = await loadImage(top.imageUrl);
      const torso: Point[] = [
        [cx - shoulderW * 0.92, shoulderY],
        [cx + shoulderW * 0.92, shoulderY],
        [cx + waistW * 1.15, waistY + 20],
        [cx + hipW * 0.75, hipY + 10],
        [cx - hipW * 0.75, hipY + 10],
        [cx - waistW * 1.15, waistY + 20],
      ];
      // sleeves
      const leftSleeve: Point[] = [
        [cx - shoulderW * 0.92, shoulderY],
        [cx - shoulderW * 0.55, shoulderY + 8],
        [cx - shoulderW * 0.7, height * 0.42],
        [cx - shoulderW - width * 0.02, height * 0.42],
        [cx - shoulderW - width * 0.03, shoulderY + 18],
      ];
      const rightSleeve: Point[] = [
        [cx + shoulderW * 0.55, shoulderY + 8],
        [cx + shoulderW * 0.92, shoulderY],
        [cx + shoulderW + width * 0.03, shoulderY + 18],
        [cx + shoulderW + width * 0.02, height * 0.42],
        [cx + shoulderW * 0.7, height * 0.42],
      ];
      paintGarmentOnBody(
        ctx,
        img,
        torso,
        {
          x: cx - shoulderW * 1.05,
          y: shoulderY - 10,
          w: shoulderW * 2.1,
          h: hipY - shoulderY + 40,
        },
        { soft: true }
      );
      paintGarmentOnBody(
        ctx,
        img,
        leftSleeve,
        {
          x: cx - shoulderW - width * 0.05,
          y: shoulderY,
          w: width * 0.16,
          h: height * 0.22,
        },
        { soft: true }
      );
      paintGarmentOnBody(
        ctx,
        img,
        rightSleeve,
        {
          x: cx + shoulderW - width * 0.08,
          y: shoulderY,
          w: width * 0.16,
          h: height * 0.22,
        },
        { soft: true }
      );
    } catch {
      // skip
    }
  }

  // OUTERWEAR
  if (outer) {
    try {
      const img = await loadImage(outer.imageUrl);
      const coat: Point[] = [
        [cx - shoulderW * 1.08, shoulderY - 6],
        [cx + shoulderW * 1.08, shoulderY - 6],
        [cx + hipW * 1.15, height * 0.62],
        [cx - hipW * 1.15, height * 0.62],
      ];
      paintGarmentOnBody(
        ctx,
        img,
        coat,
        {
          x: cx - shoulderW * 1.2,
          y: shoulderY - 20,
          w: shoulderW * 2.4,
          h: height * 0.42,
        },
        { alpha: 0.92, soft: true }
      );
    } catch {
      // skip
    }
  }

  // SHOES
  if (shoes) {
    try {
      const img = await loadImage(shoes.imageUrl);
      const leftShoe: Point[] = [
        [cx - calfW * 1.3, ankleY - 8],
        [cx - width * 0.01, ankleY - 8],
        [cx - width * 0.01, ankleY + 28],
        [cx - calfW * 1.6, ankleY + 28],
      ];
      const rightShoe: Point[] = [
        [cx + width * 0.01, ankleY - 8],
        [cx + calfW * 1.3, ankleY - 8],
        [cx + calfW * 1.6, ankleY + 28],
        [cx + width * 0.01, ankleY + 28],
      ];
      paintGarmentOnBody(
        ctx,
        img,
        leftShoe,
        { x: cx - calfW * 1.8, y: ankleY - 20, w: calfW * 1.9, h: 55 },
        { soft: true }
      );
      paintGarmentOnBody(
        ctx,
        img,
        rightShoe,
        { x: cx + width * 0.005, y: ankleY - 20, w: calfW * 1.9, h: 55 },
        { soft: true }
      );
    } catch {
      // skip
    }
  }

  // Redraw face on top so identity stays sharp
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawCover(ctx, face, cx - headR * 1.15, headY - headR * 1.25, headR * 2.3, headR * 2.3);
  ctx.restore();

  // Face rim
  ctx.strokeStyle = "rgba(201,168,124,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.stroke();

  // Accessory near face (frames etc.)
  if (accessory) {
    try {
      const img = await loadImage(accessory.imageUrl);
      ctx.save();
      ctx.globalAlpha = 0.95;
      const aw = headR * 1.7;
      const ah = headR * 0.55;
      drawCover(ctx, img, cx - aw / 2, headY - ah * 0.15, aw, ah);
      ctx.restore();
    } catch {
      // skip
    }
  }

  // Unified grade
  ctx.fillStyle = "rgba(201,168,124,0.05)";
  ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(cx, height * 0.4, width * 0.2, cx, height * 0.5, height * 0.7);
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.9);
}
