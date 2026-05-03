import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import { LogOut, MapPin, ChevronDown, Menu, X, ShoppingCart } from "lucide-react";

const navLink = ({ isActive }) =>
    `text-[14px] font-medium px-3.5 py-2 rounded-md transition-colors ${
        isActive ? "text-[#0A0A0B] bg-black/[0.05]" : "text-[#1D1D1F] hover:text-[#0A0A0B] hover:bg-black/[0.04]"
    }`;

const mobileNavLink = ({ isActive }) =>
    `block px-4 py-3 rounded-lg text-[15px] font-medium ${
        isActive ? "text-[#0A0A0B] bg-black/[0.05]" : "text-[#1D1D1F] hover:bg-black/[0.04]"
    }`;

export default function Header() {
    const { user, logout } = useAuth();
    const { city, setCity } = useCity();
    const { count: cartCount } = useCart();
    const navigate = useNavigate();
    const [cityOpen, setCityOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const role = user?.role; // 'admin' | 'supplier' | 'customer' | undefined
    const isSeller = role === "supplier";
    const isAdmin = role === "admin";
    const isBuyer = !!user && !isSeller && !isAdmin;

    const closeMobile = () => setMobileOpen(false);

    return (
        <header className="bg-white border-b border-black/[0.06] sticky top-0 z-50" data-testid="site-header">
            <div className="tc-container flex items-center justify-between h-16 gap-3">
                <Link to="/" className="flex items-center gap-2.5 group shrink-0" data-testid="logo-home-link" onClick={closeMobile}>
                    <div className="relative w-8 h-8 rounded-lg bg-[#0A0A0B] grid place-items-center overflow-hidden shrink-0 transition-transform group-hover:scale-105">
                        <span className="text-white font-bold text-[13px] relative z-10 tracking-tight">TC</span>
                        <span className="absolute top-0 left-0 w-1.5 h-1.5 bg-[#00B7C7]" />
                        <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#E6007E]" />
                        <span className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-[#F5C400]" />
                    </div>
                    <span className="font-semibold text-[#0A0A0B] tracking-tight text-[17px]" style={{ fontFamily: "'Montserrat', sans-serif" }}>TonersCart</span>
                </Link>

                {/* Desktop nav */}
                <nav className="hidden md:flex items-center gap-1">
                    <NavLink to="/search" className={navLink} data-testid="nav-browse">Browse</NavLink>

                    {/* Sell — visible for guests, buyers and pending sellers; hidden for approved sellers */}
                    {!isSeller && !isAdmin && (
                        <NavLink to="/sell" className={navLink} data-testid="nav-sell">Sell</NavLink>
                    )}

                    {/* Buyer */}
                    {isBuyer && (
                        <NavLink to="/customer" className={navLink} data-testid="nav-orders">Orders</NavLink>
                    )}

                    {/* Approved seller */}
                    {isSeller && (
                        <>
                            <NavLink to="/supplier#listings" className={navLink} data-testid="nav-stock">My stock</NavLink>
                            <NavLink to="/supplier#orders" className={navLink} data-testid="nav-seller-orders">Orders</NavLink>
                        </>
                    )}

                    {/* Admin */}
                    {isAdmin && (
                        <NavLink to="/admin" className={navLink} data-testid="nav-admin">Admin</NavLink>
                    )}
                </nav>

                {/* Desktop right cluster */}
                <div className="hidden md:flex items-center gap-2">
                    {!isSeller && !isAdmin && (
                        <button onClick={() => navigate("/cart")} className="relative w-10 h-10 grid place-items-center rounded-md hover:bg-black/[0.04] text-[#1D1D1F]" aria-label="Cart" data-testid="header-cart-btn">
                            <ShoppingCart size={17} />
                            {cartCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center" data-testid="header-cart-count">{cartCount}</span>
                            )}
                        </button>
                    )}
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
                            <button onClick={() => navigate(isSeller ? "/supplier" : isAdmin ? "/admin" : "/customer")} className="text-[14px] font-medium text-[#1D1D1F] hover:text-[#0A0A0B] px-3 py-2 rounded-md hover:bg-black/[0.04]" data-testid="header-user-chip">
                                {(user.name || "Account").split(" ")[0]}
                            </button>
                            <button onClick={async () => { await logout(); navigate("/"); }} className="text-[14px] text-[#6E6E73] hover:text-[#0A0A0B] p-2 rounded-md hover:bg-black/[0.04]" data-testid="header-logout-btn">
                                <LogOut size={15} />
                            </button>
                        </>
                    )}
                </div>

                {/* Mobile cluster */}
                <div className="md:hidden flex items-center gap-1">
                    {!isSeller && !isAdmin && (
                        <button onClick={() => navigate("/cart")} className="relative w-10 h-10 grid place-items-center rounded-md hover:bg-black/[0.04]" aria-label="Cart" data-testid="header-cart-btn-mobile">
                            <ShoppingCart size={17} />
                            {cartCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center">{cartCount}</span>
                            )}
                        </button>
                    )}
                    {!user && (
                        <button onClick={() => navigate("/register")} className="btn-cta text-[12px] px-3 py-1.5" data-testid="header-register-btn-mobile">Join</button>
                    )}
                    <button onClick={() => setMobileOpen((o) => !o)} className="w-10 h-10 grid place-items-center rounded-md hover:bg-black/[0.04]" aria-label="Menu" data-testid="header-mobile-menu-btn">
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="md:hidden border-t border-black/[0.06] bg-white" data-testid="mobile-menu">
                    <div className="tc-container py-3 space-y-1">
                        <div className="px-1 pb-2">
                            <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#86868B] px-3 mb-1.5">Your city</div>
                            <div className="flex flex-wrap gap-1.5 px-3">
                                {KNOWN_CITIES.slice(0, 8).map((c) => (
                                    <button key={c} onClick={() => { setCity(c); }}
                                        className={`px-3 py-1.5 rounded-full border text-[12.5px] ${c === city ? "bg-[#0A0A0B] text-white border-[#0A0A0B]" : "bg-white text-[#1D1D1F] border-[#D2D2D7]"}`}
                                        data-testid={`mobile-city-option-${c}`}>
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <NavLink to="/search" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-browse">Browse toners</NavLink>
                        {!isSeller && !isAdmin && (
                            <NavLink to="/sell" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-sell">Sell on TonersCart</NavLink>
                        )}
                        {isBuyer && (
                            <NavLink to="/customer" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-orders">My orders</NavLink>
                        )}
                        {isSeller && (
                            <>
                                <NavLink to="/supplier#listings" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-stock">My stock</NavLink>
                                <NavLink to="/supplier#orders" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-seller-orders">Incoming orders</NavLink>
                            </>
                        )}
                        {isAdmin && (
                            <NavLink to="/admin" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-admin">Admin</NavLink>
                        )}

                        <div className="pt-2 mt-2 border-t border-black/[0.06]">
                            {!user ? (
                                <button onClick={() => { closeMobile(); navigate("/login"); }} className="block w-full px-4 py-3 rounded-lg text-[15px] font-medium text-[#1D1D1F] hover:bg-black/[0.04] text-left" data-testid="mobile-login-btn">
                                    Sign in
                                </button>
                            ) : (
                                <button onClick={async () => { closeMobile(); await logout(); navigate("/"); }} className="block w-full px-4 py-3 rounded-lg text-[15px] font-medium text-[#1D1D1F] hover:bg-black/[0.04] text-left flex items-center gap-2" data-testid="mobile-logout-btn">
                                    <LogOut size={16} /> Log out ({(user.name || "").split(" ")[0]})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
}
