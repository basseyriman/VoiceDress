import { AVATAR_IDB_REF } from "@/lib/avatar-storage";
import type { UserProfile } from "@/lib/types";

/** True when the user must complete the Wispr-style photo ritual before the app. */
export function needsPhotoOnboarding(
  user:
    | Pick<UserProfile, "avatarUrl" | "photoURL" | "avatarStatus">
    | null
    | undefined
): boolean {
  if (!user) return false;
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
  return user.avatarStatus !== "ready";
}

export function postAuthPath(
  user:
    | Pick<UserProfile, "avatarUrl" | "photoURL" | "avatarStatus">
    | null
    | undefined
): "/onboarding/photo" | "/today" {
  return needsPhotoOnboarding(user) ? "/onboarding/photo" : "/today";
}
