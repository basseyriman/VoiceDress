/** Create a stylized lookalike avatar canvas from a portrait photo. */

export async function stylizeAsAvatar(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const size = 768;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Soft studio background
  const bg = ctx.createRadialGradient(
    size * 0.5,
    size * 0.35,
    size * 0.1,
    size * 0.5,
    size * 0.5,
    size * 0.7
  );
  bg.addColorStop(0, "#2a261f");
  bg.addColorStop(0.55, "#161512");
  bg.addColorStop(1, "#0b0b0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Cover-crop toward upper face
  const scale = Math.max(size / img.width, size / img.height) * 1.08;
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2 - h * 0.06;
  ctx.drawImage(img, x, y, w, h);

  // Warm grade + vignette so it reads as an “avatar”, not a raw dump
  ctx.fillStyle = "rgba(201,168,124,0.08)";
  ctx.fillRect(0, 0, size, size);

  const vignette = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.25,
    size / 2,
    size / 2,
    size * 0.72
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  // Soft circular matte hint
  ctx.strokeStyle = "rgba(201,168,124,0.28)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();

  return canvas.toDataURL("image/jpeg", 0.85);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
