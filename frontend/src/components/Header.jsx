import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { LogOut, MapPin, ChevronDown } from "lucide-react";

export default function Header() {
    const { user, logout } = useAuth();
    const { city, setCity, requestGps } = useCity();
    const navigate = useNavigate();
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);
    const [cityOpen, setCityOpen] = useState(false);
    const ticking = useRef(false);
    const cityWrap = useRef(null);

    useEffect(() => {
        const onScroll = () => {
            if (ticking.current) return;
            ticking.current = true;
            requestAnimationFrame(() => {
                setScrolled(window.scrollY > 60);
                ticking.current = false;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => requestGps(), 1500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const onClick = (e) => { if (!cityWrap.current?.contains(e.target)) setCityOpen(false); };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const dashboardPath =
        user?.role === "admin" ? "/admin" :
        user?.role === "supplier" ? "/supplier" :
        user?.role === "customer" ? "/customer" : null;

    const isLanding = location.pathname === "/";
    const overHero = isLanding && !scrolled;
    // The pill is always "floating" on landing top; "stuck" once scrolled OR on non-landing
    const stuck = !isLanding || scrolled;

    return (
        <div className={`tc-nav-shell ${stuck ? "is-stuck" : ""}`} data-testid="site-header">
            <div className="tc-nav-pill">
                <Link to="/" className="flex items-center gap-2.5 group min-w-0" data-testid="logo-home-link">
                    <div className="relative w-8 h-8 rounded-lg bg-[#0A0A0B] grid place-items-center overflow-hidden shrink-0 transition-transform group-hover:scale-105">
                        <span className="text-white font-bold text-[13px] relative z-10 tracking-tight">TC</span>
                        <span className="absolute top-0 left-0 w-1.5 h-1.5 bg-[#00B7C7]" />
                        <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#E6007E]" />
                        <span className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-[#F5C400]" />
                    </div>
                    <span className="font-semibold tracking-tight text-[16px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>TonersCart</span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    <NavLink to="/search" className={({ isActive }) => `tc-nav-link ${isActive ? "active" : ""}`} data-testid="nav-search">Browse</NavLink>
                    <NavLink to="/register?role=supplier" className={({ isActive }) => `tc-nav-link ${isActive ? "active" : ""}`} data-testid="nav-sell">Sell</NavLink>
                    {user?.role === "supplier" && <NavLink to="/supplier" className={({ isActive }) => `tc-nav-link ${isActive ? "active" : ""}`} data-testid="nav-supplier">Seller</NavLink>}
                    {user?.role === "customer" && <NavLink to="/customer" className={({ isActive }) => `tc-nav-link ${isActive ? "active" : ""}`} data-testid="nav-customer">Orders</NavLink>}
                    {user?.role === "admin" && <NavLink to="/admin" className={({ isActive }) => `tc-nav-link ${isActive ? "active" : ""}`} data-testid="nav-admin">Admin</NavLink>}
                </nav>

                <div className="flex items-center gap-2">
                    {/* City picker */}
                    <div className="relative" ref={cityWrap}>
                        <button onClick={() => setCityOpen((o) => !o)} className="tc-city-pill" data-testid="city-pill-btn">
                            <MapPin size={13} />
                            <span>{city}</span>
                            <ChevronDown size={12} />
                        </button>
                        {cityOpen && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-black/[0.06] py-2 z-50 max-h-72 overflow-auto" data-testid="city-dropdown">
                                <div className="px-3 py-1.5 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">Choose your city</div>
                                {KNOWN_CITIES.map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => { setCity(c); setCityOpen(false); }}
                                        className={`block w-full text-left px-3 py-1.5 text-[13.5px] hover:bg-black/[0.04] ${c === city ? "text-[#0A0A0B] font-semibold bg-black/[0.03]" : "text-[#1D1D1F]"}`}
                                        data-testid={`city-option-${c}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {!user ? (
                        <>
                            <button onClick={() => navigate("/login")} className="tc-nav-link hidden sm:inline-flex" data-testid="header-login-btn">Sign in</button>
                            <button onClick={() => navigate("/register")} className="btn-cta text-[13px]" data-testid="header-register-btn">Join</button>
                        </>
                    ) : (
                        <button
                            onClick={() => dashboardPath && navigate(dashboardPath)}
                            className="tc-nav-link"
                            data-testid="header-user-chip"
                        >
                            {user.name.split(" ")[0]}
                        </button>
                    )}
                    {user && (
                        <button onClick={async () => { await logout(); navigate("/"); }} className="tc-nav-link" data-testid="header-logout-btn">
                            <LogOut size={14} className="inline -mt-0.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
