"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDb,
  getDownloadURL,
  getFirebaseStorage,
  isFirebaseConfigured,
  orderBy,
  query,
  ref,
  serverTimestamp,
  setDoc,
  uploadBytes,
} from "@/lib/firebase";
import type {
  Garment,
  Outfit,
  TasteMemory,
  UserProfile,
} from "@/lib/types";
import { normalizeGarmentPublicUrl } from "@/lib/garment-url";

function assertCloud() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase is not configured");
  }
  const db = getDb();
  const storage = getFirebaseStorage();
  if (!db || !storage) throw new Error("Firebase services unavailable");
  return { db, storage };
}

/** Convert a data URL to a Blob for Storage upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(header || "")?.[1] || "image/jpeg";
  const binary = atob(data || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Upload a data URL or return HTTPS URLs unchanged. */
export async function uploadDataUrl(
  path: string,
  image: string
): Promise<string> {
  if (!image) return image;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  // Keep site-relative paths relative — never bake localhost into Firestore
  // (phones cannot load http://localhost:3000/garments/...).
  if (image.startsWith("/")) return image;
  if (!image.startsWith("data:")) return image;

  const { storage } = assertCloud();
  const blob = dataUrlToBlob(image);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, {
    contentType: blob.type || "image/jpeg",
  });
  return getDownloadURL(storageRef);
}

export async function saveUserProfile(
  uid: string,
  profile: Partial<UserProfile> & { taste?: TasteMemory }
): Promise<void> {
  const { db } = assertCloud();
  const refDoc = doc(db, "users", uid);
  const payload: Record<string, unknown> = {
    uid,
    updatedAt: serverTimestamp(),
  };
  const keys: (keyof UserProfile)[] = [
    "email",
    "displayName",
    "photoURL",
    "avatarUrl",
    "avatarStatus",
    "city",
    "lat",
    "lon",
    "stylePrefs",
    "subscriptionStatus",
    "stripeCustomerId",
    "connectedStores",
    "voiceEnabled",
    "createdAt",
  ];
  for (const k of keys) {
    const v = profile[k];
    if (v !== undefined) payload[k] = v;
  }
  if (profile.taste) payload.taste = profile.taste;
  await setDoc(refDoc, payload, { merge: true });
}

export async function loadUserProfile(
  uid: string
): Promise<(Partial<UserProfile> & { taste?: TasteMemory }) | null> {
  const { db } = assertCloud();
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return snap.data() as Partial<UserProfile> & { taste?: TasteMemory };
}

export async function listGarments(uid: string): Promise<Garment[]> {
  const { db } = assertCloud();
  const q = query(collection(db, "users", uid, "garments"), orderBy("updatedAt", "desc"));
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Garment);
  } catch {
    // Fallback if index missing / empty updatedAt
    const snap = await getDocs(collection(db, "users", uid, "garments"));
    return snap.docs.map((d) => d.data() as Garment);
  }
}

/** Ensure garment image is a durable URL, then write to Firestore. */
export async function upsertGarment(
  uid: string,
  garment: Garment
): Promise<Garment> {
  const { db } = assertCloud();
  let imageUrl = garment.imageUrl;
  if (imageUrl?.startsWith("data:")) {
    imageUrl = await uploadDataUrl(
      `users/${uid}/garments/${garment.id}.jpg`,
      imageUrl
    );
  } else if (imageUrl) {
    imageUrl = normalizeGarmentPublicUrl(imageUrl);
  }
  // Keep /garments/* as relative paths — fal resolves them server-side as base64.
  // Never rewrite to localhost; fal cannot fetch your machine.

  const next: Garment = {
    ...garment,
    userId: uid,
    imageUrl,
    updatedAt: new Date().toISOString(),
  };

  // Strip undefined for Firestore
  const clean = JSON.parse(JSON.stringify(next)) as Garment;
  await setDoc(doc(db, "users", uid, "garments", garment.id), clean, {
    merge: true,
  });
  return clean;
}

export async function upsertGarments(
  uid: string,
  items: Garment[]
): Promise<Garment[]> {
  const out: Garment[] = [];
  for (const item of items) {
    out.push(await upsertGarment(uid, item));
  }
  return out;
}

export async function saveCurrentOutfit(
  uid: string,
  outfit: Outfit
): Promise<void> {
  const { db } = assertCloud();
  const clean = JSON.parse(
    JSON.stringify({
      ...outfit,
      userId: uid,
      // Don't persist huge inlined garment data URLs
      garments: (outfit.garments || []).map((g) => ({
        ...g,
        imageUrl: g.imageUrl?.startsWith("data:") ? "" : g.imageUrl,
      })),
    })
  ) as Outfit;
  await setDoc(doc(db, "users", uid, "outfits", outfit.id), clean, {
    merge: true,
  });
  await setDoc(
    doc(db, "users", uid),
    { currentOutfitId: outfit.id, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function loadLatestOutfit(uid: string): Promise<Outfit | null> {
  const { db } = assertCloud();
  const profile = await getDoc(doc(db, "users", uid));
  const currentId = profile.data()?.currentOutfitId as string | undefined;
  if (currentId) {
    const snap = await getDoc(doc(db, "users", uid, "outfits", currentId));
    if (snap.exists()) return snap.data() as Outfit;
  }
  try {
    const q = query(
      collection(db, "users", uid, "outfits"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0]!.data() as Outfit;
  } catch {
    return null;
  }
}

export async function uploadUserAvatar(
  uid: string,
  dataUrl: string
): Promise<string> {
  return uploadDataUrl(`users/${uid}/avatar.jpg`, dataUrl);
}

export async function bootstrapUserCloud(input: {
  uid: string;
  email: string;
  displayName: string;
  avatarDataUrl?: string;
  seedGarments: Garment[];
}): Promise<{
  profile: UserProfile;
  wardrobe: Garment[];
  avatarUrl?: string;
}> {
  assertCloud();
  let avatarUrl: string | undefined;
  if (input.avatarDataUrl) {
    avatarUrl = await uploadUserAvatar(input.uid, input.avatarDataUrl);
  }

  const existing = await listGarments(input.uid);
  let wardrobe = existing;
  if (!existing.length && input.seedGarments.length) {
    const seeded = input.seedGarments.map((g) => ({
      ...g,
      userId: input.uid,
    }));
    wardrobe = await upsertGarments(input.uid, seeded);
  }

  const now = new Date().toISOString();
  const trialEndsAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const profile: UserProfile = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    photoURL: avatarUrl,
    avatarUrl,
    avatarStatus: avatarUrl ? "ready" : "none",
    city: "London",
    lat: 51.5074,
    lon: -0.1278,
    stylePrefs: ["quiet luxury", "old money"],
    subscriptionStatus: "trialing",
    trialEndsAt,
    connectedStores: [],
    voiceEnabled: true,
    createdAt: now,
  };
  await saveUserProfile(input.uid, {
    ...profile,
    taste: { rejectedIds: [], recentOutfitIds: [] },
  });

  return { profile, wardrobe, avatarUrl };
}

export async function hydrateUserFromCloud(uid: string): Promise<{
  profile: Partial<UserProfile> & { taste?: TasteMemory };
  wardrobe: Garment[];
  outfit: Outfit | null;
} | null> {
  if (!isFirebaseConfigured || !getDb()) return null;
  const profile = await loadUserProfile(uid);
  if (!profile) return null;
  const wardrobe = await listGarments(uid);
  const outfit = await loadLatestOutfit(uid);
  return { profile, wardrobe, outfit };
}
