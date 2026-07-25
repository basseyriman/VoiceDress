import { AVATAR_IDB_REF, loadAvatarBlob, saveAvatarBlob } from "@/lib/avatar-storage";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolve a displayable body photo for the UI / try-on.
 * Prefer IndexedDB (reliable local data URL) over Storage URLs that can 403/CORS-break.
 */
export async function resolveDisplayAvatar(
  storeUrl?: string | null
): Promise<string | undefined> {
  const local = await loadAvatarBlob();
  if (local?.startsWith("data:")) return local;
  if (local?.startsWith("blob:")) return local;

  if (!storeUrl || storeUrl === AVATAR_IDB_REF) {
    return local || undefined;
  }

  if (storeUrl.startsWith("data:") || storeUrl.startsWith("blob:")) {
    return storeUrl;
  }

  if (storeUrl.startsWith("http://") || storeUrl.startsWith("https://")) {
    try {
      const res = await fetch(storeUrl);
      if (res.ok) {
        const dataUrl = await blobToDataUrl(await res.blob());
        if (dataUrl.startsWith("data:")) {
          void saveAvatarBlob(dataUrl).catch(() => undefined);
          return dataUrl;
        }
      }
    } catch {
      // fall through
    }
    // Last resort: return the URL for plain <img> (may still work without canvas)
    return storeUrl;
  }

  return undefined;
}
