const DB_NAME = "voicedress-media";
const STORE = "blobs";
const AVATAR_KEY = "user-avatar";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAvatarBlob(dataUrl: string): Promise<void> {
  return saveBlob(AVATAR_KEY, dataUrl);
}

export async function loadAvatarBlob(): Promise<string | null> {
  return loadBlob(AVATAR_KEY);
}

export async function clearAvatarBlob(): Promise<void> {
  return deleteBlob(AVATAR_KEY);
}

export async function saveBlob(key: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadBlob(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

/** Marker stored in localStorage instead of the huge base64 string */
export const AVATAR_IDB_REF = "idb:user-avatar";

export function isAvatarRef(url?: string | null) {
  return url === AVATAR_IDB_REF || Boolean(url?.startsWith("data:"));
}
