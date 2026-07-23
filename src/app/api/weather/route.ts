import { NextRequest, NextResponse } from "next/server";
import { fetchWeather } from "@/lib/weather";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat") || 51.5074);
  const lon = Number(searchParams.get("lon") || -0.1278);
  const location = searchParams.get("location") || "London";
  const weather = await fetchWeather(lat, lon, location);
  return NextResponse.json(weather);
}
