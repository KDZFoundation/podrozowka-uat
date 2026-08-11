import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CartProvider } from "@/contexts/CartContext";
import { CheckoutProvider } from "@/contexts/CheckoutContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import RegisterPostcard from "./pages/RegisterPostcard";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Returns from "./pages/Returns";
import Shop from "./pages/Shop";
import ShopProduct from "./pages/ShopProduct";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import CheckoutConfirmation from "./pages/CheckoutConfirmation";
import ResetPassword from "./pages/ResetPassword";
import QrRegistrationTest from "./pages/QrRegistrationTest";
import Community from "./pages/Community";
import Map from "./pages/Map";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CartProvider>
        <CheckoutProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/spolecznosc" element={<Community />} />
                <Route path="/mapa" element={<Map />} />
                <Route path="/auth" element={<Auth mode="login" />} />
                <Route path="/logowanie" element={<Auth mode="login" />} />
                <Route path="/rejestracja" element={<Auth mode="signup" />} />
                <Route path="/odzyskiwanie-hasla" element={<Auth mode="forgot" />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/resetuj-haslo" element={<ResetPassword />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/checkout/potwierdzenie" element={<CheckoutConfirmation />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/r/:qrToken" element={<RegisterPostcard />} />
                <Route path="/test/rejestracja-qr" element={<QrRegistrationTest />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/polityka-prywatnosci" element={<PrivacyPolicy />} />
                <Route path="/regulamin" element={<Terms />} />
                <Route path="/zwroty" element={<Returns />} />
                <Route path="/sklep" element={<Shop />} />
                <Route path="/sklep/:id" element={<ShopProduct />} />
                <Route path="/koszyk" element={<Cart />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </CheckoutProvider>
      </CartProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
