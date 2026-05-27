import React, { useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import { LogOut, MapPin, ChevronDown, ShoppingCart, Loader2 } from "lucide-react";

// Wave 10 — two-layer navbar.
// Layer 1 (top, dark): brand · city · sell · sign-in · cart · join-free.
// Layer 2 (white): horizontally-scrollable colored category pills.

const CATEGORY_PILLS = [
    { to: "/search", label: "Toners", color: "#d81b60" },
    { to: "/printers", label: "Printers", color: "#0097a7" },
    { to: "/papers", label: "Papers", color: "#795548" },
    { to: "/consumables", label: "Consumables", color: "#f9a825" },
    { to: "/scanners", label: "Scanners", color: "#5c6bc0" },
    { to: "/mps", label: "MPS/Rentals", color: "#43a047" },
    { to: "/bulk", label: "Buy Bulk", color: "#e65100" },
    { to: "/dealer", label: "Dealer to Dealer", color: "#607d8b" },
    { to: "/oem", label: "OEM Marketplace", color: "#6d4c41" },
];

function CategoryPill({ to, label, color, active }) {
    return (
        <NavLink
            to={to}
            data-testid={`nav-pill-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
            className={`tc-cat-pill${active ? " active" : ""}`}
            style={{ "--pill-color": color }}
        >
            <span className="tc-cat-pill-label">{label}</span>
        </NavLink>
    );
}

export default function Header() {
    const { user, logout } = useAuth();
    const { city, setCity } = useCity();
    const { count: cartCount } = useCart();
    const navigate = useNavigate();
    const location = useLocation();
    const [cityOpen, setCityOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const role = user?.role;
    const isSeller = role === "supplier";
    const isAdmin = role === "admin";
    const isBuyer = !!user && !isSeller && !isAdmin;

    const handleLogout = async () => {
        setLoggingOut(true);
        try { await logout(); } catch { /* ignore */ }
        try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
        window.location.replace("/");
    };

    const isActivePath = (to) => {
        const p = location.pathname;
        if (to === "/search") return p === "/search" || p.startsWith("/toner/");
        if (to === "/printers") return p === "/printers" || p.startsWith("/printer/") || p.startsWith("/printers/");
        if (to === "/papers") return p === "/papers" || p.startsWith("/paper/");
        return p === to || p.startsWith(`${to}/`);
    };

    return (
        <header className="sticky top-0 z-[100]" data-testid="site-header">
            {/* Layer 1 — top bar */}
            <div
                className="text-white"
                style={{ background: "#0A0A0B", height: 48 }}
                data-testid="navbar-top"
            >
                <div className="tc-container flex items-center h-full gap-3">
                    <Link to="/" className="flex items-center shrink-0 group" data-testid="logo-home-link" aria-label="TonersCart home">
                        <img
                            src="/TONERSCART-bg.png"
                            alt="TonersCart"
                            className="block h-7 sm:h-8 w-auto transition-transform group-hover:scale-[1.03]"
                            data-testid="header-logo-img"
                        />
                    </Link>

                    <div className="flex-1" />

                    {/* City — visible from xs (hidden label below 360px) */}
                    <div className="relative">
                        <button
                            onClick={() => setCityOpen((o) => !o)}
                            onBlur={() => setTimeout(() => setCityOpen(false), 150)}
                            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 py-1.5 rounded-md text-white hover:bg-white/10"
                            data-testid="city-pill-btn"
                        >
                            <MapPin size={13} />
                            <span className="hidden xs:inline">{city}</span>
                            <span className="xs:hidden">{(city || "").slice(0, 3)}</span>
                            <ChevronDown size={11} />
                        </button>
                        {cityOpen && (
                            <div
                                className="absolute right-0 top-full mt-1 w-56 bg-white text-[#1D1D1F] rounded-xl shadow-xl border border-black/[0.08] py-2 max-h-72 overflow-auto"
                                data-testid="city-dropdown"
                            >
                                <div className="px-3 py-1 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">Choose your city</div>
                                {KNOWN_CITIES.map((c) => (
                                    <button
                                        key={c}
                                        onMouseDown={() => { setCity(c); setCityOpen(false); }}
                                        className={`block w-full text-left px-3 py-1.5 text-[13.5px] hover:bg-black/[0.04] ${c === city ? "text-[#0A0A0B] font-semibold bg-black/[0.03]" : "text-[#1D1D1F]"}`}
                                        data-testid={`city-option-${c}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sell — black text link per spec */}
                    {!isSeller && !isAdmin && (
                        <NavLink
                            to="/sell"
                            className="hidden sm:inline-flex items-center text-[12.5px] font-semibold px-3 py-1.5 rounded-md bg-white text-[#0A0A0B] hover:bg-[#F5F5F7] transition-colors"
                            data-testid="nav-sell"
                        >
                            Sell
                        </NavLink>
                    )}

                    {!user ? (
                        <>
                            <button
                                onClick={() => navigate("/login")}
                                className="text-[12.5px] font-medium text-white/90 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-white/10"
                                data-testid="header-login-btn"
                            >
                                Sign in
                            </button>
                            {!isAdmin && (
                                <button
                                    onClick={() => navigate("/cart")}
                                    className="relative w-9 h-9 grid place-items-center rounded-md hover:bg-white/10 text-white"
                                    aria-label="Cart"
                                    data-testid="header-cart-btn"
                                >
                                    <ShoppingCart size={16} />
                                    {cartCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center" data-testid="header-cart-count">{cartCount}</span>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => navigate("/register")}
                                className="hidden xs:inline-flex items-center text-[12.5px] font-semibold px-3 py-1.5 rounded-md"
                                style={{ background: "#FFC107", color: "#0A0A0B" }}
                                data-testid="header-register-btn"
                            >
                                Join free
                            </button>
                        </>
                    ) : (
                        <>
                            {!isAdmin && (
                                <button
                                    onClick={() => navigate("/cart")}
                                    className="relative w-9 h-9 grid place-items-center rounded-md hover:bg-white/10 text-white"
                                    aria-label="Cart"
                                    data-testid="header-cart-btn"
                                >
                                    <ShoppingCart size={16} />
                                    {cartCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center" data-testid="header-cart-count">{cartCount}</span>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => navigate(isSeller ? "/supplier" : isAdmin ? "/admin" : "/customer")}
                                className="text-[12.5px] font-medium text-white/90 hover:text-white px-2.5 py-1.5 rounded-md hover:bg-white/10"
                                data-testid="header-user-chip"
                            >
                                {(user.name || "Account").split(" ")[0]}
                            </button>
                            <button
                                onClick={handleLogout}
                                className="text-white/70 hover:text-white p-1.5 rounded-md hover:bg-white/10"
                                data-testid="header-logout-btn"
                                aria-label="Log out"
                            >
                                <LogOut size={15} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Layer 2 — categories */}
            <nav
                className="bg-white border-b border-[#E8E8EC]"
                style={{ height: 44 }}
                data-testid="navbar-categories"
                aria-label="Categories"
            >
                <div className="tc-container h-full">
                    <div
                        className="flex items-stretch h-full gap-2 overflow-x-auto tc-cat-scroll"
                        role="tablist"
                    >
                        {CATEGORY_PILLS.map((p) => (
                            <CategoryPill key={p.to} {...p} active={isActivePath(p.to)} />
                        ))}
                    </div>
                </div>
            </nav>

            {loggingOut && (
                <div className="fixed inset-0 z-[3000] bg-[#0A0A0B]/70 backdrop-blur-sm flex items-center justify-center" role="alertdialog" aria-busy="true" data-testid="logout-overlay">
                    <div className="bg-white rounded-2xl px-6 py-5 shadow-2xl flex items-center gap-3">
                        <Loader2 size={18} className="animate-spin text-[#00B7C7]" />
                        <div className="text-[14px] font-semibold text-[#0A0A0B]">Logging out…</div>
                    </div>
                </div>
            )}
        </header>
    );
}
