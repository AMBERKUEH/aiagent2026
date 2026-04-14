import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardPage from "./pages/DashboardPage";
import PredictionPage from "./pages/PredictionPage";
import ChatPage from "./pages/ChatPage";
import MarketPage from "./pages/MarketPage";
import MapPage from "./pages/MapPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/prediction" element={<PredictionPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
