import { useEffect, useMemo, useState } from "react";
import L, { DivIcon } from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";
import { AlertTriangle, Bot, Droplets, Layers3, Leaf, TrendingUp } from "lucide-react";

import "leaflet/dist/leaflet.css";

import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type LatLng = [number, number];

type Farm = {
  id: string;
  name: string;
  location: string;
  position: LatLng;
  soilMoisture: number;
  ph: number;
  npk: { n: number; p: number; k: number };
  predictedYield: number;
};

type Supplier = {
  id: string;
  name: string;
  position: LatLng;
  ureaPrice: number;
};

type RiskLevel = "high" | "medium" | "low";

type Zone = {
  id: string;
  label: string;
  center: LatLng;
  radius: number;
  risk?: RiskLevel;
  priceLevel?: "high" | "low";
  recommendation?: string;
};

const farmData: Farm[] = [
  {
    id: "farm-kedah-a",
    name: "Kedah Cluster A",
    location: "Kedah",
    position: [6.118, 100.367],
    soilMoisture: 42,
    ph: 5.8,
    npk: { n: 36, p: 49, k: 44 },
    predictedYield: 4.6,
  },
  {
    id: "farm-perlis-b",
    name: "Perlis North Plot",
    location: "Perlis",
    position: [6.444, 100.202],
    soilMoisture: 51,
    ph: 6.3,
    npk: { n: 45, p: 43, k: 47 },
    predictedYield: 5.1,
  },
  {
    id: "farm-sekinchan",
    name: "Sekinchan Hub",
    location: "Selangor",
    position: [3.503, 101.110],
    soilMoisture: 39,
    ph: 5.6,
    npk: { n: 34, p: 46, k: 41 },
    predictedYield: 4.2,
  },
];

const suppliers: Supplier[] = [
  { id: "sup-a", name: "AgriOne Depot", position: [6.05, 100.40], ureaPrice: 99 },
  { id: "sup-b", name: "GreenField Supply", position: [3.42, 101.20], ureaPrice: 103 },
  { id: "sup-c", name: "Muda AgroMart", position: [5.95, 100.48], ureaPrice: 97 },
];

const riskZones: Zone[] = [
  { id: "risk-kedah", label: "Kedah", center: [6.02, 100.45], radius: 35000, risk: "high" },
  { id: "risk-perak", label: "Perak", center: [4.88, 100.84], radius: 38000, risk: "medium" },
  { id: "risk-selangor", label: "Selangor", center: [3.45, 101.25], radius: 30000, risk: "low" },
];

const fertilizerPriceZones: Zone[] = [
  { id: "price-north", label: "Northern Belt", center: [6.15, 100.30], radius: 32000, priceLevel: "high" },
  { id: "price-central", label: "Central Plain", center: [3.55, 101.15], radius: 34000, priceLevel: "low" },
];

const cropRecommendationZones: Zone[] = [
  {
    id: "crop-kedah",
    label: "Kedah Muda",
    center: [5.98, 100.42],
    radius: 28000,
    recommendation: "Best for planting now",
  },
  {
    id: "crop-perlis",
    label: "Perlis Basin",
    center: [6.36, 100.24],
    radius: 24000,
    recommendation: "Best for planting now",
  },
];

const haversineKm = (from: LatLng, to: LatLng) => {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const farmIcon: DivIcon = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#15803d;border:2px solid #dcfce7;box-shadow:0 0 0 4px rgba(21,128,61,0.2);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const supplierIcon: DivIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:4px;background:#1d4ed8;border:2px solid #dbeafe;box-shadow:0 0 0 4px rgba(29,78,216,0.2);"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const riskColor: Record<RiskLevel, string> = {
  high: "#ef4444",
  medium: "#facc15",
  low: "#22c55e",
};

const MapPage = () => {
  const [showRisk, setShowRisk] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [showCropSuggestion, setShowCropSuggestion] = useState(true);
  const [selectedFarmId, setSelectedFarmId] = useState(farmData[0].id);
  const [insightIndex, setInsightIndex] = useState(0);

  const selectedFarm = useMemo(
    () => farmData.find((farm) => farm.id === selectedFarmId) ?? farmData[0],
    [selectedFarmId],
  );

  const nearestSuppliers = useMemo(() => {
    return suppliers
      .map((supplier) => ({
        ...supplier,
        distanceKm: haversineKm(selectedFarm.position, supplier.position),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 2);
  }, [selectedFarm.position]);

  const avgPredictedYield = useMemo(() => {
    const total = farmData.reduce((sum, farm) => sum + farm.predictedYield, 0);
    return total / farmData.length;
  }, []);

  const aiInsights = useMemo(() => {
    const baseInsights = [
      "Based on current soil data, applying nitrogen fertilizer this week can increase yield by 18%.",
      "Drought risk detected. Consider irrigation in the next 3 days.",
      "Fertilizer prices expected to rise. Buying now is recommended.",
    ];

    const dynamicInsights = [
      `${selectedFarm.name}: soil moisture is ${selectedFarm.soilMoisture}%. Plan targeted irrigation cycles tonight.`,
      `${nearestSuppliers[0].name} is ${nearestSuppliers[0].distanceKm.toFixed(1)} km away with Urea at RM ${nearestSuppliers[0].ureaPrice}.`,
      showCropSuggestion
        ? "Crop suggestion layer is active: northern zones are best for planting now based on weather + soil simulation."
        : "Enable Crop Suggestion layer to view current high-potential planting zones.",
    ];

    return [...baseInsights, ...dynamicInsights];
  }, [nearestSuppliers, selectedFarm.name, selectedFarm.soilMoisture, showCropSuggestion]);

  useEffect(() => {
    const timer = setInterval(() => {
      setInsightIndex((current) => (current + 1) % aiInsights.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [aiInsights.length]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 via-lime-50 to-green-50">
          <CardHeader>
            <CardTitle className="text-2xl text-emerald-900">Malaysia Smart Farm Intelligence Map</CardTitle>
            <CardDescription className="text-emerald-800/80">
              Predictive map for drought risk, fertilizer pricing, crop suitability, and nearby supply decisions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
              <Layers3 className="mr-1 h-3 w-3" /> Interactive Layers
            </Badge>
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              Avg Predicted Yield: {avgPredictedYield.toFixed(1)} t/ha
            </Badge>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Drought risk in Kedah next 7 days
          </p>
        </div>

        <Card className="border-emerald-200">
          <CardHeader className="space-y-3">
            <CardTitle className="text-lg text-emerald-900">Map Layers</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showRisk ? "default" : "outline"}
                className={showRisk ? "bg-emerald-700 text-white hover:bg-emerald-800" : ""}
                onClick={() => setShowRisk((value) => !value)}
              >
                [Risk]
              </Button>
              <Button
                variant={showPrice ? "default" : "outline"}
                className={showPrice ? "bg-emerald-700 text-white hover:bg-emerald-800" : ""}
                onClick={() => setShowPrice((value) => !value)}
              >
                [Price]
              </Button>
              <Button
                variant={showCropSuggestion ? "default" : "outline"}
                className={showCropSuggestion ? "bg-emerald-700 text-white hover:bg-emerald-800" : ""}
                onClick={() => setShowCropSuggestion((value) => !value)}
              >
                [Crop Suggestion]
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-xl border border-emerald-200">
              <div className="h-[560px] w-full">
                <MapContainer center={[4.5, 102.0]} zoom={6} className="h-full w-full" scrollWheelZoom>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {showRisk
                    ? riskZones.map((zone) => (
                        <Circle
                          key={zone.id}
                          center={zone.center}
                          radius={zone.radius}
                          pathOptions={{
                            color: riskColor[zone.risk ?? "low"],
                            fillColor: riskColor[zone.risk ?? "low"],
                            fillOpacity: 0.28,
                          }}
                        >
                          <Tooltip>{zone.label} drought risk: {zone.risk}</Tooltip>
                        </Circle>
                      ))
                    : null}

                  {showPrice
                    ? fertilizerPriceZones.map((zone) => {
                        const color = zone.priceLevel === "high" ? "#ef4444" : "#22c55e";
                        return (
                          <Circle
                            key={zone.id}
                            center={zone.center}
                            radius={zone.radius}
                            pathOptions={{ color, fillColor: color, fillOpacity: 0.24 }}
                          >
                            <Tooltip>{zone.label} fertilizer price: {zone.priceLevel}</Tooltip>
                          </Circle>
                        );
                      })
                    : null}

                  {showCropSuggestion
                    ? cropRecommendationZones.map((zone) => (
                        <Circle
                          key={zone.id}
                          center={zone.center}
                          radius={zone.radius}
                          pathOptions={{ color: "#16a34a", fillColor: "#86efac", fillOpacity: 0.22 }}
                        >
                          <Tooltip permanent direction="center" opacity={0.8}>
                            {zone.recommendation}
                          </Tooltip>
                        </Circle>
                      ))
                    : null}

                  {farmData.map((farm) => {
                    const farmNearestSuppliers = suppliers
                      .map((supplier) => ({ ...supplier, distanceKm: haversineKm(farm.position, supplier.position) }))
                      .sort((a, b) => a.distanceKm - b.distanceKm)
                      .slice(0, 2);

                    const aiMessage =
                      farm.npk.n < 40
                        ? "Low nitrogen detected, fertilizer recommended"
                        : "NPK profile is balanced, maintain current nutrient schedule";

                    return (
                      <Marker
                        key={farm.id}
                        position={farm.position}
                        icon={farmIcon}
                        eventHandlers={{
                          click: () => setSelectedFarmId(farm.id),
                        }}
                      >
                        <Popup>
                          <div className="space-y-2 text-sm">
                            <p className="font-semibold text-emerald-900">{farm.name}</p>
                            <p>Soil moisture: {farm.soilMoisture}%</p>
                            <p>pH: {farm.ph}</p>
                            <p>
                              NPK: N {farm.npk.n} | P {farm.npk.p} | K {farm.npk.k}
                            </p>
                            <p>Predicted yield: {farm.predictedYield} t/ha</p>
                            <p className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">AI: {aiMessage}</p>
                            <div className="border-t pt-2">
                              <p className="text-xs font-semibold text-emerald-900">Nearby resources</p>
                              {farmNearestSuppliers.map((supplier) => (
                                <p key={supplier.id} className="text-xs">
                                  {supplier.name}: {supplier.distanceKm.toFixed(1)} km | RM {supplier.ureaPrice}
                                </p>
                              ))}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}

                  {suppliers.map((supplier) => (
                    <Marker key={supplier.id} position={supplier.position} icon={supplierIcon}>
                      <Popup>
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold text-blue-900">{supplier.name}</p>
                          <p>Urea price: RM {supplier.ureaPrice}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              <div className="pointer-events-none absolute right-4 top-4 z-[1000] max-w-sm">
                <div className="relative rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
                  <div className="absolute -bottom-1 right-8 h-3 w-3 rotate-45 border-b border-r border-emerald-200 bg-white/95" />
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    <Bot className="h-4 w-4" />
                    AI Insight
                  </p>
                  <p className="text-sm leading-relaxed text-emerald-900">{aiInsights[insightIndex]}</p>
                  <p className="mt-2 text-[11px] text-emerald-700/80">Auto-refresh every 4.5s</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-red-200 bg-red-50/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-red-900">
                <Droplets className="h-4 w-4" /> Risk Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-red-900">
              <p>Red = High drought risk</p>
              <p className="text-amber-700">Yellow = Medium risk</p>
              <p className="text-emerald-700">Green = Low risk</p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                <TrendingUp className="h-4 w-4" /> Fertilizer Price Layer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-amber-900">
              <p>Toggle price layer to compare high vs low fertilizer areas.</p>
              <p>Red zones indicate higher current price pressure.</p>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-emerald-900">
                <Leaf className="h-4 w-4" /> Crop Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-emerald-900">
              <p>Green highlighted zones are best for planting now.</p>
              <p>Model uses mock weather and soil suitability scores.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default MapPage;
