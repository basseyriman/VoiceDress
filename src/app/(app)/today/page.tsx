"use client";

import { useEffect } from "react";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { OutfitStage } from "@/components/wardrobe/outfit-stage";
import { Button } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";
import type { WeatherSnapshot } from "@/lib/types";

export default function TodayPage() {
  const user = useAetherStore((s) => s.user);
  const weather = useAetherStore((s) => s.weather);
  const setWeather = useAetherStore((s) => s.setWeather);
  const currentOutfit = useAetherStore((s) => s.currentOutfit);
  const generateOutfit = useAetherStore((s) => s.generateOutfit);
  const wardrobe = useAetherStore((s) => s.wardrobe);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/weather?lat=${user?.lat || 51.5074}&lon=${user?.lon || -0.1278}&location=${encodeURIComponent(user?.city || "London")}`
      );
      const data = (await res.json()) as WeatherSnapshot;
      if (!cancelled) {
        setWeather(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.lat, user?.lon, user?.city, setWeather]);

  useEffect(() => {
    if (weather && !currentOutfit && wardrobe.length) {
      generateOutfit("today", user?.stylePrefs?.[0] || "quiet luxury");
    }
  }, [weather, currentOutfit, wardrobe.length, generateOutfit, user?.stylePrefs]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Good morning{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
          </p>
          <h1 className="mt-2 font-display text-4xl text-ivory sm:text-5xl">
            Today&apos;s presence
          </h1>
          <p className="mt-2 max-w-xl text-sm text-mist">
            {weather
              ? `${Math.round(weather.tempC)}°C and ${weather.condition.toLowerCase()} in ${weather.location}. ${wardrobe.length} pieces ready.`
              : "Syncing live weather…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => generateOutfit("work meeting", "quiet luxury")}
          >
            Work edit
          </Button>
          <Button onClick={() => generateOutfit("meeting the in-laws", "old money")}>
            Old money
          </Button>
        </div>
      </div>

      <OutfitStage outfit={currentOutfit} avatarUrl={user?.avatarUrl || user?.photoURL} />
      <VoiceOrb />
    </div>
  );
}
