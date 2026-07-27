const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOGO = path.join(ROOT, "public", "logo.svg");

async function makeIcon({ size, padRatio, out }) {
  const canvas = size;
  const pad = Math.round(canvas * padRatio);
  const maxW = canvas - pad * 2;
  const maxH = canvas - pad * 2;
  const logoAspect = 58 / 40;
  let w = maxW;
  let h = Math.round(w / logoAspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h * logoAspect);
  }
  const logoBuf = await sharp(LOGO)
    .resize(w, h, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const left = Math.round((canvas - w) / 2);
  const top = Math.round((canvas - h) / 2);
  await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 3,
      background: { r: 0x12, g: 0x11, b: 0x10 },
    },
  })
    .composite([{ input: logoBuf, left, top }])
    .png()
    .toFile(path.join(ROOT, out));
  console.log(out, { w, h, left, top, pad });
}

async function run() {
  // 20% padding — same mark as in-app /logo.svg, clear of rounded corners
  await makeIcon({ size: 512, padRatio: 0.2, out: "public/icons/icon-512.png" });
  await makeIcon({ size: 192, padRatio: 0.2, out: "public/icons/icon-192.png" });
  await makeIcon({ size: 180, padRatio: 0.2, out: "public/icons/icon-180.png" });
  await makeIcon({ size: 180, padRatio: 0.2, out: "public/apple-touch-icon.png" });
  // maskable needs a larger safe zone
  await makeIcon({
    size: 512,
    padRatio: 0.24,
    out: "public/icons/icon-512-maskable.png",
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#121110"/>
  <g transform="translate(102.4 143.2) scale(5.3)">
    <rect x="3" y="5" width="3.4" height="20" rx="1.7" fill="#C9A87C"/>
    <rect x="9.2" y="13" width="3.4" height="16" rx="1.7" fill="#C9A87C"/>
    <rect x="15.4" y="17.5" width="3.4" height="14.5" rx="1.7" fill="#F5F0E8"/>
    <rect x="21.6" y="13" width="3.4" height="16" rx="1.7" fill="#C9A87C"/>
    <rect x="27.8" y="5" width="3.4" height="20" rx="1.7" fill="#C9A87C"/>
    <path d="M32.7 6.6c3.8 3.1 5.95 7.15 5.95 10.4s-2.15 7.3-5.95 10.4" stroke="#C9A87C" stroke-width="1.75" stroke-linecap="round" fill="none"/>
    <path d="M35.5 3.6c5.35 4.25 8.4 9.7 8.4 13.4s-3.05 9.15-8.4 13.4" stroke="#C9A87C" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"/>
    <path d="M38.2 1c6.55 5.2 10.3 11.8 10.3 16s-3.75 10.8-10.3 16" stroke="#C9A87C" stroke-width="1.35" stroke-linecap="round" fill="none" opacity="0.26"/>
  </g>
</svg>
`;
  fs.writeFileSync(path.join(ROOT, "public/icons/icon-source.svg"), svg);
  fs.writeFileSync(path.join(ROOT, "public/icon.svg"), svg);
  console.log("done");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
