"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon } from "lucide-react";
import { Button, Logo } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";
import {
  createUserWithEmailAndPassword,
  getFirebaseAuth,
  isFirebaseConfigured,
  updateProfile,
} from "@/lib/firebase";
import { authErrorMessage } from "@/lib/auth-errors";
import { prepareProfilePhoto } from "@/lib/image";
import { cn } from "@/lib/utils";
import { CameraCaptureModal } from "@/components/wardrobe/camera-capture-modal";

export default function SignupPage() {
  const router = useRouter();
  const bootstrapCloudUser = useAetherStore((s) => s.bootstrapCloudUser);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState("JPG, PNG, or HEIC");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const libraryRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const onPhoto = async (file?: File, source?: "library" | "camera") => {
    if (!file) return;
    setError("");
    setFileLabel(
      source === "camera" ? "Photo from camera" : file.name || "Photo selected"
    );
    const result = await prepareProfilePhoto(file);
    if (result.error || !result.dataUrl) {
      setPhotoPreview(null);
      setError(result.error || "Invalid photo");
      return;
    }
    setPhotoPreview(result.dataUrl);
  };

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

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await bootstrapCloudUser({
        uid: cred.user.uid,
        email: cred.user.email || email,
        displayName: name || email.split("@")[0],
        avatarDataUrl: photoPreview || undefined,
      });
      router.push("/today");
    } catch (err) {
      setError(authErrorMessage(err, "Could not create account"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <Logo className="mb-10 justify-center" />
      <div className="glass shine-border rounded-[2rem] p-8">
        <h1 className="font-display text-3xl text-ivory">Create VoiceDress</h1>
        <p className="mt-2 text-sm text-mist">
          One clear photo. Then speak the day — never type your closet. Your
          wardrobe saves to the cloud.
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
          <div className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
              Your photo → dressed look
            </span>
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-stone">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-mist">
                    Photo
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  ref={libraryRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    void onPhoto(e.target.files?.[0], "library");
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => libraryRef.current?.click()}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-line bg-champagne/15 px-3 py-1.5 text-xs text-champagne transition hover:bg-champagne/25"
                    )}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Choose photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 py-1.5 text-xs text-ivory transition hover:border-champagne/40"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Take photo
                  </button>
                </div>
                <p className="truncate text-[11px] text-mist">{fileLabel}</p>
              </div>
            </div>
            <CameraCaptureModal
              open={cameraOpen}
              onClose={() => setCameraOpen(false)}
              onCapture={(file) => void onPhoto(file, "camera")}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Enter VoiceDress"}
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
