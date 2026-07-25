"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Logo } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { useAetherStore } from "@/store/aether-store";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  signInWithEmailAndPassword,
} from "@/lib/firebase";
import { authErrorMessage } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const hydrateFromCloud = useAetherStore((s) => s.hydrateFromCloud);
  const bootstrapCloudUser = useAetherStore((s) => s.bootstrapCloudUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (!isFirebaseConfigured) {
        setError(
          "Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* keys to .env.local (and Vercel)."
        );
        return;
      }
      const auth = getFirebaseAuth();
      if (!auth) {
        setError("Firebase Auth unavailable.");
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const ok = await hydrateFromCloud(cred.user.uid);
      if (!ok) {
        // First login after Auth existed before cloud bootstrap
        await bootstrapCloudUser({
          uid: cred.user.uid,
          email: cred.user.email || email,
          displayName:
            cred.user.displayName || email.split("@")[0] || "VoiceDress Member",
          avatarDataUrl: undefined,
        });
      }
      router.push("/today");
    } catch (err) {
      setError(authErrorMessage(err, "Sign in failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <Logo className="mb-10 justify-center" />
      <div className="glass shine-border rounded-[2rem] p-8">
        <h1 className="font-display text-3xl text-ivory">Welcome back</h1>
        <p className="mt-2 text-sm text-mist">
          Your wardrobe restores from the cloud.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
              Email
            </span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
              Password
            </span>
            <PasswordInput
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-mist">
          New here?{" "}
          <Link href="/signup" className="text-champagne hover:underline">
            Create VoiceDress
          </Link>
        </p>
      </div>
    </div>
  );
}
