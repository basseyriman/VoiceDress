import { useState, useRef } from "react";
import { useAetherStore } from "@/store/aether-store";
import { authFetch } from "@/lib/auth-fetch";
import { prepareWardrobeIngestPhoto } from "@/lib/image";
import type { CommerceSource, Garment } from "@/lib/types";

const MAX_BATCH = 20;
const UPLOAD_CONCURRENCY = 1;
const RATE_LIMIT_RETRIES = 4;

export function useGarmentUpload() {
  const addGarments = useAetherStore((s) => s.addGarments);

  const [syncing, setSyncing] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onIngestFiles = async (
    list?: FileList | null,
    source: CommerceSource = "receipt",
    isWishlist: boolean = false
  ) => {
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

    setSyncing(source);
    setError("");
    setToast("");
    setUploadProgress({ done: 0, total: batch.length });

    let added = 0;
    let photosOk = 0;
    let completed = 0;
    const failures: string[] = [];

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
              const processedItems = isWishlist
                ? result.items.map((g) => ({ ...g, isWishlist: true }))
                : result.items;
              addGarments(processedItems);
              added += processedItems.length;
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

  return {
    syncing,
    uploadProgress,
    toast,
    setToast,
    error,
    setError,
    fileRef,
    progressLabel,
    onIngestFiles,
    MAX_BATCH
  };
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
