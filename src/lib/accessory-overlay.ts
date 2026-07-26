/** Premium accessory overlays — never rewrite the face with AI. */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise(async (resolve, reject) => {
    try {
      let url = src;
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

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export type AccessoryOverlayInput = {
  personImage: string;
  glassesImageUrl?: string;
  watchImageUrl?: string;
};

/**
 * Draw glasses + watch onto the already-dressed photo.
 * Keeps the person's face/body pixels untouched by generative AI.
 */
export async function overlayAccessoriesOnLook(
  input: AccessoryOverlayInput
): Promise<{ url: string; applied: ("glasses" | "watch")[] }> {
  const person = await loadImage(input.personImage);
  const w = person.width;
  const h = person.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { url: input.personImage, applied: [] };
  }

  ctx.drawImage(person, 0, 0, w, h);
  const applied: ("glasses" | "watch")[] = [];

  if (input.glassesImageUrl) {
    try {
      const glasses = await loadImage(input.glassesImageUrl);
      // Full-body: eyes sit ~16–19% down, frames ~16–20% of width
      const gw = w * 0.2;
      const gh = h * 0.055;
      const gx = w * 0.5 - gw / 2;
      const gy = h * 0.155;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 6;
      drawContain(ctx, glasses, gx, gy, gw, gh);
      ctx.restore();
      applied.push("glasses");
    } catch {
      // skip
    }
  }

  if (input.watchImageUrl) {
    try {
      const watch = await loadImage(input.watchImageUrl);
      // Standing pose: most visible wrist is often camera-right forearm
      const ww = w * 0.09;
      const wh = h * 0.055;
      const wx = w * 0.62;
      const wy = h * 0.48;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 5;
      // Clip to a soft rounded rect so the product plate doesn’t look like a sticker
      const r = Math.min(ww, wh) * 0.22;
      ctx.beginPath();
      ctx.moveTo(wx + r, wy);
      ctx.arcTo(wx + ww, wy, wx + ww, wy + wh, r);
      ctx.arcTo(wx + ww, wy + wh, wx, wy + wh, r);
      ctx.arcTo(wx, wy + wh, wx, wy, r);
      ctx.arcTo(wx, wy, wx + ww, wy, r);
      ctx.closePath();
      ctx.clip();
      drawContain(ctx, watch, wx, wy, ww, wh);
      ctx.restore();
      applied.push("watch");
    } catch {
      // skip
    }
  }

  return {
    url: canvas.toDataURL("image/jpeg", 0.93),
    applied,
  };
}
