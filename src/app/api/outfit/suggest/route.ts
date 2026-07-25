import { NextRequest, NextResponse } from "next/server";
import { suggestOutfit } from "@/lib/outfit-engine";
import { inferOccasionProfile } from "@/lib/occasion-profile";
import type { Garment, TasteMemory, WeatherSnapshot } from "@/lib/types";
import type { OccasionProfile } from "@/lib/occasion-profile";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const wardrobe = (body.wardrobe || []) as Garment[];
  const weather = body.weather as WeatherSnapshot;
  if (!weather) {
    return NextResponse.json({ error: "weather required" }, { status: 400 });
  }
  const profile = (body.profile as OccasionProfile | undefined) ||
    inferOccasionProfile(body.occasion || "today", body.style);
  const taste = body.taste as TasteMemory | undefined;

  const outfit = suggestOutfit({
    wardrobe,
    weather,
    occasion: body.occasion || profile.label || "today",
    style: body.style || profile.styleHints[0] || "quiet luxury",
    swapCategory: body.swapCategory,
    currentOutfit: body.currentOutfit,
    excludeIds: body.excludeIds,
    forceGarmentId: body.forceGarmentId,
    profile,
    taste,
  });
  return NextResponse.json({ outfit });
}
