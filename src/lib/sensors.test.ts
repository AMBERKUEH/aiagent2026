import { describe, expect, it } from "vitest";
import { normalizeSensorPayload } from "./sensors";

describe("normalizeSensorPayload", () => {
  it("accepts complete demo sensor feed readings", () => {
    const sensors = normalizeSensorPayload({
      humidity: 82,
      light_intensity: 14000,
      soil_moisture: 72,
      temperature: 31,
      water_level: 2.1,
      timestamp: "2026-05-08T06:00:00.000Z",
      source: "demo_sensor_feed",
    });

    expect(sensors.hasAnySensorValue).toBe(true);
    expect(sensors.humidity).toBe(82);
    expect(sensors.lightIntensity).toBe(14000);
    expect(sensors.soilMoisture).toBe(72);
    expect(sensors.temperature).toBe(31);
    expect(sensors.waterLevel).toBe(2.1);
    expect(sensors.source).toBe("demo_sensor_feed");
    expect(sensors.sourceKeys).toContain("demo_sensor_feed");
  });

  it("rejects impossible Malaysian paddy temperature values", () => {
    const sensors = normalizeSensorPayload({
      humidity: 82,
      light_intensity: 14000,
      soil_moisture: 72,
      temperature: 0,
      water_level: 2.1,
      timestamp: "2026-05-08T06:00:00.000Z",
      source: "demo_sensor_feed",
    });

    expect(sensors.temperature).toBeNull();
    expect(sensors.soilMoisture).toBe(72);
  });
});
