"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, SwitchCamera, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Facing = "user" | "environment";

/**
 * Live device camera capture via getUserMedia.
 * (File input capture= often opens the gallery on desktop — this does not.)
 */
export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("user");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const start = async () => {
      setError("");
      setReady(false);
      stopStream();

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera isn’t available in this browser. Use Choose photo, or try Chrome/Safari on a device with a camera."
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 1920 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError(
            "Camera permission blocked. Allow camera access in your browser settings, then try again."
          );
        } else if (name === "NotFoundError") {
          setError("No camera found on this device. Use Choose photo instead.");
        } else {
          setError("Couldn’t start the camera. Use Choose photo, or check permissions.");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facing]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const snap = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror selfie so it matches what user sees in preview
    if (facing === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `voicedress-camera-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        stopStream();
        onCapture(file);
        onClose();
      },
      "image/jpeg",
      0.92
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/85 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="glass shine-border relative w-full max-w-md overflow-hidden rounded-[1.5rem] sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="font-display text-lg text-ivory">Take photo</p>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-mist hover:bg-white/5 hover:text-ivory"
            aria-label="Close camera"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[3/4] bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={cn(
              "h-full w-full object-cover",
              facing === "user" && "scale-x-[-1]"
            )}
          />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-mist">
              Starting camera…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4">
          <button
            type="button"
            onClick={() =>
              setFacing((f) => (f === "user" ? "environment" : "user"))
            }
            className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs text-mist hover:border-champagne/40 hover:text-ivory"
          >
            <SwitchCamera className="h-3.5 w-3.5" />
            Flip
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={snap}
            className="inline-flex items-center gap-2 rounded-full bg-champagne px-5 py-2.5 text-sm font-medium text-ink disabled:opacity-40"
          >
            <Camera className="h-4 w-4" />
            Capture
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full px-3 py-2 text-xs text-mist hover:text-ivory"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
