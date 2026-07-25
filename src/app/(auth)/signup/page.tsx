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
  createUserWithEmailAndPassword,
  getFirebaseAuth,
  isFirebaseConfigured,
  updateProfile,
} from "@/lib/firebase";
import { authErrorMessage } from "@/lib/auth-errors";
import { postAuthPath } from "@/lib/onboarding";

export default function SignupPage() {
  const router = useRouter();
  const bootstrapCloudUser = useAetherStore((s) => s.bootstrapCloudUser);
  const [name, setName] = useState("");
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
        setError("Accounts aren’t available right now. Please try again later.");
        return;
      }
      const auth = getFirebaseAuth();
      if (!auth) {
        setError("Accounts aren’t available right now. Please try again later.");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await bootstrapCloudUser({
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: name || email.split("@")[0],
      });
      const user = useAetherStore.getState().user;
      router.push(postAuthPath(user));
    } catch (err) {
      setError(
        authErrorMessage(err, "Couldn’t create your account. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create VoiceDress"
      subtitle="Create your account. Next, we’ll take one clear photo so we can dress looks on you."
      footer={
        <>
          Already a member?{" "}
          <Link
            href="/login"
            className="text-champagne transition hover:text-[#d4b68c]"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <TextField
          label="Full name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How should we greet you?"
        />
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
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a password"
          hint="6+ characters"
          autoComplete="new-password"
        />
        <FieldError>{error}</FieldError>
        <Button type="submit" className="mt-1 w-full" disabled={loading}>
          {loading ? "Creating your account…" : "Continue"}
        </Button>
      </form>
    </AuthShell>
  );
}
