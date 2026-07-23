import { NextRequest, NextResponse } from "next/server";
import { suggestOutfit } from "@/lib/outfit-engine";
import type { Garment, WeatherSnapshot } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const wardrobe = (body.wardrobe || []) as Garment[];
  const weather = body.weather as WeatherSnapshot;
  if (!weather) {
    return NextResponse.json({ error: "weather required" }, { status: 400 });
  }
  const outfit = suggestOutfit({
    wardrobe,
    weather,
    occasion: body.occasion || "today",
    style: body.style || "quiet luxury",
    swapCategory: body.swapCategory,
    currentOutfit: body.currentOutfit,
    excludeIds: body.excludeIds,
  });
  return NextResponse.json({ outfit });
}
