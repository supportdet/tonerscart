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
    { to: "/search", label: "Toners", color: "#FF1F75" },
    { to: "/printers", label: "Printers", color: "#00D4E5" },
    { to: "/papers", label: "Papers", color: "#C58A6E" },
    { to: "/consumables", label: "Consumables", color: "#FFC107" },
    { to: "/scanners", label: "Scanners", color: "#5468FF" },
    { to: "/mps", label: "MPS/Rentals", color: "#3FD267" },
    { to: "/bulk", label: "Bulk Orders", color: "#FF7A00" },
    { to: "/dealer", label: "Dealer to Dealer", color: "#5E8CB5" },
    { to: "/oem", label: "OEM Marketplace", color: "#B58A75" },
    { to: "/procurement/login", label: "Govt Portal", color: "#1E3A8A" },
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
    const { user, logout, loading: authLoading } = useAuth();
    const { city, setCity, locPrompt, dismissLocationPrompt } = useCity();
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
        <header className="sticky top-0 z-[100] bg-white" data-testid="site-header">
            {/* Layer 1 — top bar */}
            <div
                className="bg-white text-[#0A0A0B] border-b border-[#E8E8EC]"
                style={{ height: 64 }}
                data-testid="navbar-top"
            >
                <div className="tc-container flex items-center h-full gap-2 sm:gap-4">
                    <Link to="/" className="flex items-center shrink-0 group" data-testid="logo-home-link" aria-label="TonersCart home">
                        <img
                            src="/TONERSCART-bg.png"
                            alt="TonersCart"
                            className="block h-9 sm:h-10 w-auto transition-transform group-hover:scale-[1.03]"
                            data-testid="header-logo-img"
                        />
                    </Link>

                    <div className="flex-1" />

                    {/* City */}
                    <div className="relative">
                        <button
                            onClick={() => { setCityOpen((o) => !o); if (locPrompt) dismissLocationPrompt(); }}
                            onBlur={() => setTimeout(() => setCityOpen(false), 150)}
                            className={`inline-flex items-center gap-1.5 sm:gap-2 text-[13px] font-medium px-2 sm:px-3 h-9 rounded-lg text-[#1D1D1F] hover:bg-black/[0.04] transition-colors${locPrompt ? " tc-loc-pulse" : ""}`}
                            data-testid="city-pill-btn"
                        >
                            <MapPin size={14} />
                            <span className="hidden xs:inline">{city}</span>
                            <span className="xs:hidden">{(city || "").slice(0, 3)}</span>
                            <ChevronDown size={12} />
                        </button>
                        {cityOpen && (
                            <div
                                className="absolute right-0 top-full mt-1.5 w-60 bg-white text-[#1D1D1F] rounded-xl shadow-xl border border-black/[0.08] py-2 max-h-72 overflow-auto z-20"
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

                        {/* Location coachmark — small walkthrough hint pointing up at
                            the city selector. Shown only when GPS was denied/unavailable. */}
                        {locPrompt && !cityOpen && (
                            <div className="tc-coachmark" role="dialog" aria-label="Set your location" data-testid="location-coachmark">
                                <span className="tc-coachmark-arrow" aria-hidden="true" />
                                <div className="flex items-start gap-2">
                                    <MapPin size={15} className="text-[#00B7C7] mt-0.5 shrink-0" />
                                    <div className="flex-1">
                                        <div className="text-[12.5px] font-semibold text-[#0A0A0B] leading-snug">Set your location</div>
                                        <div className="text-[11.5px] text-[#6E6E73] mt-0.5 leading-snug">Tap here to pick your city and see local dealers first.</div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                onClick={() => { dismissLocationPrompt(); setCityOpen(true); }}
                                                className="text-[11.5px] font-semibold px-2.5 h-7 rounded-md bg-[#0A0A0B] text-white hover:bg-black/80 transition-colors"
                                                data-testid="coachmark-choose-btn"
                                            >
                                                Choose city
                                            </button>
                                            <button
                                                onClick={dismissLocationPrompt}
                                                className="text-[11.5px] font-medium text-[#86868B] hover:text-[#0A0A0B] px-1.5 h-7"
                                                data-testid="coachmark-dismiss-btn"
                                            >
                                                Not now
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sell — outline pill on white. Hidden entirely while the
                        session is still being checked so logged-in users never
                        see a flash of "Sell". */}
                    {!authLoading && !isSeller && !isAdmin && (
                        <NavLink
                            to="/sell"
                            className="hidden sm:inline-flex items-center text-[13px] font-semibold px-4 h-9 rounded-lg text-[#0A0A0B] hover:bg-black/[0.04] transition-colors"
                            style={{ border: "1px solid #D2D2D7" }}
                            data-testid="nav-sell"
                        >
                            Sell
                        </NavLink>
                    )}

                    {authLoading ? (
                        /* Neutral navbar while session is verified — no auth buttons,
                           just a subtle placeholder so the layout doesn't jump. */
                        <div className="flex items-center gap-2" data-testid="header-auth-loading" aria-hidden="true">
                            <div className="w-9 h-9 rounded-full bg-black/[0.05] animate-pulse" />
                        </div>
                    ) : !user ? (
                        <>
                            <button
                                onClick={() => navigate("/login")}
                                className="text-[13px] font-medium text-[#1D1D1F] hover:text-[#0A0A0B] px-2 sm:px-3 h-9 rounded-lg hover:bg-black/[0.04] transition-colors whitespace-nowrap"
                                data-testid="header-login-btn"
                            >
                                Sign in
                            </button>
                            {!isAdmin && (
                                <button
                                    onClick={() => navigate("/cart")}
                                    className="relative w-10 h-10 grid place-items-center rounded-lg hover:bg-black/[0.04] text-[#0A0A0B] transition-colors"
                                    aria-label="Cart"
                                    data-testid="header-cart-btn"
                                >
                                    <ShoppingCart size={17} />
                                    {cartCount > 0 && (
                                        <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center" data-testid="header-cart-count">{cartCount}</span>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => navigate("/register")}
                                className="hidden xs:inline-flex items-center text-[13px] font-semibold px-3 sm:px-4 h-9 rounded-lg transition-transform active:scale-95 whitespace-nowrap"
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
                                    className="relative w-10 h-10 grid place-items-center rounded-lg hover:bg-black/[0.04] text-[#0A0A0B] transition-colors"
                                    aria-label="Cart"
                                    data-testid="header-cart-btn"
                                >
                                    <ShoppingCart size={17} />
                                    {cartCount > 0 && (
                                        <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center" data-testid="header-cart-count">{cartCount}</span>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => navigate(isSeller ? "/supplier" : isAdmin ? "/admin" : "/customer")}
                                className="text-[13px] font-medium text-[#1D1D1F] hover:text-[#0A0A0B] px-2 sm:px-3 h-9 rounded-lg hover:bg-black/[0.04] transition-colors max-w-[88px] sm:max-w-none truncate"
                                data-testid="header-user-chip"
                            >
                                {(user.name || "Account").split(" ")[0]}
                            </button>
                            <button
                                onClick={handleLogout}
                                className="text-[#86868B] hover:text-[#0A0A0B] p-2 rounded-lg hover:bg-black/[0.04] transition-colors"
                                data-testid="header-logout-btn"
                                aria-label="Log out"
                            >
                                <LogOut size={16} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Layer 2 — categories */}
            <nav
                className="bg-white"
                style={{ height: 56 }}
                data-testid="navbar-categories"
                aria-label="Categories"
            >
                <div className="tc-container h-full">
                    <div
                        className="flex items-center h-full gap-3 sm:gap-4 lg:gap-0 lg:justify-between overflow-x-auto tc-cat-scroll"
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
