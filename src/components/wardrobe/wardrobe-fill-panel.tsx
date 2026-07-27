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
  /** Where Shopify OAuth should return (relative path). */
  returnTo?: string;
  /** Hide the large page intro when embedded in onboarding. */
  compact?: boolean;
};

const MAX_BATCH = 20;
/** Parallel vision calls — much faster than one-by-one. */
const UPLOAD_CONCURRENCY = 3;

export function WardrobeFillPanel({
  returnTo = "/connect",
  compact = false,
}: Props) {
  const searchParams = useSearchParams();
  const connections = useAetherStore((s) => s.connections);
  const addGarments = useAetherStore((s) => s.addGarments);
  const markShopifyConnected = useAetherStore((s) => s.markShopifyConnected);
  const disconnectStore = useAetherStore((s) => s.disconnectStore);

  const [shopDomain, setShopDomain] = useState("");
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

  useEffect(() => {
    const status = searchParams.get("shopify");
    const payload = searchParams.get("payload");
    if (status === "connected" && payload) {
      try {
        const json = base64UrlDecode(payload);
        const data = JSON.parse(json) as {
          shop?: string;
          items?: Garment[];
          total?: number;
        };
        if (data.items?.length) {
          addGarments(data.items);
          markShopifyConnected(
            data.shop || "shopify",
            data.total || data.items.length
          );
          setToast(
            `Shopify connected — imported ${data.total || data.items.length} piece${(data.total || data.items.length) === 1 ? "" : "s"} from recent orders.`
          );
        } else {
          markShopifyConnected(data.shop || "shopify", 0);
          setToast("Shopify connected. No recent order line items found yet.");
        }
      } catch {
        setError("Couldn’t read Shopify sync payload.");
      }
    } else if (status === "error") {
      setError(
        `Shopify connect failed (${searchParams.get("reason") || "unknown"}). Check SHOPIFY_API_KEY / SECRET.`
      );
    }
  }, [searchParams, addGarments, markShopifyConnected]);

  const connectShopify = () => {
    let shop = shopDomain.trim().toLowerCase();
    if (!shop) {
      setError("Enter your store domain, e.g. my-brand.myshopify.com");
      return;
    }
    if (!shop.includes(".")) shop = `${shop}.myshopify.com`;
    setError("");
    const params = new URLSearchParams({
      shop,
      returnTo,
    });
    window.location.href = `/api/commerce/shopify/auth?${params.toString()}`;
  };

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
      if (!res.ok) {
        const label = file.name || "photo";
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
          error: data.error || `${label}: upload failed (${res.status}).`,
        };
      }
      const items = (data.items || []) as Garment[];
      if (!items.length) {
        return {
          items: [],
          error: `${file.name || "Photo"}: no pieces found.`,
        };
      }
      return { items };
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      return {
        items: [],
        error: aborted
          ? `${file.name || "Photo"} timed out.`
          : err instanceof Error
            ? err.message
            : "Upload failed",
      };
    } finally {
      window.clearTimeout(timeout);
    }
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
            Sync Shopify orders, or upload receipts / product photos — select
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
          <Link2 className="h-4 w-4 text-champagne" />
          <h2 className="font-display text-2xl text-ivory">Shopify</h2>
        </div>
        <p className="mt-2 text-sm text-mist">
          Connect your store — recent orders become wardrobe pieces.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="your-store.myshopify.com"
            className="w-full flex-1 rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
          />
          <Button onClick={connectShopify}>Connect Shopify</Button>
        </div>
        {connections.find((c) => c.source === "shopify")?.connected && (
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => disconnectStore("shopify")}
            >
              Disconnect
            </Button>
            <p className="self-center text-[11px] text-mist">
              Last sync{" "}
              {connections.find((c) => c.source === "shopify")?.lastSyncAt
                ? new Date(
                    connections.find((c) => c.source === "shopify")!
                      .lastSyncAt!
                  ).toLocaleString()
                : "—"}
            </p>
          </div>
        )}
      </div>

      <div className="glass shine-border rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-champagne" />
          <h2 className="font-display text-2xl text-ivory">Add from photo</h2>
        </div>
        <p className="mt-2 text-sm text-mist">
          Select one or many receipts, order screenshots, or product shots —
          up to {MAX_BATCH} at a time.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {stores
            .filter((s) => s.kind === "ingest")
            .map((s) => (
              <button
                key={s.source}
                type="button"
                onClick={() => setIngestSource(s.source)}
                className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                  ingestSource === s.source
                    ? "border-champagne/50 bg-champagne/10 text-champagne"
                    : "border-line text-mist hover:text-ivory"
                }`}
              >
                {s.label}
              </button>
            ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => void onIngestFiles(e.target.files)}
        />
        <Button
          className="mt-4"
          disabled={!!syncing}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {progressLabel || "Upload photos"}
        </Button>
        {uploadProgress && uploadProgress.total > 1 && (
          <div className="mt-3">
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
              {uploadProgress.done} of {uploadProgress.total} photos done
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stores
          .filter((s) => s.kind === "ingest" && s.source !== "receipt")
          .map((store) => {
            const conn = connections.find((c) => c.source === store.source);
            return (
              <div
                key={store.source}
                className="glass shine-border flex flex-col rounded-3xl p-6"
              >
                <h3 className="font-display text-xl text-ivory">{store.label}</h3>
                <p className="mt-2 text-sm text-mist">{store.blurb}</p>
                <Button
                  size="sm"
                  className="mt-4 w-fit"
                  variant="outline"
                  disabled={!!syncing}
                  onClick={() => {
                    setIngestSource(store.source);
                    fileRef.current?.click();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Upload {store.label} photos
                </Button>
                {conn?.itemCount ? (
                  <p className="mt-3 text-[11px] text-mist">
                    {conn.itemCount} items tagged from this source
                  </p>
                ) : null}
              </div>
            );
          })}
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
