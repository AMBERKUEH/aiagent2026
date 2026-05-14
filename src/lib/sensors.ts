type UnknownRecord = Record<string, unknown>;

export type NormalizedSensors = {
  humidity: number | null;
  lightIntensity: number | null;
  soilMoisture: number | null;
  temperature: number | null;
  waterLevel: number | null;
  timestamp: string | null;
  source?: string | null;
  sourceKeys: string[];
  hasAnySensorValue: boolean;
};

const SENSOR_ALIASES = {
  humidity: ["humidity", "relative_humidity", "air_humidity", "humid"],
  lightIntensity: ["light_intensity", "light_lux", "lux", "light", "ldr"],
  soilMoisture: ["soil_moisture", "soilHumidity", "moisture", "soil"],
  temperature: ["temperature", "temp", "air_temperature"],
  waterLevel: ["water_level", "waterLevel", "water", "level", "distance"],
  timestamp: ["timestamp", "updated_at", "last_updated", "created_at", "time"],
  source: ["source", "sensor_source", "feed_source"],
} as const;

const SENSOR_RANGES = {
  humidity: { min: 20, max: 100 },
  lightIntensity: { min: 0, max: 120000 },
  soilMoisture: { min: 0, max: 100 },
  temperature: { min: 15, max: 45 },
  waterLevel: { min: 0, max: 50 },
} as const;

const MIN_VALID_TIMESTAMP_MS = Date.UTC(2000, 0, 1);
const MAX_VALID_FUTURE_OFFSET_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toSource = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const toNumberInRange = (range: { min: number; max: number }) => (value: unknown): number | null => {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return parsed >= range.min && parsed <= range.max ? parsed : null;
};

const normalizeTimestampMs = (value: number): number | null => {
  const now = Date.now();
  const asMilliseconds = value > 1e11 ? value : value * 1000;
  const isPlausible =
    asMilliseconds >= MIN_VALID_TIMESTAMP_MS &&
    asMilliseconds <= now + MAX_VALID_FUTURE_OFFSET_MS;

  return isPlausible ? asMilliseconds : null;
};

const toTimestamp = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) {
    const directParse = Date.parse(value);
    if (Number.isFinite(directParse)) {
      const normalized = normalizeTimestampMs(directParse);
      return normalized !== null ? new Date(normalized).toISOString() : null;
    }

    const numericValue = Number.parseFloat(value);
    if (Number.isFinite(numericValue)) {
      const normalized = normalizeTimestampMs(numericValue);
      return normalized !== null ? new Date(normalized).toISOString() : null;
    }

    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = normalizeTimestampMs(value);
    return normalized !== null ? new Date(normalized).toISOString() : null;
  }

  return null;
};

const toTimestampMs = (value: unknown): number | null => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return null;

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasDirectSensorFields = (payload: unknown) => {
  if (!isRecord(payload)) return false;

  const topLevelKeys = Object.keys(payload);
  const aliases = [
    ...SENSOR_ALIASES.humidity,
    ...SENSOR_ALIASES.lightIntensity,
    ...SENSOR_ALIASES.soilMoisture,
    ...SENSOR_ALIASES.temperature,
    ...SENSOR_ALIASES.waterLevel,
  ];

  return aliases.some((alias) =>
    topLevelKeys.some((key) => key.toLowerCase() === alias.toLowerCase())
  );
};

const flattenEntries = (
  value: unknown,
  path = "",
  result: Array<{ key: string; path: string; value: unknown }> = []
) => {
  if (!value || typeof value !== "object") return result;

  for (const [key, child] of Object.entries(value as UnknownRecord)) {
    const nextPath = path ? `${path}.${key}` : key;
    result.push({ key, path: nextPath, value: child });
    flattenEntries(child, nextPath, result);
  }

  return result;
};

const findFirstMatch = (
  entries: Array<{ key: string; path: string; value: unknown }>,
  aliases: readonly string[],
  parser: (value: unknown) => string | number | null
) => {
  for (const alias of aliases) {
    const direct = entries.find((entry) => entry.key === alias);
    if (!direct) continue;

    const parsed = parser(direct.value);
    if (parsed !== null) {
      return { value: parsed, path: direct.path };
    }
  }

  for (const alias of aliases) {
    const fuzzy = entries.find((entry) => entry.key.toLowerCase() === alias.toLowerCase());
    if (!fuzzy) continue;

    const parsed = parser(fuzzy.value);
    if (parsed !== null) {
      return { value: parsed, path: fuzzy.path };
    }
  }

  return { value: null, path: null };
};

const normalizeSingleSensorPayload = (payload: unknown): NormalizedSensors => {
  const entries = flattenEntries(payload);
  const humidity = findFirstMatch(entries, SENSOR_ALIASES.humidity, toNumber);
  const lightIntensity = findFirstMatch(entries, SENSOR_ALIASES.lightIntensity, toNumberInRange(SENSOR_RANGES.lightIntensity));
  const soilMoisture = findFirstMatch(entries, SENSOR_ALIASES.soilMoisture, toNumberInRange(SENSOR_RANGES.soilMoisture));
  const temperature = findFirstMatch(entries, SENSOR_ALIASES.temperature, toNumberInRange(SENSOR_RANGES.temperature));
  const waterLevel = findFirstMatch(entries, SENSOR_ALIASES.waterLevel, toNumberInRange(SENSOR_RANGES.waterLevel));
  const timestamp = findFirstMatch(entries, SENSOR_ALIASES.timestamp, toTimestamp);
  const source = findFirstMatch(entries, SENSOR_ALIASES.source, toSource);
  const normalizedHumidity = toNumberInRange(SENSOR_RANGES.humidity)(humidity.value);
  const normalizedLightIntensity = lightIntensity.value as number | null;
  const normalizedSoilMoisture = soilMoisture.value as number | null;
  const normalizedTemperature = temperature.value as number | null;
  const normalizedWaterLevel = waterLevel.value as number | null;

  return {
    humidity: normalizedHumidity,
    lightIntensity: normalizedLightIntensity,
    soilMoisture: normalizedSoilMoisture,
    temperature: normalizedTemperature,
    waterLevel: normalizedWaterLevel,
    timestamp: (timestamp.value as string | null) ?? new Date().toISOString(),
    source: source.value as string | null,
    sourceKeys: [
      humidity.path,
      lightIntensity.path,
      soilMoisture.path,
      temperature.path,
      waterLevel.path,
      source.path,
      source.value,
    ].filter((value): value is string => Boolean(value)),
    hasAnySensorValue: [
      normalizedHumidity,
      normalizedLightIntensity,
      normalizedSoilMoisture,
      normalizedTemperature,
      normalizedWaterLevel,
    ].some((value) => value !== null),
  };
};

const getLatestSensorHistoryEntry = (payload: unknown): unknown => {
  if (!isRecord(payload)) return payload;

  if (hasDirectSensorFields(payload)) {
    return payload;
  }

  const candidates = Object.values(payload)
    .filter(isRecord)
    .map((entry, index) => {
      const normalized = normalizeSingleSensorPayload(entry);
      const entries = flattenEntries(entry);
      const timestamp = findFirstMatch(entries, SENSOR_ALIASES.timestamp, toTimestampMs).value;

      return {
        entry,
        index,
        hasAnySensorValue: normalized.hasAnySensorValue,
        timestampMs: typeof timestamp === "number" ? timestamp : null,
      };
    })
    .filter((candidate) => candidate.hasAnySensorValue);

  if (candidates.length === 0) {
    return payload;
  }

  candidates.sort((left, right) => {
    if (left.timestampMs !== null && right.timestampMs !== null) {
      return left.timestampMs - right.timestampMs;
    }

    if (left.timestampMs !== null) return 1;
    if (right.timestampMs !== null) return -1;

    return left.index - right.index;
  });

  return candidates[candidates.length - 1].entry;
};

export const normalizeSensorPayload = (payload: unknown): NormalizedSensors => {
  const latestPayload = getLatestSensorHistoryEntry(payload);
  return normalizeSingleSensorPayload(latestPayload);
};
