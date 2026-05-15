// ============================================================
// Agricultural Weather & Disaster Prediction Agent
// ============================================================
// Data sources:
//   - Open-Meteo API (real, free, no key) → 48h / 10d forecast
//   - NASA POWER API (real, free, no key) → 30-year baseline
//   - Firebase RTDB live soil moisture when available
// ============================================================

export type AlertType = "FLOOD" | "DROUGHT" | "MONSOON" | "CLEAR";
export type AlertSeverity = "critical" | "high" | "medium" | "low";
export type CropType = "rice" | "maize" | "vegetables";
export type ZoneName = "North" | "Central" | "South";

export interface FarmZone {
  id: string;
  name: ZoneName;
  lat: number;
  lon: number;
  spatial_zone_id: string;
  mapCenter: [number, number];
  mapRadius: number;
  crops: CropType[];
}

export interface WeatherForecast {
  rainfall_48h_mm: number;
  rainfall_24h_mm: number;
  rainfall_10d_mm: number;
  temperature_max_c: number;
  temperature_min_c: number;
  humidity_pct: number;
  wind_direction_deg: number;
  wind_speed_kmh: number;
  humidity_3day_avg: number;
  no_rain_forecast_days: number;
  data_age_hours: number;
  source: string;
}

export interface SoilReading {
  zone_id: string;
  moisture_pct: number; // % of field capacity
  source: string;
  timestamp: string;
}

export interface NdviReading {
  zone_id: string;
  current_ndvi: number;
  seasonal_avg_ndvi: number;
  drop_pct: number; // positive means drop
  source: string;
}

export interface SpiReading {
  zone_id: string;
  spi_value: number; // Standard Precipitation Index
  period_days: number;
}

export interface MonsoonTrack {
  front_days_away: number;
  sw_wind_detected: boolean;
  humidity_3day_above_75: boolean;
  source: string;
}

export interface HistoricalBaseline {
  avg_rainfall_mm: number;
  avg_temperature_c: number;
  period_years: number;
  source: string;
}

export interface AgentAlert {
  type: AlertType;
  severity: AlertSeverity;
  zone: string;
  timeframe: string;
  signal: string;
  prediction: string;
  action: string;
  confidence: number;
  sources: string[];
  spatial_zone_id: string;
  stale_data?: boolean;
  low_confidence_critical?: boolean;
}

export interface AgentRunResult {
  run_timestamp: string;
  farm_location: string;
  alerts: AgentAlert[];
  summary_sms: string;
  next_run_in_hours: number;
  // Raw inputs for display
  weather: WeatherForecast;
  soil: SoilReading[];
  ndvi: NdviReading[];
  spi: SpiReading[];
  monsoon: MonsoonTrack;
  baseline: HistoricalBaseline;
}

// ── Malaysia farm zones ─────────────────────────────────────
export const FARM_ZONES: FarmZone[] = [
  {
    id: "north",
    name: "North",
    lat: 6.118,
    lon: 100.367,
    spatial_zone_id: "north_001",
    mapCenter: [6.02, 100.45],
    mapRadius: 40000,
    crops: ["rice"],
  },
  {
    id: "central",
    name: "Central",
    lat: 4.0, // Perak
    lon: 101.0,
    spatial_zone_id: "central_001",
    mapCenter: [4.88, 100.84],
    mapRadius: 38000,
    crops: ["maize", "rice"],
  },
  {
    id: "south",
    name: "South",
    lat: 3.503,
    lon: 101.11,
    spatial_zone_id: "south_001",
    mapCenter: [3.45, 101.25],
    mapRadius: 34000,
    crops: ["vegetables"],
  },
];

// ── Weather API Integration ───────────────────────────────────

async function fetchWeather(lat: number, lon: number): Promise<WeatherForecast> {
  try {
      const url = `/api/weather/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`OWM HTTP ${res.status}`);
      const data = await res.json();

      const list = data.list ?? [];
      let rain48h = 0, rain24h = 0;
      let tempMax = -999, tempMin = 999;
      let humSum = 0;

      for (let i = 0; i < Math.min(16, list.length); i++) {
        const item = list[i];
        const r = item.rain?.["3h"] ?? 0;
        rain48h += r;
        if (i < 8) rain24h += r;
        if (item.main) {
          tempMax = Math.max(tempMax, item.main.temp_max);
          tempMin = Math.min(tempMin, item.main.temp_min);
          humSum += item.main.humidity;
        }
      }
      const humidity_pct = Math.round(humSum / Math.max(1, Math.min(16, list.length)));

      let hum3DaySum = 0;
      for (let i = 0; i < Math.min(24, list.length); i++) {
        hum3DaySum += list[i].main?.humidity ?? 70;
      }
      const humidity_3day_avg = Math.round(hum3DaySum / Math.max(1, Math.min(24, list.length)));

      const wind_direction_deg = list[0]?.wind?.deg ?? 180;
      const wind_speed_kmh = (list[0]?.wind?.speed ?? 4) * 3.6;

      const rain10d = rain48h * 2.5; // OWM free is 5 days, so extrapolate 10d roughly
      let no_rain_days = 0;
      for (let d = 0; d < 5; d++) {
        let dailyRain = 0;
        for (let j = 0; j < 8; j++) {
          const idx = d * 8 + j;
          if (idx < list.length) dailyRain += list[idx].rain?.["3h"] ?? 0;
        }
        if (dailyRain < 1) no_rain_days++;
        else break;
      }

      return {
        rainfall_48h_mm: Math.round(rain48h * 10) / 10,
        rainfall_24h_mm: Math.round(rain24h * 10) / 10,
        rainfall_10d_mm: Math.round(rain10d * 10) / 10,
        temperature_max_c: Math.round(tempMax),
        temperature_min_c: Math.round(tempMin),
        humidity_pct,
        wind_direction_deg,
        wind_speed_kmh: Math.round(wind_speed_kmh),
        humidity_3day_avg,
        no_rain_forecast_days: no_rain_days,
        data_age_hours: 0,
        source: "OpenWeatherMap",
      };
  } catch (e) {
    console.warn("OpenWeatherMap backend failed, falling back to Open-Meteo", e);
  }

  return fetchOpenMeteo(lat, lon);
}

// ── Open-Meteo API (Fallback) ──────────────────────────────
async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=precipitation,relative_humidity_2m,wind_direction_10m,wind_speed_10m` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,rain_sum` +
    `&timezone=Asia%2FKuala_Lumpur&forecast_days=10`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = await res.json();

    const daily = data.daily ?? {};
    const hourly = data.hourly ?? {};

    const rain: number[] = daily.precipitation_sum ?? [];
    const rain48h = (rain[0] ?? 0) + (rain[1] ?? 0);
    const rain24h = rain[0] ?? 0;
    const rain10d = rain.slice(0, 10).reduce((s: number, v: number) => s + (v ?? 0), 0);

    const tempMax: number[] = daily.temperature_2m_max ?? [];
    const tempMin: number[] = daily.temperature_2m_min ?? [];

    // Humidity: average of first 48 hours
    const humidity_h: number[] = hourly.relative_humidity_2m ?? [];
    const hum48h = humidity_h.slice(0, 48);
    const hum72h = humidity_h.slice(0, 72);
    const humidity_pct =
      hum48h.length > 0
        ? Math.round(hum48h.reduce((s, v) => s + v, 0) / hum48h.length)
        : 70;

    // 3-day average humidity (for monsoon check)
    const humidity_3day_avg =
      hum72h.length > 0
        ? Math.round(hum72h.reduce((s, v) => s + v, 0) / hum72h.length)
        : 70;

    // Wind: use first hour
    const wind_direction_deg = (hourly.wind_direction_10m?.[0] ?? 180) as number;
    const wind_speed_kmh = (hourly.wind_speed_10m?.[0] ?? 15) as number;

    // Count consecutive no-rain days starting from day 1
    let no_rain_days = 0;
    for (let i = 1; i < rain.length; i++) {
      if ((rain[i] ?? 0) < 1) no_rain_days++;
      else break;
    }

    return {
      rainfall_48h_mm: Math.round(rain48h * 10) / 10,
      rainfall_24h_mm: Math.round(rain24h * 10) / 10,
      rainfall_10d_mm: Math.round(rain10d * 10) / 10,
      temperature_max_c: tempMax[0] ?? 32,
      temperature_min_c: tempMin[0] ?? 24,
      humidity_pct,
      wind_direction_deg,
      wind_speed_kmh: Math.round(wind_speed_kmh),
      humidity_3day_avg,
      no_rain_forecast_days: no_rain_days,
      data_age_hours: 0,
      source: "Open-Meteo",
    };
  } catch (error) {
    throw new Error(error instanceof Error ? `Open-Meteo unavailable: ${error.message}` : "Open-Meteo unavailable.");
  }
}

// ── NASA POWER (real, free, no key) ────────────────────────
async function fetchNasaPowerBaseline(lat: number, lon: number): Promise<HistoricalBaseline> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const start = `1994${month}${day}`;
  const end = `2023${month}${day}`;

  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=PRECTOTCORR,T2M_MAX` +
    `&community=AG&longitude=${lon}&latitude=${lat}` +
    `&start=${start}&end=${end}&format=JSON`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);
    const data = await res.json();
    const prec: Record<string, number> = data?.properties?.parameter?.PRECTOTCORR ?? {};
    const temp: Record<string, number> = data?.properties?.parameter?.T2M_MAX ?? {};

    const precVals = Object.values(prec).filter((v) => v > 0 && v < 999);
    const tempVals = Object.values(temp).filter((v) => v > 0 && v < 999);

    const avg_rainfall_mm =
      precVals.length > 0
        ? Math.round((precVals.reduce((s, v) => s + v, 0) / precVals.length) * 30 * 10) / 10
        : 145;
    const avg_temperature_c =
      tempVals.length > 0
        ? Math.round((tempVals.reduce((s, v) => s + v, 0) / tempVals.length) * 10) / 10
        : 32;

    return {
      avg_rainfall_mm,
      avg_temperature_c,
      period_years: 30,
      source: "NASA POWER",
    };
  } catch (error) {
    throw new Error(error instanceof Error ? `NASA POWER unavailable: ${error.message}` : "NASA POWER unavailable.");
  }
}

// ── Monsoon Track Derived From Forecast Inputs ───────────────
function deriveMonsoonTrack(weather: WeatherForecast): MonsoonTrack {
  // SW monsoon (May-Sep) / NE monsoon (Nov-Mar) for Malaysia
  const month = new Date().getMonth() + 1;
  const monsoon_season = (month >= 5 && month <= 9) || month === 11 || month === 12 || month <= 3;
  const sw_wind = weather.wind_direction_deg >= 195 && weather.wind_direction_deg <= 255;
  const days_away = monsoon_season && weather.humidity_3day_avg > 75
    ? (sw_wind ? 3 : 5)
    : 15;

  return {
    front_days_away: days_away,
    sw_wind_detected: sw_wind,
    humidity_3day_above_75: weather.humidity_3day_avg > 75,
    source: "Open-Meteo derived monsoon signal",
  };
}

// ── Helper: cardinal direction ──────────────────────────────
function windCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

// ── Threshold engine ────────────────────────────────────────
function runThresholds(
  zone: FarmZone,
  weather: WeatherForecast,
  soil: SoilReading | null,
  ndvi: NdviReading | null,
  spi: SpiReading | null,
  monsoon: MonsoonTrack,
  baseline: HistoricalBaseline,
): AgentAlert[] {
  const alerts: AgentAlert[] = [];
  const isStale = weather.data_age_hours > 3;
  const stalePenalty = isStale ? 15 : 0;

  // ── Crop-specific modifiers ─────────────────────────────
  const hasRice = zone.crops.includes("rice");
  const hasMaize = zone.crops.includes("maize");
  const hasVeg = zone.crops.includes("vegetables");

  const FLOOD_RAIN_48H = hasVeg ? 40 : hasMaize ? 35 : 50;
  const FLOOD_SOIL = hasVeg ? 68 : 85;
  const FLOOD_RAIN_24H = hasVeg ? 24 : 30;

  const DROUGHT_SPI = hasRice ? -0.5 : -1.0;
  const DROUGHT_NDVI_DROP = hasVeg ? 12 : 15;
  const DROUGHT_SOIL = hasVeg ? 30 : 25;

  // ── FLOOD checks ────────────────────────────────────────
  const floodSignals: string[] = [];
  let floodConfidence = 60;

  if (weather.rainfall_48h_mm > FLOOD_RAIN_48H) {
    floodSignals.push(`${weather.rainfall_48h_mm}mm rainfall forecast 48h (threshold ${FLOOD_RAIN_48H}mm)`);
    floodConfidence += 20;
  }
  if (soil && soil.moisture_pct > FLOOD_SOIL) {
    floodSignals.push(`soil moisture ${soil.moisture_pct}% of field capacity (threshold ${FLOOD_SOIL}%)`);
    floodConfidence += 18;
  }
  if (weather.rainfall_24h_mm > FLOOD_RAIN_24H) {
    floodSignals.push(`24h rain ${weather.rainfall_24h_mm}mm near river proximity`);
    floodConfidence += 12;
  }

  if (floodSignals.length > 0) {
    const conf = Math.min(97, floodConfidence - stalePenalty);
    const sev: AlertSeverity =
      floodSignals.length >= 3 ? "critical" : floodSignals.length === 2 ? "high" : "medium";
    alerts.push({
      type: "FLOOD",
      severity: sev,
      zone: `${zone.name} Zone`,
      timeframe: "48 hours",
      signal: floodSignals.join(", "),
      prediction: `${sev === "critical" ? "High flood risk, waterlogging likely" : "Elevated flood risk, field monitoring required"}`,
      action: "Drain fields immediately. Do NOT irrigate. Delay fertiliser 72h.",
      confidence: conf,
      sources: [weather.source, soil?.source].filter((source): source is string => Boolean(source)),
      spatial_zone_id: zone.spatial_zone_id,
      stale_data: isStale,
      low_confidence_critical: sev === "critical" && conf < 70,
    });
  }

  // ── DROUGHT checks ──────────────────────────────────────
  const droughtSignals: string[] = [];
  let droughtConfidence = 55;

  if (spi && spi.spi_value < DROUGHT_SPI) {
    droughtSignals.push(`SPI drought index ${spi.spi_value} (threshold ${DROUGHT_SPI})`);
    droughtConfidence += 20;
  }
  if (ndvi && ndvi.drop_pct > DROUGHT_NDVI_DROP) {
    droughtSignals.push(`NDVI dropped ${ndvi.drop_pct}% below seasonal average (threshold ${DROUGHT_NDVI_DROP}%)`);
    droughtConfidence += 20;
  }
  if (soil && soil.moisture_pct < DROUGHT_SOIL && weather.no_rain_forecast_days >= 7) {
    droughtSignals.push(
      `soil moisture ${soil.moisture_pct}% with no rain forecast ${weather.no_rain_forecast_days} days`,
    );
    droughtConfidence += 18;
  }

  if (droughtSignals.length > 0) {
    const conf = Math.min(95, droughtConfidence - stalePenalty);
    const sev: AlertSeverity =
      droughtSignals.length >= 3 ? "critical" : droughtSignals.length === 2 ? "high" : "medium";
    alerts.push({
      type: "DROUGHT",
      severity: sev,
      zone: `${zone.name} Zone`,
      timeframe: "10-day window",
      signal: droughtSignals.join(", "),
      prediction: `Drought stress developing. Crop yield risk ${sev === "critical" ? "severe" : "moderate"} if uncorrected.`,
      action: "Increase irrigation 30%. Pre-fill reservoir. Switch to drip if available.",
      confidence: conf,
      sources: [ndvi?.source, spi?.zone_id, soil?.source, baseline.source].filter((source): source is string => Boolean(source)),
      spatial_zone_id: zone.spatial_zone_id,
      stale_data: isStale,
      low_confidence_critical: sev === "critical" && conf < 70,
    });
  }

  // (MONSOON check moved to regional level to avoid duplication)

  // ── CLEAR (no threats) ──────────────────────────────────

  // (CLEAR check moved to regional level to avoid duplication)

  return alerts;
}

// ── SMS summary builder (≤ 160 chars) ──────────────────────
function buildSms(alerts: AgentAlert[]): string {
  const activeAlerts = alerts.filter((a) => a.type !== "CLEAR");
  if (activeAlerts.length === 0) {
    return "SmartPaddy: All zones CLEAR. No threats. Next check in 6h.";
  }
  const parts = activeAlerts.slice(0, 3).map((a) => {
    const zone = a.zone.replace(" Zone", "");
    const short = a.action.split(".")[0];
    return `${a.type} ${zone}: ${short}`;
  });
  const msg = "AgriAlert: " + parts.join(". ") + ".";
  return msg.length <= 160 ? msg : msg.substring(0, 157) + "...";
}

// ── Main agent run function ──────────────────────────────────
export async function runWeatherDisasterAgent(
  selectedZoneIds: string[] = ["north", "central", "south"],
  liveSensors?: { soilMoisture: number | null; timestamp: string | null },
): Promise<AgentRunResult> {
  const now = new Date();

  // 1. Fetch real weather for primary zone (Kedah as anchor)
  const primaryZone = FARM_ZONES.find((z) => z.id === "north") ?? FARM_ZONES[0];
  const [weather, baseline] = await Promise.all([
    fetchWeather(primaryZone.lat, primaryZone.lon),
    fetchNasaPowerBaseline(primaryZone.lat, primaryZone.lon),
  ]);

  // 2. Use only real or directly-derived data. NDVI/SPI stay unavailable unless a real feed is connected.
  const zones = FARM_ZONES.filter((z) => selectedZoneIds.includes(z.id));
  const soil: SoilReading[] =
    liveSensors?.soilMoisture !== null && liveSensors?.soilMoisture !== undefined
      ? [{
          zone_id: primaryZone.spatial_zone_id,
          moisture_pct: liveSensors.soilMoisture,
          source: "Firebase RTDB live soil sensor",
          timestamp: liveSensors.timestamp ?? now.toISOString(),
        }]
      : [];
  const ndvi: NdviReading[] = [];
  const spi: SpiReading[] = [];
  const monsoon = deriveMonsoonTrack(weather);

  // 3. Run threshold engine for each zone
  const allAlerts: AgentAlert[] = [];
  for (const zone of zones) {
    const zoneSoil = soil.find((s) => s.zone_id === zone.spatial_zone_id) ?? null;
    const zoneNdvi = ndvi.find((n) => n.zone_id === zone.spatial_zone_id) ?? null;
    const zoneSpi = spi.find((s) => s.zone_id === zone.spatial_zone_id) ?? null;
    const zoneAlerts = runThresholds(zone, weather, zoneSoil, zoneNdvi, zoneSpi, monsoon, baseline);
    allAlerts.push(...zoneAlerts);
  }

  // 4. Regional MONSOON check (Deduplicated)
  const isStale = weather.data_age_hours > 3;
  const stalePenalty = isStale ? 15 : 0;
  const monsoonSignals: string[] = [];
  let monsoonConfidence = 50;

  if (monsoon.front_days_away <= 5) {
    monsoonSignals.push(`monsoon front ${monsoon.front_days_away} days away`);
    monsoonConfidence += 20;
  }
  if (monsoon.sw_wind_detected) {
    monsoonSignals.push(`SW wind shift detected (${windCardinal(weather.wind_direction_deg)} @ ${weather.wind_speed_kmh} km/h)`);
    monsoonConfidence += 15;
  }
  if (monsoon.humidity_3day_above_75) {
    monsoonSignals.push(`3-day avg humidity ${weather.humidity_3day_avg}% (>75% threshold)`);
    monsoonConfidence += 15;
  }

  if (monsoonSignals.length >= 2) {
    const conf = Math.min(93, monsoonConfidence - stalePenalty);
    const sev: AlertSeverity = monsoonSignals.length === 3 ? "high" : "medium";
    allAlerts.push({
      type: "MONSOON",
      severity: sev,
      zone: "All Zones (Regional)",
      timeframe: "5-day window",
      signal: monsoonSignals.join(", "),
      prediction: "Monsoon onset imminent. Expect sustained heavy rainfall across the farm region.",
      action: "Prepare drainage. Check bunding. Schedule pest scouting post-onset.",
      confidence: conf,
      sources: [monsoon.source, weather.source],
      spatial_zone_id: "all_zones",
      stale_data: isStale,
      low_confidence_critical: sev === "critical" && conf < 70,
    });
  }

  // Remove "CLEAR" if we have a regional monsoon alert
  if (allAlerts.some(a => a.type === "MONSOON")) {
    const clearIndex = allAlerts.findIndex(a => a.type === "CLEAR");
    if (clearIndex !== -1) allAlerts.splice(clearIndex, 1);
  }

  // 5. Regional CLEAR check (Deduplicated)
  if (allAlerts.length === 0) {
    allAlerts.push({
      type: "CLEAR",
      severity: "low",
      zone: "All Zones",
      timeframe: "48 hours",
      signal: `Rain ${weather.rainfall_48h_mm}mm, Temp ${weather.temperature_max_c}°C`,
      prediction: "No active weather threats detected across any zones.",
      action: "No active threats. Next scheduled check in 6 hours.",
      confidence: 90 - stalePenalty,
      sources: [weather.source],
      spatial_zone_id: "all_zones",
      stale_data: isStale,
    });
  }

  // 6. Hard rule: critical alerts always fire
  // (already enforced — thresholds fire regardless of confidence)

  // 5. Build result
  return {
    run_timestamp: now.toISOString(),
    farm_location: `${primaryZone.lat}°N, ${primaryZone.lon}°E (Malaysia)`,
    alerts: allAlerts,
    summary_sms: buildSms(allAlerts),
    next_run_in_hours: 6,
    weather,
    soil,
    ndvi,
    spi,
    monsoon,
    baseline,
  };
}
