import type { UserProfile } from "./types";
import { hasMonthlyPhotoTryOnQuota } from "./photo-tryon-quota";

export {
  PAID_PHOTO_TRYONS_PER_MONTH,
  photoTryOnCredits,
  currentPhotoTryOnMonthKey,
  photoTryOnsUsedThisMonth,
  photoTryOnsRemaining,
  photoTryOnsAvailable,
  hasMonthlyPhotoTryOnQuota,
} from "./photo-tryon-quota";

/** Gifted on-photo dresses before starting a 7-day trial. */
export const FREE_PHOTO_TRYONS = 1;

type EntitlementProfile = Partial<
  Pick<
    UserProfile,
    | "subscriptionStatus"
    | "trialEndsAt"
    | "createdAt"
    | "freePhotoTryOnsUsed"
    | "photoTryOnsMonthKey"
    | "photoTryOnsThisMonth"
    | "photoTryOnCredits"
  >
>;

/** Active paid plan or unexpired trial (no founder-comp check — server adds that). */
export function isMembershipActive(profile: EntitlementProfile | null | undefined): boolean {
  if (!profile) return false;
  const status = profile.subscriptionStatus || "none";
  if (status === "active") return true;
  if (status === "trialing") {
    const end =
      profile.trialEndsAt ||
      (profile.createdAt
        ? new Date(
            new Date(profile.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000
          ).toISOString()
        : null);
    if (!end) return true;
    return Date.now() < new Date(end).getTime();
  }
  return false;
}

export function freePhotoTryOnsUsed(profile: EntitlementProfile | null | undefined): number {
  return Math.max(0, Number(profile?.freePhotoTryOnsUsed || 0));
}

/**
 * Can start another full on-photo dress:
 * - membership with monthly looks or top-up credits left, or
 * - unused free gift (non-members).
 */
export function canStartPhotoTryOn(
  profile: EntitlementProfile | null | undefined
): boolean {
  if (isMembershipActive(profile)) {
    return hasMonthlyPhotoTryOnQuota(profile);
  }
  return freePhotoTryOnsUsed(profile) < FREE_PHOTO_TRYONS;
}

/** Soft paywall: they just used their free dress and aren't on a trial/plan yet. */
export function shouldOfferTrial(
  profile: EntitlementProfile | null | undefined
): boolean {
  if (!profile) return false;
  if (isMembershipActive(profile)) return false;
  const status = profile.subscriptionStatus || "none";
  if (status !== "none") return false;
  return freePhotoTryOnsUsed(profile) >= FREE_PHOTO_TRYONS;
}
