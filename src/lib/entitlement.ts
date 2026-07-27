import type { UserProfile } from "./types";

/** Gifted on-photo dresses before starting a 7-day trial. */
export const FREE_PHOTO_TRYONS = 1;

/** Full on-photo looks per calendar month for trial + paid (swaps excluded). */
export const PAID_PHOTO_TRYONS_PER_MONTH = 30;

type EntitlementProfile = Partial<
  Pick<
    UserProfile,
    | "subscriptionStatus"
    | "trialEndsAt"
    | "createdAt"
    | "freePhotoTryOnsUsed"
    | "photoTryOnsMonthKey"
    | "photoTryOnsThisMonth"
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

/** UTC calendar month key used for quota rollover. */
export function currentPhotoTryOnMonthKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Looks used this calendar month (0 if month rolled over). */
export function photoTryOnsUsedThisMonth(
  profile: EntitlementProfile | null | undefined,
  now = new Date()
): number {
  const key = currentPhotoTryOnMonthKey(now);
  if ((profile?.photoTryOnsMonthKey || "") !== key) return 0;
  return Math.max(0, Number(profile?.photoTryOnsThisMonth || 0));
}

export function photoTryOnsRemaining(
  profile: EntitlementProfile | null | undefined,
  now = new Date()
): number {
  return Math.max(
    0,
    PAID_PHOTO_TRYONS_PER_MONTH - photoTryOnsUsedThisMonth(profile, now)
  );
}

export function hasMonthlyPhotoTryOnQuota(
  profile: EntitlementProfile | null | undefined,
  now = new Date()
): boolean {
  return photoTryOnsUsedThisMonth(profile, now) < PAID_PHOTO_TRYONS_PER_MONTH;
}

/**
 * Can start another full on-photo dress:
 * - membership under monthly cap, or
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
