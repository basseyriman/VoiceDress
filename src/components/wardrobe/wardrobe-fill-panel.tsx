"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCommerceStores } from "@/lib/commerce";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";
import type { CommerceSource, Garment } from "@/lib/types";
import { useGarmentUpload } from "@/hooks/use-garment-upload";

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
  const [ingestSource, setIngestSource] = useState<CommerceSource>("receipt");

  const stores = listCommerceStores();

  const {
    syncing,
    uploadProgress,
    toast,
    error,
    fileRef,
    progressLabel,
    onIngestFiles,
    MAX_BATCH
  } = useGarmentUpload();

  return (
    <div className={compact ? "space-y-6" : "space-y-8 pb-20"}>
      {!compact && (
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Wardrobe
          </p>
          <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
            Fill your wardrobe
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mist">
            Upload clear photos of your clothes (laid flat or on a hanger) or screenshots of items you've bought or want to try on (Amazon, Zara, SHEIN, Temu, ASOS, eBay, etc.) — select
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
          accept="image/*"
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
