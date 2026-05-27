import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { CityProvider } from "./context/CityContext";
import { CartProvider } from "./context/CartContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import AIChatWidget from "./components/AIChatWidget";
import CookieConsent from "./components/CookieConsent";
import Landing from "./pages/Landing";
import SearchPage from "./pages/Search";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Sell from "./pages/Sell";
import MPS from "./pages/MPS";
import PrintersGuide from "./pages/PrintersGuide";
import PrintersResults from "./pages/PrintersResults";
import Papers from "./pages/Papers";
import CustomerDashboard from "./pages/CustomerDashboard";
import SupplierDashboard from "./pages/SupplierDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OAuthCallback from "./pages/OAuthCallback";
import OrderConfirmed from "./pages/OrderConfirmed";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Contact from "./pages/Contact";
import GetFeatured from "./pages/GetFeatured";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import About from "./pages/About";
import ProductDetail from "./pages/ProductDetail";
import NotFound from "./pages/NotFound";
import ComingSoon from "./pages/ComingSoon";
import Bulk from "./pages/Bulk";
import Dealer from "./pages/Dealer";
import OEM from "./pages/OEM";
import ErrorBoundary from "./components/ErrorBoundary";
import VisitorTracker from "./components/VisitorTracker";

function App() {
    return (
        <HelmetProvider>
        <div className="App min-h-screen flex flex-col">
            <BrowserRouter>
                <CityProvider>
                    <CartProvider>
                        <AuthProvider>
                            <Header />
                            <VisitorTracker />
                            <main className="flex-1">
                                <ErrorBoundary>
                                <Routes>
                                    <Route path="/" element={<Landing />} />
                                    <Route path="/search" element={<SearchPage />} />
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/register" element={<Register />} />
                                    <Route path="/forgot-password" element={<ForgotPassword />} />
                                    <Route path="/reset-password" element={<ResetPassword />} />
                                    <Route path="/auth/callback" element={<OAuthCallback />} />
                                    <Route path="/cart" element={<Cart />} />
                                    <Route path="/checkout" element={<Checkout />} />
                                    <Route path="/sell" element={<Sell />} />
                                    <Route path="/mps" element={<MPS />} />
                                    <Route path="/printers" element={<PrintersGuide />} />
                                    <Route path="/printers/results" element={<PrintersResults />} />
                                    <Route path="/papers" element={<Papers />} />
                                    <Route path="/consumables" element={<ComingSoon category="Consumables" accent="#f9a825" blurb="Inks, drums, fusers, maintenance kits and more — sourced directly from verified dealers. Be the first to know when we go live." />} />
                                    <Route path="/scanners" element={<ComingSoon category="Scanners" accent="#5c6bc0" blurb="Desktop, network and production scanners from leading brands — coming to TonersCart soon. Get notified when we launch." />} />
                                    <Route path="/bulk" element={<Bulk />} />
                                    <Route path="/dealer" element={<Dealer />} />
                                    <Route path="/oem" element={<OEM />} />
                                    <Route path="/terms" element={<Terms />} />
                                    <Route path="/privacy" element={<Privacy />} />
                                    <Route path="/contact" element={<Contact />} />
                                    <Route path="/get-featured" element={<GetFeatured />} />
                                    <Route path="/about" element={<About />} />
                                    <Route path="/toner/:id" element={<ProductDetail kind="toner" />} />
                                    <Route path="/printer/:id" element={<ProductDetail kind="printer" />} />
                                    <Route path="/paper/:id" element={<ProductDetail kind="paper" />} />
                                    <Route path="/order-confirmed/:id" element={<OrderConfirmed />} />
                                    <Route path="/order-confirmed" element={<OrderConfirmed />} />
                                    <Route path="/customer" element={<ProtectedRoute roles={["customer"]}><CustomerDashboard /></ProtectedRoute>} />
                                    <Route path="/supplier" element={<ProtectedRoute roles={["supplier"]}><SupplierDashboard /></ProtectedRoute>} />
                                    <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
                                    <Route path="*" element={<NotFound />} />
                                </Routes>
                                </ErrorBoundary>
                            </main>
                            <Footer />
                            <AIChatWidget />
                            <CookieConsent />
                            <Toaster richColors position="top-right" />
                        </AuthProvider>
                    </CartProvider>
                </CityProvider>
            </BrowserRouter>
        </div>
        </HelmetProvider>
    );
}

export default App;
