const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "icon.svg");

async function raster(size, out, padRatio = 0) {
  // padRatio > 0: shrink mark further for maskable safe zone by letterboxing
  if (padRatio <= 0) {
    await sharp(SOURCE)
      .resize(size, size, { fit: "fill" })
      .png()
      .toFile(path.join(ROOT, out));
    console.log(out, size);
    return;
  }
  const inner = Math.round(size * (1 - padRatio * 2));
  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: "fill" })
    .png()
    .toBuffer();
  const inset = Math.round((size - inner) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 0x12, g: 0x11, b: 0x10 },
    },
  })
    .composite([{ input: mark, left: inset, top: inset }])
    .png()
    .toFile(path.join(ROOT, out));
  console.log(out, { size, inner, inset });
}

async function run() {
  fs.copyFileSync(SOURCE, path.join(ROOT, "public/icons/icon-source.svg"));

  // Also ship a standalone mark SVG (thick stroke) for small inline uses
  const markOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="44" viewBox="0 0 64 44" fill="none">
  <rect x="3" y="7" width="5" height="20" rx="2.5" fill="#C9A87C"/>
  <rect x="11.2" y="15" width="5" height="16" rx="2.5" fill="#C9A87C"/>
  <rect x="19.4" y="19.5" width="5" height="14.5" rx="2.5" fill="#F5F0E8"/>
  <rect x="27.6" y="15" width="5" height="16" rx="2.5" fill="#C9A87C"/>
  <rect x="35.8" y="7" width="5" height="20" rx="2.5" fill="#C9A87C"/>
  <path d="M42.2 8.6c3.8 3.1 5.95 7.15 5.95 10.4s-2.15 7.3-5.95 10.4" stroke="#C9A87C" stroke-width="3.2" stroke-linecap="round" fill="none"/>
  <path d="M45.6 5.6c5.35 4.25 8.4 9.7 8.4 13.4s-3.05 9.15-8.4 13.4" stroke="#C9A87C" stroke-width="2.8" stroke-linecap="round" fill="none" opacity="0.7"/>
  <path d="M49 3c6.55 5.2 10.3 11.8 10.3 16s-3.75 10.8-10.3 16" stroke="#C9A87C" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.45"/>
</svg>
`;
  fs.writeFileSync(path.join(ROOT, "public/logo.svg"), markOnly);

  await raster(512, "public/icons/icon-512.png");
  await raster(192, "public/icons/icon-192.png");
  await raster(180, "public/icons/icon-180.png");
  await raster(180, "public/apple-touch-icon.png");
  await raster(512, "public/icons/icon-512-maskable.png", 0.08);
  console.log("done");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
