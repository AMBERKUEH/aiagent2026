import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Store, TrendingDown, TrendingUp } from "lucide-react";

import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMarketSnapshot } from "@/lib/agents/economicIntelAgent";
import type { MarketSnapshot } from "@/lib/agents/types";

const trendIcon = {
  up: TrendingUp,
  stable: Store,
  down: TrendingDown,
};

export default function MarketPage() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMarket = async () => {
    setIsLoading(true);
    const snapshot = await fetchMarketSnapshot();
    setMarket(snapshot);
    setIsLoading(false);
  };

  useEffect(() => {
    loadMarket();
  }, []);

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-5 pb-8">
        <section className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Market Intelligence</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-900">Live Market Feed</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Fertilizer and paddy prices are shown only when a real market API is configured and returns data.
              </p>
            </div>
            <Button onClick={loadMarket} disabled={isLoading} className="bg-emerald-700 text-white hover:bg-emerald-800">
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </section>

        {isLoading && (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
              <RefreshCw className="h-5 w-5 animate-spin text-emerald-700" />
              Loading market API...
            </CardContent>
          </Card>
        )}

        {!isLoading && market?.status === "unavailable" && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-6">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-900">Market feed unavailable</p>
                <p className="mt-1 text-sm text-amber-800">{market.error}</p>
                <p className="mt-2 text-xs text-amber-700">
                  Set `VITE_MARKET_API_URL` to a real endpoint that returns fertilizer prices and paddy price data.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && market?.status === "available" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Paddy Price</CardTitle>
                  <CardDescription>Source: {market.source}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-800">
                    {market.paddyPricePerKgRM === null ? "Unavailable" : `RM ${market.paddyPricePerKgRM.toFixed(2)}/kg`}
                  </p>
                  {market.demandLevel && (
                    <Badge className="mt-3 bg-emerald-700 text-white hover:bg-emerald-700">
                      Demand: {market.demandLevel}
                    </Badge>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Feed Health</CardTitle>
                  <CardDescription>No generated prices are added by SmartPaddy.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">
                    {market.fertilizers.length} fertilizer records returned from the configured API.
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Store className="h-5 w-5 text-emerald-700" />
                  Fertilizer Prices
                </CardTitle>
                <CardDescription>Real API records only.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {market.fertilizers.length === 0 && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    The market API responded, but no fertilizer records were returned.
                  </p>
                )}

                {market.fertilizers.map((fertilizer) => {
                  const Icon = trendIcon[fertilizer.trend];
                  return (
                    <div key={fertilizer.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                      <div>
                        <p className="font-semibold text-slate-900">{fertilizer.name}</p>
                        <p className="text-xs text-slate-500">Weekly change: {fertilizer.weeklyChangePct}%</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-emerald-700" />
                        <span className="font-bold text-emerald-800">RM {fertilizer.priceRM.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
