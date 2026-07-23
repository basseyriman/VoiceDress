"use client";

import { useState } from "react";
import { Check, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listCommerceStores } from "@/lib/commerce";
import { useAetherStore } from "@/store/aether-store";

export default function ConnectPage() {
  const connections = useAetherStore((s) => s.connections);
  const connectStore = useAetherStore((s) => s.connectStore);
  const disconnectStore = useAetherStore((s) => s.disconnectStore);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const stores = listCommerceStores();

  const onConnect = async (source: (typeof stores)[number]["source"]) => {
    setSyncing(source);
    setToast("");
    try {
      await fetch("/api/commerce/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const items = connectStore(source);
      setToast(
        `Imported ${items.length} purchase${items.length === 1 ? "" : "s"} from ${source.toUpperCase()} — photos, brands, colors captured.`
      );
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Commerce sync
        </p>
        <h1 className="mt-2 font-display text-4xl text-ivory">
          Shop once. Wardrobe forever.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-mist">
          Connect retailers you already use. When a clothing purchase succeeds,
          Aether automatically pulls product imagery, name, brand, colors, and
          metadata into your wardrobe — no photos, no forms.
        </p>
      </div>

      {toast && (
        <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-ivory">
          {toast}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {stores.map((store) => {
          const conn = connections.find((c) => c.source === store.source);
          const connected = conn?.connected;
          return (
            <div
              key={store.source}
              className="glass shine-border flex flex-col rounded-3xl p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-champagne" />
                    <h3 className="font-display text-2xl text-ivory">{store.label}</h3>
                  </div>
                  <p className="mt-2 text-sm text-mist">{store.blurb}</p>
                </div>
                {connected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[10px] uppercase tracking-wider text-success">
                    <Check className="h-3 w-3" /> Live
                  </span>
                )}
              </div>
              <div className="mt-6 flex gap-2">
                {connected ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncing === store.source}
                      onClick={() => onConnect(store.source)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sync now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectStore(store.source)}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    disabled={syncing === store.source}
                    onClick={() => onConnect(store.source)}
                  >
                    {syncing === store.source ? "Connecting…" : "Connect"}
                  </Button>
                )}
              </div>
              {conn?.lastSyncAt && (
                <p className="mt-3 text-[11px] text-mist">
                  Last sync {new Date(conn.lastSyncAt).toLocaleString()} ·{" "}
                  {conn.itemCount} items
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
