import { useMemo, useState } from "react";
import {
  Bot,
  Leaf,
  MapPin,
  ShoppingCart,
  Sprout,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Wheat,
} from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

type TrendStatus = "up" | "stable" | "down";

type Fertilizer = {
  name: string;
  nutrientFocus: string;
  suppliers: { name: string; price: number }[];
  trend: TrendStatus;
  groupDiscountPct: number;
};

const mockMarketData: { fertilizers: Fertilizer[]; soilByLocation: Record<string, { nitrogen: number; phosphorus: number; potassium: number }> } = {
  fertilizers: [
    {
      name: "Urea",
      nutrientFocus: "High Nitrogen",
      suppliers: [
        { name: "AgriOne", price: 99 },
        { name: "GreenField Depot", price: 103 },
        { name: "FarmerHub Supply", price: 101 },
      ],
      trend: "up",
      groupDiscountPct: 8,
    },
    {
      name: "NPK",
      nutrientFocus: "Balanced N-P-K",
      suppliers: [
        { name: "AgriOne", price: 118 },
        { name: "GreenField Depot", price: 114 },
        { name: "FarmerHub Supply", price: 116 },
      ],
      trend: "stable",
      groupDiscountPct: 6,
    },
    {
      name: "Organic",
      nutrientFocus: "Soil Conditioning",
      suppliers: [
        { name: "AgriOne", price: 131 },
        { name: "GreenField Depot", price: 125 },
        { name: "FarmerHub Supply", price: 127 },
      ],
      trend: "down",
      groupDiscountPct: 5,
    },
  ],
  soilByLocation: {
    kedah: { nitrogen: 39, phosphorus: 51, potassium: 46 },
    perak: { nitrogen: 45, phosphorus: 43, potassium: 48 },
    selangor: { nitrogen: 51, phosphorus: 41, potassium: 44 },
  },
};

const findCheapestSupplier = (suppliers: Fertilizer["suppliers"]) =>
  suppliers.reduce((lowest, current) => (current.price < lowest.price ? current : lowest));

const MarketPage = () => {
  const [cropType, setCropType] = useState("paddy");
  const [location, setLocation] = useState("Kedah");
  const [farmersJoined, setFarmersJoined] = useState(12);
  const [didJoin, setDidJoin] = useState(false);
  const [cropAmountKg, setCropAmountKg] = useState(850);

  const normalizedLocation = location.trim().toLowerCase();
  const soilData = mockMarketData.soilByLocation[normalizedLocation] ?? { nitrogen: 40, phosphorus: 46, potassium: 45 };

  const aiRecommendation = useMemo(() => {
    if (soilData.nitrogen < 42) {
      return { fertilizer: "Urea", confidence: 92, message: "Based on your soil nitrogen level, Urea is recommended" };
    }

    if (soilData.phosphorus < 42) {
      return { fertilizer: "NPK", confidence: 87, message: "Phosphorus is slightly low, NPK is recommended" };
    }

    return { fertilizer: "Organic", confidence: 81, message: "Soil balance is healthy, Organic fertilizer can maintain structure" };
  }, [soilData.nitrogen, soilData.phosphorus]);

  const marketTrend = useMemo(() => {
    const upCount = mockMarketData.fertilizers.filter((item) => item.trend === "up").length;
    return upCount >= 1
      ? { label: "Price increasing this week", color: "text-amber-700", bg: "bg-amber-100", icon: TrendingUp }
      : { label: "Stable", color: "text-emerald-700", bg: "bg-emerald-100", icon: TrendingDown };
  }, []);

  const urea = mockMarketData.fertilizers.find((item) => item.name === "Urea") ?? mockMarketData.fertilizers[0];
  const ureaCheapest = findCheapestSupplier(urea.suppliers);
  const discountedGroupPrice = +(ureaCheapest.price * (1 - urea.groupDiscountPct / 100)).toFixed(2);

  const suggestedPricePerKg = useMemo(() => {
    const base = 1.86;
    const demandPremium = 0.09;
    return +(base + demandPremium).toFixed(2);
  }, []);

  const estimatedRevenue = +(cropAmountKg * suggestedPricePerKg).toFixed(2);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-lime-50 to-green-50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">AI Market Decision Tool</p>
              <h2 className="mt-2 text-3xl font-bold text-emerald-900">Smart Farm Market Dashboard</h2>
              <p className="mt-2 text-sm text-emerald-800/80">Compare supplier prices, get AI fertilizer guidance, and optimize selling decisions in one place.</p>
            </div>
            <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">Live Mock Data</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-emerald-200/80 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-emerald-900">
                <Store className="h-5 w-5 text-emerald-700" />
                Fertilizer Price Comparison
              </CardTitle>
              <CardDescription>Urea, NPK, and Organic prices from multiple suppliers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {mockMarketData.fertilizers.map((fertilizer) => {
                const cheapest = findCheapestSupplier(fertilizer.suppliers);
                return (
                  <div key={fertilizer.name} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-emerald-900">{fertilizer.name}</h3>
                        <p className="text-xs text-emerald-800/70">{fertilizer.nutrientFocus}</p>
                      </div>
                      <Badge variant="secondary" className="bg-emerald-700/90 text-white">
                        Cheapest: RM {cheapest.price.toFixed(2)}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {fertilizer.suppliers.map((supplier) => (
                        <div key={supplier.name} className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Leaf className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm text-emerald-900">{supplier.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-emerald-900">RM {supplier.price.toFixed(2)}</span>
                            {supplier.price === cheapest.price ? (
                              <Badge className="bg-lime-600 text-white hover:bg-lime-600">Best Price</Badge>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-emerald-200/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-emerald-900">
                <Bot className="h-5 w-5 text-emerald-700" />
                AI Recommendation
              </CardTitle>
              <CardDescription>Simulated soil-based fertilizer recommendation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-emerald-800">Crop Type</label>
                <Input value={cropType} onChange={(event) => setCropType(event.target.value)} placeholder="paddy" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-emerald-800">Location</label>
                <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Kedah" />
              </div>

              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm text-emerald-900">
                <p className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-emerald-700" />
                  Soil profile for {location || "selected area"}
                </p>
                <p className="mt-2 text-xs text-emerald-800/80">N: {soilData.nitrogen} | P: {soilData.phosphorus} | K: {soilData.potassium}</p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-white p-3">
                <p className="text-sm font-semibold text-emerald-900">{aiRecommendation.message}</p>
                <p className="mt-1 text-xs text-emerald-800/80">Suggested for {cropType || "paddy"}: {aiRecommendation.fertilizer}</p>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-emerald-800">
                    <span>Confidence Score</span>
                    <span>{aiRecommendation.confidence}%</span>
                  </div>
                  <Progress value={aiRecommendation.confidence} className="h-2 bg-emerald-100 [&>div]:bg-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-emerald-200/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
                <TrendingUp className="h-5 w-5 text-emerald-700" />
                Price Trend Indicator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${marketTrend.bg} ${marketTrend.color}`}>
                <marketTrend.icon className="h-4 w-4" />
                {marketTrend.label}
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-200/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
                <Users className="h-5 w-5 text-emerald-700" />
                Group Buying
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-emerald-900">Join farmers buying {urea.name} together for lower pricing.</p>
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-medium">{farmersJoined} farmers joined</p>
                <p className="mt-1 text-xs text-emerald-800/80">Discounted group price: RM {discountedGroupPrice.toFixed(2)}</p>
              </div>
              <Button
                className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
                onClick={() => {
                  if (didJoin) return;
                  setFarmersJoined((current) => current + 1);
                  setDidJoin(true);
                }}
              >
                <ShoppingCart className="mr-1 h-4 w-4" />
                {didJoin ? "Joined Group Buy" : "Join Group Buy"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-emerald-200/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-emerald-900">
                <Wheat className="h-5 w-5 text-emerald-700" />
                Sell Crop
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-emerald-800">Crop Amount (kg)</label>
                <Input
                  type="number"
                  min={0}
                  value={cropAmountKg}
                  onChange={(event) => setCropAmountKg(Number(event.target.value) || 0)}
                />
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                <p>AI suggested selling price: RM {suggestedPricePerKg.toFixed(2)}/kg</p>
                <p className="mt-1 font-medium">Estimated value: RM {estimatedRevenue.toFixed(2)}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-700">High demand in nearby area</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-medium text-emerald-900">
            <Sprout className="h-4 w-4" />
            Decision Summary
          </p>
          <p className="mt-2">
            The current simulation suggests locking in <span className="font-semibold">{aiRecommendation.fertilizer}</span>, watching a short-term
            upward fertilizer trend, and timing paddy selling at RM {suggestedPricePerKg.toFixed(2)}/kg in active demand zones.
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default MarketPage;
