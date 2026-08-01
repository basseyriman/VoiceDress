import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function projectId(): string | null {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    null
  );
}

/**
 * Verify a Firebase ID token without Firebase Admin (JWKS).
 * Works when only the client Firebase project id is configured.
 */
export async function verifyFirebaseIdToken(
  token: string
): Promise<{ uid: string; email?: string } | null> {
  const pid = projectId();
  if (!pid) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${pid}`,
      audience: pid,
    });
    const uid = typeof payload.sub === "string" ? payload.sub : null;
    if (!uid) return null;
    const email =
      typeof payload.email === "string" ? payload.email : undefined;
    return { uid, email };
  } catch {
    return null;
  }
}
