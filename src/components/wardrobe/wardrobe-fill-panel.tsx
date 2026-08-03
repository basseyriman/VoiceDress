"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCommerceStores } from "@/lib/commerce";
import { authFetch } from "@/lib/auth-fetch";
import { prepareWardrobeIngestPhoto } from "@/lib/image";
import { useAetherStore } from "@/store/aether-store";
import type { CommerceSource, Garment } from "@/lib/types";

type Props = {
  
  returnTo?: string;
  /** Hide the large page intro when embedded in onboarding. */
  compact?: boolean;
};

const MAX_BATCH = 20;
/** One at a time avoids OpenAI TPM spikes on multi-photo uploads. */
const UPLOAD_CONCURRENCY = 1;
const RATE_LIMIT_RETRIES = 4;

export function WardrobeFillPanel({
  returnTo = "/connect",
  compact = false,
}: Props) {
  const searchParams = useSearchParams();
  const connections = useAetherStore((s) => s.connections);
  const addGarments = useAetherStore((s) => s.addGarments);
  
  

  
  const [syncing, setSyncing] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [ingestSource, setIngestSource] = useState<CommerceSource>("receipt");

  const stores = listCommerceStores();

  

  

  const ingestOnePhoto = async (
    file: File,
    source: CommerceSource
  ): Promise<{ items: Garment[]; error?: string }> => {
    const prepared = await prepareWardrobeIngestPhoto(file);
    if (prepared.error || !prepared.dataUrl) {
      return {
        items: [],
        error: prepared.error || `Couldn’t read ${file.name || "that photo"}.`,
      };
    }
    if (prepared.dataUrl.length > 3_500_000) {
      return {
        items: [],
        error: `${file.name || "Photo"} is still too large after compression.`,
      };
    }

    const label = file.name || "photo";
    for (let attempt = 0; attempt < RATE_LIMIT_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 90_000);
      try {
        const res = await authFetch("/api/commerce/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            imageDataUrl: prepared.dataUrl,
            source,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 || isRateLimitMessage(data.error)) {
          const waitMs = Number(data.retryAfterMs) || 1200 * (attempt + 1);
          await sleep(waitMs);
          continue;
        }
        if (!res.ok) {
          if (res.status === 413) {
            return { items: [], error: `${label}: too large.` };
          }
          if (res.status === 422) {
            return {
              items: [],
              error:
                data.error ||
                `${label}: no clothing found — try a clearer shot.`,
            };
          }
          if (res.status === 401) {
            return { items: [], error: "Sign in again, then retry." };
          }
          return {
            items: [],
            error: humanizeIngestError(data.error, label, res.status),
          };
        }
        const items = (data.items || []) as Garment[];
        if (!items.length) {
          return {
            items: [],
            error: `${label}: no pieces found.`,
          };
        }
        return { items };
      } catch (err) {
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          return { items: [], error: `${label} timed out.` };
        }
        const msg = err instanceof Error ? err.message : "Upload failed";
        if (isRateLimitMessage(msg) && attempt < RATE_LIMIT_RETRIES - 1) {
          await sleep(1200 * (attempt + 1));
          continue;
        }
        return { items: [], error: humanizeIngestError(msg, label) };
      } finally {
        window.clearTimeout(timeout);
      }
    }
    return {
      items: [],
      error: `${label}: AI is busy — wait a moment and upload again.`,
    };
  };

  const onIngestFiles = async (list?: FileList | null) => {
    const files = list
      ? Array.from(list).filter(
          (f) =>
            f.type.startsWith("image/") ||
            /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)
        )
      : [];
    if (!files.length) return;

    const batch = files.slice(0, MAX_BATCH);
    const skipped = files.length - batch.length;

    setSyncing(ingestSource);
    setError("");
    setToast("");
    setUploadProgress({ done: 0, total: batch.length });

    let added = 0;
    let photosOk = 0;
    let completed = 0;
    const failures: string[] = [];
    const source = ingestSource;

    const markDone = () => {
      completed += 1;
      setUploadProgress({ done: completed, total: batch.length });
    };

    const runPool = async () => {
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, batch.length) },
        async () => {
          while (true) {
            const i = nextIndex++;
            if (i >= batch.length) return;
            if (i > 0) await sleep(350);
            const result = await ingestOnePhoto(batch[i], source);
            if (result.items.length) {
              addGarments(result.items);
              added += result.items.length;
              photosOk += 1;
            } else if (result.error) {
              failures.push(result.error);
            }
            markDone();
          }
        }
      );
      await Promise.all(workers);
    };

    try {
      await runPool();

      const parts: string[] = [];
      if (added > 0) {
        parts.push(
          `Added ${added} piece${added === 1 ? "" : "s"} from ${photosOk} photo${photosOk === 1 ? "" : "s"}.`
        );
      }
      if (skipped > 0) {
        parts.push(`Skipped ${skipped} extra (max ${MAX_BATCH} at a time).`);
      }
      if (parts.length) setToast(parts.join(" "));
      if (failures.length) {
        const shown = failures.slice(0, 3).join(" ");
        setError(
          failures.length > 3
            ? `${shown} (+${failures.length - 3} more)`
            : shown
        );
      } else if (!added) {
        setError(
          "No pieces found in those photos. Try clearer product shots or receipts."
        );
      }
    } finally {
      setSyncing(null);
      setUploadProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const progressLabel =
    uploadProgress && uploadProgress.total > 1
      ? `Extracting ${uploadProgress.done}/${uploadProgress.total}…`
      : syncing
        ? "Extracting…"
        : null;

  return (
    <div className={compact ? "space-y-6" : "space-y-8 pb-20"}>
      {!compact && (
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Commerce
          </p>
          <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
            Fill your wardrobe
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist">
            Upload clear photos of your clothes (laid flat or on a hanger) or screenshots of items you want to buy (Shein, Zara, ASOS, etc.) — select
            several at once to fill your wardrobe faster.
          </p>
        </div>
      )}

      {toast && (
        <div className="rounded-2xl border border-champagne/30 bg-champagne/10 px-4 py-3 text-sm text-ivory">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ivory">
          {error}
        </div>
      )}

      <div className="glass shine-border rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-champagne" />
          <h2 className="font-display text-2xl text-ivory">Upload photos</h2>
        </div>
        <p className="mt-2 text-sm text-mist">
          Select one or many photos or product screenshots —
          up to {MAX_BATCH} at a time.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => void onIngestFiles(e.target.files)}
        />
        <Button
          className="mt-6 w-full sm:w-auto"
          disabled={!!syncing}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {progressLabel || "Select files"}
        </Button>
        {uploadProgress && uploadProgress.total > 1 && (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-champagne transition-all duration-300"
                style={{
                  width: `${Math.round(
                    (uploadProgress.done / uploadProgress.total) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-mist">
              {uploadProgress.done} of {uploadProgress.total} photos processed
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return decodeURIComponent(
    Array.from(atob(padded + pad))
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitMessage(msg: unknown): boolean {
  if (typeof msg !== "string") return false;
  return /rate limit|tokens per min|TPM|429|try again in/i.test(msg);
}

function humanizeIngestError(
  msg: unknown,
  label: string,
  status?: number
): string {
  const text = typeof msg === "string" ? msg : "";
  if (isRateLimitMessage(text)) {
    return `${label}: AI is briefly busy — wait a few seconds and retry the rest.`;
  }
  if (text && !/AI_APICallError|org-|TPM|Request id/i.test(text)) {
    return `${label}: ${text.slice(0, 120)}`;
  }
  return `${label}: upload failed${status ? ` (${status})` : ""}.`;
}
