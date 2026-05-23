import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { CityProvider } from "./context/CityContext";
import { CartProvider } from "./context/CartContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import AIChatWidget from "./components/AIChatWidget";
import Landing from "./pages/Landing";
import SearchPage from "./pages/Search";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Sell from "./pages/Sell";
import MPS from "./pages/MPS";
import PrintersGuide from "./pages/PrintersGuide";
import PrintersResults from "./pages/PrintersResults";
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

function App() {
    return (
        <div className="App min-h-screen flex flex-col">
            <BrowserRouter>
                <CityProvider>
                    <CartProvider>
                        <AuthProvider>
                            <Header />
                            <main className="flex-1">
                                <Routes>
                                    <Route path="/" element={<Landing />} />
                                    <Route path="/search" element={<SearchPage />} />
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/register" element={<Register />} />
                                    <Route path="/auth/callback" element={<OAuthCallback />} />
                                    <Route path="/cart" element={<Cart />} />
                                    <Route path="/checkout" element={<Checkout />} />
                                    <Route path="/sell" element={<Sell />} />
                                    <Route path="/mps" element={<MPS />} />
                                    <Route path="/printers" element={<PrintersGuide />} />
                                    <Route path="/printers/results" element={<PrintersResults />} />
                                    <Route path="/terms" element={<Terms />} />
                                    <Route path="/privacy" element={<Privacy />} />
                                    <Route path="/contact" element={<Contact />} />
                                    <Route path="/order-confirmed/:id" element={<OrderConfirmed />} />
                                    <Route path="/order-confirmed" element={<OrderConfirmed />} />
                                    <Route path="/customer" element={<ProtectedRoute roles={["customer"]}><CustomerDashboard /></ProtectedRoute>} />
                                    <Route path="/supplier" element={<ProtectedRoute roles={["supplier"]}><SupplierDashboard /></ProtectedRoute>} />
                                    <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
                                </Routes>
                            </main>
                            <Footer />
                            <AIChatWidget />
                            <Toaster richColors position="top-right" />
                        </AuthProvider>
                    </CartProvider>
                </CityProvider>
            </BrowserRouter>
        </div>
    );
}

export default App;
