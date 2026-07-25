"use client";

import { Button } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";

export default function SettingsPage() {
  const user = useAetherStore((s) => s.user);
  const updateUser = useAetherStore((s) => s.updateUser);
  const signOutLocal = useAetherStore((s) => s.signOutLocal);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Settings
        </p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Preferences</h1>
        <p className="mt-2 text-sm text-mist">
          Profile syncs to Firebase for every device.
        </p>
      </div>

      <div className="glass shine-border space-y-5 rounded-[2rem] p-8">
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
            Display name
          </span>
          <input
            defaultValue={user.displayName}
            onBlur={(e) =>
              updateUser({ displayName: e.target.value || user.displayName })
            }
            className="w-full rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
            Home city (weather)
          </span>
          <input
            defaultValue={user.city || "London"}
            onBlur={(e) => updateUser({ city: e.target.value })}
            className="w-full rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
          />
        </label>
        <div>
          <p className="text-xs uppercase tracking-wider text-mist">Style DNA</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["quiet luxury", "old money", "minimal", "streetwear"].map(
              (style) => {
                const active = user.stylePrefs.includes(style);
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? user.stylePrefs.filter((s) => s !== style)
                        : [...user.stylePrefs, style];
                      updateUser({
                        stylePrefs: next.length ? next : ["quiet luxury"],
                      });
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs capitalize ${
                      active
                        ? "border-champagne/50 bg-champagne/10 text-champagne"
                        : "border-line text-mist"
                    }`}
                  >
                    {style}
                  </button>
                );
              }
            )}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => updateUser({ voiceEnabled: !user.voiceEnabled })}
        >
          Voice {user.voiceEnabled ? "enabled" : "paused"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void signOutLocal().then(() => {
            window.location.href = "/login";
          })}
        >
          Sign out
        </Button>
      </div>

      <div className="glass shine-border space-y-3 rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-wider text-mist">More</p>
        <div className="flex flex-col gap-2">
          <a
            href="/connect"
            className="rounded-2xl border border-line px-4 py-3 text-sm text-ivory transition hover:border-champagne/40"
          >
            Connect stores{" "}
            <span className="text-mist">(Shopify + order photo)</span>
          </a>
          <a
            href="/billing"
            className="rounded-2xl border border-line px-4 py-3 text-sm text-ivory transition hover:border-champagne/40"
          >
            Membership plan
          </a>
        </div>
      </div>
    </div>
  );
}
