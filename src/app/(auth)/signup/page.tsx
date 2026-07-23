"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Logo } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";
import {
  createUserWithEmailAndPassword,
  getFirebaseAuth,
  isFirebaseConfigured,
  updateProfile,
} from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();
  const signInLocal = useAetherStore((s) => s.signInLocal);
  const setAvatar = useAetherStore((s) => s.setAvatar);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (isFirebaseConfigured) {
        const auth = getFirebaseAuth();
        if (auth) {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await updateProfile(cred.user, { displayName: name });
        }
      }
      signInLocal({
        email,
        displayName: name || email.split("@")[0],
        photoURL: photoPreview || undefined,
        avatarStatus: photoPreview ? "generating" : "none",
        subscriptionStatus: "trialing",
      });
      if (photoPreview) {
        // Kick avatar generation (Tripo/Meshy pipeline via API)
        fetch("/api/avatar/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: photoPreview, name }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.avatarUrl) setAvatar(data.avatarUrl, "ready");
            else setAvatar(photoPreview, "ready");
          })
          .catch(() => setAvatar(photoPreview, "ready"));
      }
      router.push("/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
      // Fallback to local mode
      signInLocal({
        email,
        displayName: name || "Aether Member",
        photoURL: photoPreview || undefined,
        avatarStatus: photoPreview ? "ready" : "none",
        avatarUrl: photoPreview || undefined,
        subscriptionStatus: "trialing",
      });
      router.push("/today");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <Logo className="mb-10 justify-center" />
      <div className="glass shine-border rounded-[2rem] p-8">
        <h1 className="font-display text-3xl text-ivory">Create Aether</h1>
        <p className="mt-2 text-sm text-mist">
          One photo for your lookalike avatar. Then speak — never type your closet.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
              Name
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
              placeholder="Bassey"
            />
          </label>
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
              placeholder="you@studio.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
              Password
            </span>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
              placeholder="••••••••"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
              Your photo → lookalike avatar
            </span>
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line p-4">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-stone">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-mist">
                    Photo
                  </div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onPhoto(e.target.files?.[0])}
                className="text-xs text-mist file:mr-3 file:rounded-full file:border-0 file:bg-champagne/20 file:px-3 file:py-1.5 file:text-xs file:text-champagne"
              />
            </div>
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Enter Aether"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-mist">
          Already a member?{" "}
          <Link href="/login" className="text-champagne hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
