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
import CustomerDashboard from "./pages/CustomerDashboard";
import SupplierDashboard from "./pages/SupplierDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OAuthCallback from "./pages/OAuthCallback";

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
