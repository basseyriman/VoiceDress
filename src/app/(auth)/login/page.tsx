"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/ui/auth-shell";
import { FieldError, TextField } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { useAetherStore } from "@/store/aether-store";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  signInWithEmailAndPassword,
} from "@/lib/firebase";
import { authErrorMessage } from "@/lib/auth-errors";
import {
  postAuthPath,
  recoverLocalPhotoIfNeeded,
} from "@/lib/onboarding";

export default function LoginPage() {
  const router = useRouter();
  const hydrateFromCloud = useAetherStore((s) => s.hydrateFromCloud);
  const hydrateAvatar = useAetherStore((s) => s.hydrateAvatar);
  const bootstrapCloudUser = useAetherStore((s) => s.bootstrapCloudUser);
  const updateUser = useAetherStore((s) => s.updateUser);
  const setAvatar = useAetherStore((s) => s.setAvatar);
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
        setError("Sign-in isn’t available right now. Please try again later.");
        return;
      }
      const auth = getFirebaseAuth();
      if (!auth) {
        setError("Sign-in isn’t available right now. Please try again later.");
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const ok = await hydrateFromCloud(cred.user.uid);
      if (!ok) {
        await bootstrapCloudUser({
          uid: cred.user.uid,
          email: cred.user.email || email,
          displayName:
            cred.user.displayName || email.split("@")[0] || "VoiceDress Member",
        });
      }
      await hydrateAvatar();
      const recovered = await recoverLocalPhotoIfNeeded(
        useAetherStore.getState().user
      );
      if (recovered?.avatarUrl?.startsWith("data:")) {
        // Re-upload so cloud profile matches this device
        await setAvatar(recovered.avatarUrl, "ready");
      } else if (recovered) {
        updateUser(recovered);
      }
      const user = useAetherStore.getState().user;
      const wardrobe = useAetherStore.getState().wardrobe;
      router.push(postAuthPath(user, wardrobe));
    } catch (err) {
      setError(authErrorMessage(err, "Couldn’t sign in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Your wardrobe and looks are waiting in the cloud."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="text-champagne transition hover:text-[#d4b68c]"
          >
            Create account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <TextField
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@email.com"
        />
        <PasswordInput
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
        />
        <FieldError>{error}</FieldError>
        <Button type="submit" className="mt-1 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
