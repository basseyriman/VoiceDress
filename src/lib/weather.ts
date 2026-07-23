import type { WeatherSnapshot } from "./types";

export async function fetchWeather(
  lat = 51.5074,
  lon = -0.1278,
  location = "London"
): Promise<WeatherSnapshot> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m`;
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) throw new Error("weather failed");
    const data = await res.json();
    const current = data.current;
    return {
      tempC: current.temperature_2m,
      condition: weatherCodeToText(current.weather_code),
      humidity: current.relative_humidity_2m,
      windKph: current.wind_speed_10m,
      location,
      precipChance: current.precipitation_probability ?? 0,
    };
  } catch {
    return {
      tempC: 14,
      condition: "Overcast",
      humidity: 72,
      windKph: 12,
      location,
      precipChance: 30,
    };
  }
}

function weatherCodeToText(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 99) return "Thunderstorm";
  return "Overcast";
}
