"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/ui/auth-shell";
import { FieldError, FieldLabel, TextField } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
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
  const [fileLabel, setFileLabel] = useState("Full-body or clear portrait");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const libraryRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const onPhoto = async (file?: File, source?: "library" | "camera") => {
    if (!file) return;
    setError("");
    setFileLabel(
      source === "camera" ? "Captured from camera" : file.name || "Photo selected"
    );
    const result = await prepareProfilePhoto(file);
    if (result.error || !result.dataUrl) {
      setPhotoPreview(null);
      setError(result.error || "That photo couldn’t be used. Try another.");
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
        avatarDataUrl: photoPreview || undefined,
      });
      router.push("/today");
    } catch (err) {
      setError(authErrorMessage(err, "Couldn’t create your account. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create VoiceDress"
      subtitle="Add your name, then one clear photo. Speak the day — we dress the look on you."
      footer={
        <>
          Already a member?{" "}
          <Link href="/login" className="text-champagne transition hover:text-[#d4b68c]">
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

        <div className="block">
          <FieldLabel hint="Optional for now">Your photo</FieldLabel>
          <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line/80 bg-ink-soft/40 p-4 transition hover:border-champagne/30">
            <div className="h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-2xl bg-stone ring-1 ring-line">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] tracking-wide text-mist">
                  Photo
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
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
                    "inline-flex items-center gap-1.5 rounded-full border border-line bg-champagne/15 px-3.5 py-1.5 text-xs text-champagne transition hover:bg-champagne/25"
                  )}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Choose photo
                </button>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3.5 py-1.5 text-xs text-ivory transition hover:border-champagne/40"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Take photo
                </button>
              </div>
              <p className="truncate text-[11px] leading-snug text-mist">
                {fileLabel}
              </p>
            </div>
          </div>
          <CameraCaptureModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onCapture={(file) => void onPhoto(file, "camera")}
          />
        </div>

        <FieldError>{error}</FieldError>
        <Button type="submit" className="mt-1 w-full" disabled={loading}>
          {loading ? "Creating your account…" : "Start dressing"}
        </Button>
      </form>
    </AuthShell>
  );
}
