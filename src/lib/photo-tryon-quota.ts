import type { UserProfile } from "./types";

/** Full on-photo looks per calendar month for trial + paid (swaps excluded). */
export const PAID_PHOTO_TRYONS_PER_MONTH = 30;

type QuotaProfile = Partial<
  Pick<
    UserProfile,
    "photoTryOnsMonthKey" | "photoTryOnsThisMonth" | "photoTryOnCredits"
  >
>;

/** Purchased top-up looks (banked; used after the monthly 30). */
export function photoTryOnCredits(
  profile: QuotaProfile | null | undefined
): number {
  return Math.max(0, Math.floor(Number(profile?.photoTryOnCredits || 0)));
}

/** UTC calendar month key used for quota rollover. */
export function currentPhotoTryOnMonthKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Looks used this calendar month (0 if month rolled over). */
export function photoTryOnsUsedThisMonth(
  profile: QuotaProfile | null | undefined,
  now = new Date()
): number {
  const key = currentPhotoTryOnMonthKey(now);
  if ((profile?.photoTryOnsMonthKey || "") !== key) return 0;
  return Math.max(0, Number(profile?.photoTryOnsThisMonth || 0));
}

/** Included monthly looks still available (not counting top-up credits). */
export function photoTryOnsRemaining(
  profile: QuotaProfile | null | undefined,
  now = new Date()
): number {
  return Math.max(
    0,
    PAID_PHOTO_TRYONS_PER_MONTH - photoTryOnsUsedThisMonth(profile, now)
  );
}

/** Monthly allowance left + banked top-ups. */
export function photoTryOnsAvailable(
  profile: QuotaProfile | null | undefined,
  now = new Date()
): number {
  return photoTryOnsRemaining(profile, now) + photoTryOnCredits(profile);
}

export function hasMonthlyPhotoTryOnQuota(
  profile: QuotaProfile | null | undefined,
  now = new Date()
): boolean {
  return photoTryOnsAvailable(profile, now) > 0;
}
