"use client";

import { getFirebaseAuth } from "@/lib/firebase";

/** Authenticated fetch — attaches Firebase ID token for paid API routes. */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (user) {
    headers.set("x-voicedress-uid", user.uid);
    try {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // continue without token — server will 401
    }
  }
  return fetch(input, { ...init, headers });
}
