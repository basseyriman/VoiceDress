import { AVATAR_IDB_REF, loadAvatarBlob } from "@/lib/avatar-storage";
import { isSeedWardrobe } from "@/lib/seed-data";
import type { Garment, UserProfile } from "@/lib/types";

type AvatarFields = Pick<
  UserProfile,
  "avatarUrl" | "photoURL" | "avatarStatus"
>;

/** True when the user must complete the Wispr-style photo ritual before the app. */
export function needsPhotoOnboarding(
  user: AvatarFields | null | undefined
): boolean {
  if (!user) return false;
  // Explicit ready wins — even if persist swapped the data URL for an IDB marker
  if (user.avatarStatus === "ready") return false;

  const url = user.avatarUrl || user.photoURL;
  if (!url || url === "") return true;
  if (url === AVATAR_IDB_REF) return false;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
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
