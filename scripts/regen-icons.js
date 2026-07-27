const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "icon.svg");

async function raster(size, out, padRatio = 0) {
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
