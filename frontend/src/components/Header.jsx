import React, { useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { LogOut, MapPin, ChevronDown } from "lucide-react";

const navLink = ({ isActive }) =>
    `text-[14px] font-medium px-3.5 py-2 rounded-md transition-colors ${
        isActive ? "text-[#0A0A0B] bg-black/[0.05]" : "text-[#1D1D1F] hover:text-[#0A0A0B] hover:bg-black/[0.04]"
    }`;

export default function Header() {
    const { user, logout } = useAuth();
    const { city, setCity } = useCity();
    const navigate = useNavigate();
    const [cityOpen, setCityOpen] = useState(false);

    const dashboardPath =
        user?.role === "admin" ? "/admin" :
        user?.role === "supplier" ? "/supplier" :
        user?.role === "customer" ? "/customer" : null;

    return (
        <header className="bg-white border-b border-black/[0.06] sticky top-0 z-50" data-testid="site-header">
            <div className="tc-container flex items-center justify-between h-16 gap-4">
                <Link to="/" className="flex items-center gap-2.5 group" data-testid="logo-home-link">
                    <div className="relative w-8 h-8 rounded-lg bg-[#0A0A0B] grid place-items-center overflow-hidden shrink-0 transition-transform group-hover:scale-105">
                        <span className="text-white font-bold text-[13px] relative z-10 tracking-tight">TC</span>
                        <span className="absolute top-0 left-0 w-1.5 h-1.5 bg-[#00B7C7]" />
                        <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#E6007E]" />
                        <span className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-[#F5C400]" />
                    </div>
                    <span className="font-semibold text-[#0A0A0B] tracking-tight text-[17px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>TonersCart</span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    <NavLink to="/search" className={navLink} data-testid="nav-search">Browse</NavLink>
                    <NavLink to="/register?role=supplier" className={navLink} data-testid="nav-sell">Sell</NavLink>
                    {user?.role === "supplier" && <NavLink to="/supplier" className={navLink} data-testid="nav-supplier">Seller</NavLink>}
                    {user?.role === "customer" && <NavLink to="/customer" className={navLink} data-testid="nav-customer">Orders</NavLink>}
                    {user?.role === "admin" && <NavLink to="/admin" className={navLink} data-testid="nav-admin">Admin</NavLink>}
                </nav>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button onClick={() => setCityOpen((o) => !o)} onBlur={() => setTimeout(() => setCityOpen(false), 150)}
                            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-md text-[#1D1D1F] hover:bg-black/[0.04]"
                            data-testid="city-pill-btn">
                            <MapPin size={13} />
                            <span>{city}</span>
                            <ChevronDown size={12} />
                        </button>
                        {cityOpen && (
                            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-black/[0.08] py-2 z-50 max-h-72 overflow-auto" data-testid="city-dropdown">
                                <div className="px-3 py-1 text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B]">Choose your city</div>
                                {KNOWN_CITIES.map((c) => (
                                    <button key={c} onMouseDown={() => { setCity(c); setCityOpen(false); }}
                                        className={`block w-full text-left px-3 py-1.5 text-[13.5px] hover:bg-black/[0.04] ${c === city ? "text-[#0A0A0B] font-semibold bg-black/[0.03]" : "text-[#1D1D1F]"}`}
                                        data-testid={`city-option-${c}`}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {!user ? (
                        <>
                            <button onClick={() => navigate("/login")} className="text-[14px] font-medium text-[#1D1D1F] hover:text-[#0A0A0B] px-3 py-2 rounded-md hover:bg-black/[0.04]" data-testid="header-login-btn">Sign in</button>
                            <button onClick={() => navigate("/register")} className="btn-cta text-[13px]" data-testid="header-register-btn">Join free</button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => dashboardPath && navigate(dashboardPath)} className="text-[14px] font-medium text-[#1D1D1F] hover:text-[#0A0A0B] px-3 py-2 rounded-md hover:bg-black/[0.04]" data-testid="header-user-chip">
                                {user.name.split(" ")[0]}
                            </button>
                            <button onClick={async () => { await logout(); navigate("/"); }} className="text-[14px] text-[#6E6E73] hover:text-[#0A0A0B] p-2 rounded-md hover:bg-black/[0.04]" data-testid="header-logout-btn">
                                <LogOut size={15} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
