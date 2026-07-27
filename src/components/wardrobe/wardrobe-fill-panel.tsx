"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCommerceStores } from "@/lib/commerce";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";
import type { CommerceSource, Garment } from "@/lib/types";

type Props = {
  /** Where Shopify OAuth should return (relative path). */
  returnTo?: string;
  /** Hide the large page intro when embedded in onboarding. */
  compact?: boolean;
};

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

  const onIngestFile = async (file?: File) => {
    if (!file) return;
    setSyncing(ingestSource);
    setError("");
    setToast("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await authFetch("/api/commerce/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          source: ingestSource,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 402
            ? "Your trial has ended — open Billing to continue."
            : data.error || "Ingest failed"
        );
        return;
      }
      const items = (data.items || []) as Garment[];
      addGarments(items);
      setToast(
        `Added ${items.length} piece${items.length === 1 ? "" : "s"} to your wardrobe from the upload.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSyncing(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
            Sync Shopify orders, or upload a receipt / product photo — we add
            real pieces to your wardrobe.
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
          Receipt, order screenshot, or product shot — any store.
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
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onIngestFile(e.target.files?.[0])}
        />
        <Button
          className="mt-4"
          disabled={!!syncing}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {syncing ? "Extracting…" : "Upload image"}
        </Button>
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
                  Upload {store.label} order
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn’t read file"));
    reader.readAsDataURL(file);
  });
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
