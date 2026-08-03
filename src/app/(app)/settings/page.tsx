"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldLabel, fieldInputClass } from "@/components/ui/field";
import { useAetherStore } from "@/store/aether-store";
import { STYLE_OPTION_IDS } from "@/lib/style-options";
import { cn } from "@/lib/utils";

const STYLE_OPTIONS = STYLE_OPTION_IDS;

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
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Preferences
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          Name, city, and style — synced on every device.
        </p>
      </div>

      <div className="glass shine-border space-y-5 rounded-[1.75rem] p-7 sm:p-8">
        <div>
          <FieldLabel htmlFor="display-name">Display name</FieldLabel>
          <input
            id="display-name"
            defaultValue={user.displayName}
            onBlur={(e) =>
              updateUser({ displayName: e.target.value || user.displayName })
            }
            className={fieldInputClass}
            placeholder="How should we greet you?"
            autoComplete="name"
          />
        </div>
        <div>
          <FieldLabel htmlFor="home-city" hint="For weather">
            Home city
          </FieldLabel>
          <input
            id="home-city"
            defaultValue={user.city || "London"}
            onBlur={(e) => updateUser({ city: e.target.value })}
            className={fieldInputClass}
            placeholder="London"
            autoComplete="address-level2"
          />
        </div>
        <div>
          <FieldLabel>Style DNA</FieldLabel>
          <div className="mt-1 flex flex-wrap gap-2">
            {STYLE_OPTIONS.map((style) => {
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
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs capitalize transition",
                    active
                      ? "border-champagne/50 bg-champagne/10 text-champagne"
                      : "border-line text-mist hover:border-champagne/30 hover:text-ivory-muted"
                  )}
                >
                  {style}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line/50 pt-4">
          <p className="text-sm text-ivory-muted">Voice styling</p>
          <button
            type="button"
            onClick={() => updateUser({ voiceEnabled: !user.voiceEnabled })}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition",
              user.voiceEnabled
                ? "bg-champagne text-ink"
                : "bg-white/5 text-mist hover:bg-white/10"
            )}
          >
            {user.voiceEnabled ? "Enabled" : "Paused"}
          </button>
        </div>
      </div>

      <div className="glass shine-border space-y-3 rounded-[1.75rem] p-7 sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-mist">
          Install as an app
        </p>
        <p className="text-sm leading-relaxed text-ivory-muted">
          Install this app to your phone in seconds. Tap 📤 (or the three dots ...) below, select share 📤 then "Add to Home Screen" ➕.
        </p>
      </div>

      <div className="glass shine-border space-y-3 rounded-[1.75rem] p-7 sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-mist">
          More
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/connect"
            className="rounded-2xl border border-champagne/35 bg-champagne/[0.07] px-4 py-3.5 text-sm text-ivory transition hover:border-champagne/50 hover:bg-champagne/10"
          >
            Add wardrobe pieces{" "}
            <span className="text-mist">· Connect stores & uploads</span>
          </Link>
          <Link
            href="/billing"
            className="flex flex-col rounded-2xl border border-line px-4 py-3.5 transition hover:border-champagne/40 hover:bg-white/[0.02]"
          >
            <span className="text-sm text-ivory">Credits & Billing</span>
            <span className="mt-0.5 text-xs text-mist">Top up your try-ons</span>
          </Link>
        </div>
      </div>

      <div className="flex justify-center pb-24 pt-4">
        <button
          type="button"
          onClick={() =>
            void signOutLocal().then(() => {
              window.location.href = "/login";
            })
          }
          className="text-xs uppercase tracking-wide text-danger/70 transition hover:text-danger hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
