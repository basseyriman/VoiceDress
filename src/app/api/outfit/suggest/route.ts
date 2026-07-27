import { NextRequest, NextResponse } from "next/server";
import { suggestOutfit } from "@/lib/outfit-engine";
import { inferOccasionProfile } from "@/lib/occasion-profile";
import type { Garment, TasteMemory, WeatherSnapshot } from "@/lib/types";
import type { OccasionProfile } from "@/lib/occasion-profile";
import { isAuthedUser, requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!isAuthedUser(auth)) return auth;

  const body = await req.json();
  const wardrobe = (body.wardrobe || []) as Garment[];
  const weather = body.weather as WeatherSnapshot;
  if (!weather) {
    return NextResponse.json({ error: "weather required" }, { status: 400 });
  }
  if (!wardrobe.length) {
    return NextResponse.json(
      { error: "Add garments to your wardrobe first.", code: "empty_wardrobe" },
      { status: 400 }
    );
  }
  const profile = (body.profile as OccasionProfile | undefined) ||
    inferOccasionProfile(body.occasion || "today", body.style);
  const taste = body.taste as TasteMemory | undefined;
  const stylePrefs = body.stylePrefs as string[] | undefined;

  const outfit = suggestOutfit({
    wardrobe,
    weather,
    occasion: body.occasion || profile.label || "today",
    style: body.style,
    stylePrefs,
    swapCategory: body.swapCategory,
    currentOutfit: body.currentOutfit,
    excludeIds: body.excludeIds,
    forceGarmentId: body.forceGarmentId,
    profile,
    taste,
  });
  return NextResponse.json({ outfit });
}
