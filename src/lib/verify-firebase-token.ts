import { createPublicKey, verify } from "node:crypto";

type Jwk = {
  kid: string;
  kty: string;
  n: string;
  e: string;
};

type FirebaseJwtPayload = {
  sub?: string;
  user_id?: string;
  email?: string;
  aud?: string;
  iss?: string;
  exp?: number;
};

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

function projectId(): string | null {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    null
  );
}

function b64urlJson<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

async function getFirebaseJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < 60 * 60 * 1000) {
    return jwksCache.keys;
  }
  const res = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  );
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = data.keys || [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

/**
 * Verify a Firebase ID token without firebase-admin / jose.
 * Uses Google JWKS + Node crypto so installs stay conflict-free on Vercel.
 */
export async function verifyFirebaseIdToken(
  token: string
): Promise<{ uid: string; email?: string } | null> {
  const pid = projectId();
  if (!pid || !token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const header = b64urlJson<{ kid?: string; alg?: string }>(headerB64);
  const payload = b64urlJson<FirebaseJwtPayload>(payloadB64);
  if (!header?.kid || !payload) return null;
  if (header.alg && header.alg !== "RS256") return null;
  if (payload.aud !== pid) return null;
  if (payload.iss !== `https://securetoken.google.com/${pid}`) return null;
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;

  try {
    const keys = await getFirebaseJwks();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = createPublicKey({ key: jwk, format: "jwk" });
    const data = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(sigB64, "base64url");
    const ok = verify("RSA-SHA256", data, key, signature);
    if (!ok) return null;

    const uid = payload.user_id || payload.sub;
    if (!uid) return null;
    return { uid, email: payload.email };
  } catch {
    return null;
  }
}
