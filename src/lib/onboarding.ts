import { AVATAR_IDB_REF, loadAvatarBlob } from "@/lib/avatar-storage";
import type { UserProfile } from "@/lib/types";

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

export function postAuthPath(
  user: AvatarFields | null | undefined
): "/onboarding/photo" | "/today" {
  return needsPhotoOnboarding(user) ? "/onboarding/photo" : "/today";
}

/** If IndexedDB has a body photo, treat onboarding as done. */
export async function hasLocalBodyPhoto(): Promise<boolean> {
  const blob = await loadAvatarBlob();
  return Boolean(
    blob &&
      (blob.startsWith("data:") ||
        blob.startsWith("http") ||
        blob.startsWith("blob:"))
  );
}
