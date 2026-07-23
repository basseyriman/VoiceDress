"use client";

import { Button } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";

export default function SettingsPage() {
  const user = useAetherStore((s) => s.user);
  const signInLocal = useAetherStore((s) => s.signInLocal);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">Settings</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Preferences</h1>
      </div>

      <div className="glass shine-border space-y-5 rounded-[2rem] p-8">
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-mist">
            Display name
          </span>
          <input
            defaultValue={user.displayName}
            onBlur={(e) =>
              signInLocal({
                ...user,
                email: user.email,
                displayName: e.target.value || user.displayName,
              })
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
            onBlur={(e) =>
              signInLocal({
                ...user,
                email: user.email,
                displayName: user.displayName,
                city: e.target.value,
              })
            }
            className="w-full rounded-2xl border border-line bg-ink-soft px-4 py-3 text-sm text-ivory outline-none focus:border-champagne/50"
          />
        </label>
        <div>
          <p className="text-xs uppercase tracking-wider text-mist">Style DNA</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {["quiet luxury", "old money", "minimal", "streetwear"].map((style) => {
              const active = user.stylePrefs.includes(style);
              return (
                <button
                  key={style}
                  onClick={() => {
                    const next = active
                      ? user.stylePrefs.filter((s) => s !== style)
                      : [...user.stylePrefs, style];
                    signInLocal({
                      ...user,
                      email: user.email,
                      displayName: user.displayName,
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
            })}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            signInLocal({
              ...user,
              email: user.email,
              displayName: user.displayName,
              voiceEnabled: !user.voiceEnabled,
            })
          }
        >
          Voice {user.voiceEnabled ? "enabled" : "paused"}
        </Button>
      </div>
    </div>
  );
}
