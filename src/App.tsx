import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { FarmContextProvider } from "@/lib/agents/FarmContextProvider";
import CommandCenterPage from "./pages/CommandCenterPage";
import LoginPage from "./pages/LoginPage";
import ScenarioExplorerPage from "./pages/ScenarioExplorerPage";
import MapPage from "./pages/MapPage";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <FarmContextProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<ProtectedRoute><CommandCenterPage /></ProtectedRoute>} />
              <Route path="/scenarios" element={<ProtectedRoute><ScenarioExplorerPage /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
              <Route path="/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
              <Route path="/scanner" element={<ProtectedRoute><Navigate to="/" replace /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </FarmContextProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
