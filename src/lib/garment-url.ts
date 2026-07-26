/** Hosts that only work on the machine that stored the URL — never on a phone. */
function isLoopbackOrUnreachableHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]") {
    return true;
  }
  // Private LAN absolutes also break when the page host differs (e.g. production).
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

/**
 * Normalize garment image URLs for display and try-on.
 * - Strip localhost / private-IP absolutes → `/garments/...` so phones can load them
 * - Map leftover `.png` seed paths to `.jpg` when that was the published form
 */
export function normalizeGarmentPublicUrl(imageUrl: string): string {
  if (!imageUrl) return imageUrl;

  let url = imageUrl.trim();

  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      if (
        parsed.pathname.startsWith("/garments/") &&
        isLoopbackOrUnreachableHost(parsed.hostname)
      ) {
        url = parsed.pathname;
      } else {
        return url;
      }
    }
  } catch {
    // keep as-is
  }

  if (!url.startsWith("/garments/")) return url;

  const path = url.split("?")[0] || url;
  if (path.endsWith(".png")) return path.replace(/\.png$/i, ".jpg");
  return path;
}
