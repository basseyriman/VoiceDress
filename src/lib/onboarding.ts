import { AVATAR_IDB_REF, loadAvatarBlob } from "@/lib/avatar-storage";
import { isSeedWardrobe } from "@/lib/seed-data";
import type { Garment, UserProfile } from "@/lib/types";

type AvatarFields = Pick<
  UserProfile,
  "avatarUrl" | "photoURL" | "avatarStatus"
>;

function hasUsablePhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url === AVATAR_IDB_REF) return true;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  );
}

/** True when the user must complete the Wispr-style photo ritual before the app. */
export function needsPhotoOnboarding(
  user: AvatarFields | null | undefined
): boolean {
  if (!user) return false;
  // Explicit ready wins — even if persist swapped the data URL for an IDB marker
  if (user.avatarStatus === "ready") return false;
  // Any durable photo means setup is done (don’t restart on login)
  if (hasUsablePhotoUrl(user.avatarUrl) || hasUsablePhotoUrl(user.photoURL)) {
    return false;
  }
  return true;
}

/** Real closet pieces — not the old placeholder seed set. */
export function hasRealWardrobe(
  wardrobe: Garment[] | null | undefined
): boolean {
  if (!wardrobe?.length) return false;
  if (isSeedWardrobe(wardrobe)) return false;
  return wardrobe.some(
    (g) => !g.id.startsWith("seed_") && !g.id.startsWith("seed_v")
  );
}

export function needsWardrobeSetup(
  wardrobe: Garment[] | null | undefined
): boolean {
  return !hasRealWardrobe(wardrobe);
}

export type PostAuthPath =
  | "/onboarding/style"
  | "/onboarding/photo"
  | "/onboarding/wardrobe"
  | "/today";

export function postAuthPath(
  user: AvatarFields | null | undefined,
  wardrobe?: Garment[] | null
): PostAuthPath {
  if (needsPhotoOnboarding(user)) return "/onboarding/style";
  if (needsWardrobeSetup(wardrobe)) return "/onboarding/wardrobe";
  return "/today";
}

/** If IndexedDB has a body photo, treat photo onboarding as done. */
export async function hasLocalBodyPhoto(): Promise<boolean> {
  const blob = await loadAvatarBlob();
  return Boolean(
    blob &&
      (blob.startsWith("data:") ||
        blob.startsWith("http") ||
        blob.startsWith("blob:"))
  );
}

/**
 * After cloud hydrate, recover a finished photo from IndexedDB when Firestore
 * hasn’t caught up yet (common on mobile if they left mid-upload).
 */
export async function recoverLocalPhotoIfNeeded(
  user: AvatarFields | null | undefined
): Promise<Partial<UserProfile> | null> {
  if (!user || !needsPhotoOnboarding(user)) return null;
  const blob = await loadAvatarBlob();
  if (
    !blob ||
    !(
      blob.startsWith("data:") ||
      blob.startsWith("http") ||
      blob.startsWith("blob:")
    )
  ) {
    return null;
  }
  return {
    avatarUrl: blob,
    photoURL: blob.startsWith("http") ? blob : user.photoURL,
    avatarStatus: "ready",
  };
}
