import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCity, KNOWN_CITIES } from "../context/CityContext";
import { useCart } from "../context/CartContext";
import { LogOut, MapPin, ChevronDown, Menu, X, ShoppingCart, Loader2 } from "lucide-react";

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
    const [buyOpen, setBuyOpen] = useState(false);

    const role = user?.role; // 'admin' | 'supplier' | 'customer' | undefined
    const isSeller = role === "supplier";
    const isAdmin = role === "admin";
    const isBuyer = !!user && !isSeller && !isAdmin;

    const closeMobile = () => setMobileOpen(false);
    const [loggingOut, setLoggingOut] = React.useState(false);

    const handleLogout = async () => {
        setLoggingOut(true);
        try { await logout(); } catch { /* ignore */ }
        try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
        // Hard reload to clear any in-memory state including cached token
        window.location.replace("/");
    };

    return (
        <header className="bg-white border-b border-black/[0.06] sticky top-0 z-[100]" data-testid="site-header">
            <div className="tc-container flex items-center justify-between h-16 gap-3">
                <Link to="/" className="flex items-center self-center shrink-0 group" data-testid="logo-home-link" onClick={closeMobile} aria-label="TonersCart home">
                    <img
                        src="/logo.png"
                        alt="TonersCart"
                        className="block h-9 w-auto transition-transform group-hover:scale-[1.03]"
                        style={{ alignSelf: "center" }}
                        data-testid="header-logo-img"
                    />
                </Link>

                {/* Desktop nav — text-style buttons matching "Sign in" weight */}
                <nav className="hidden md:flex items-center gap-2">
                    <div
                        className="relative"
                        onMouseEnter={() => setBuyOpen(true)}
                        onMouseLeave={() => setBuyOpen(false)}
                    >
                        <button
                            type="button"
                            onClick={() => setBuyOpen((o) => !o)}
                            className="tc-pill-buy inline-flex items-center gap-1.5"
                            data-testid="nav-buy"
                            aria-expanded={buyOpen}
                        >
                            Buy <ChevronDown size={13} className={`transition-transform ${buyOpen ? "rotate-180" : ""}`} style={{ color: "#00B7C7" }} />
                        </button>
                        {buyOpen && (
                            <div className="absolute left-0 top-full pt-1 z-50" data-testid="nav-buy-dropdown">
                                <div className="w-44 bg-white rounded-xl shadow-xl border border-black/[0.08] py-1.5">
                                    <Link to="/search" onClick={() => setBuyOpen(false)} className="block px-3.5 py-2 text-[13.5px] text-[#1D1D1F] hover:bg-black/[0.04]" data-testid="nav-buy-toners">Toners</Link>
                                    <Link to="/printers" onClick={() => setBuyOpen(false)} className="block px-3.5 py-2 text-[13.5px] text-[#1D1D1F] hover:bg-black/[0.04]" data-testid="nav-buy-printers">Printers</Link>
                                    <Link to="/papers" onClick={() => setBuyOpen(false)} className="block px-3.5 py-2 text-[13.5px] text-[#1D1D1F] hover:bg-black/[0.04]" data-testid="nav-buy-papers">Papers</Link>
                                    <Link to="/mps" onClick={() => setBuyOpen(false)} className="block px-3.5 py-2 text-[13.5px] text-[#1D1D1F] hover:bg-black/[0.04]" data-testid="nav-buy-mps">MPS</Link>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sell — outlined pill in brand yellow. Hidden for approved sellers and admins. */}
                    {!isSeller && !isAdmin && (
                        <NavLink
                            to="/sell"
                            className="tc-pill-sell inline-flex items-center"
                            data-testid="nav-sell"
                        >
                            Sell
                        </NavLink>
                    )}

                    {/* Buyer */}
                    {isBuyer && (
                        <NavLink to="/customer" className={navLink} data-testid="nav-orders">Orders</NavLink>
                    )}

                    {/* Approved seller */}
                    {isSeller && (
                        <>
                            <NavLink to="/supplier#listings" className={navLink} data-testid="nav-stock" end>My stock</NavLink>
                            <NavLink to="/supplier#orders" className={navLink} data-testid="nav-seller-orders" end>Orders</NavLink>
                        </>
                    )}

                    {/* Admin */}
                    {isAdmin && (
                        <NavLink to="/admin" className={navLink} data-testid="nav-admin">Admin</NavLink>
                    )}
                </nav>

                {/* Desktop right cluster */}
                <div className="hidden md:flex items-center gap-2">
                    {!isAdmin && (
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
                            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-black/[0.08] py-2 max-h-72 overflow-auto tc-city-dropdown" data-testid="city-dropdown">
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
                            <button onClick={handleLogout} className="text-[14px] text-[#6E6E73] hover:text-[#0A0A0B] p-2 rounded-md hover:bg-black/[0.04]" data-testid="header-logout-btn">
                                <LogOut size={15} />
                            </button>
                        </>
                    )}
                </div>

                {/* Mobile cluster */}
                <div className="md:hidden flex items-center gap-1">
                    {!isAdmin && (
                        <button onClick={() => navigate("/cart")} className="relative w-10 h-10 grid place-items-center rounded-md hover:bg-black/[0.04]" aria-label="Cart" data-testid="header-cart-btn-mobile">
                            <ShoppingCart size={17} />
                            {cartCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E6007E] text-white text-[10px] font-bold grid place-items-center">{cartCount}</span>
                            )}
                        </button>
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
                        <NavLink to="/printers" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-printers">Browse printers</NavLink>
                        <NavLink to="/mps" onClick={closeMobile} className={mobileNavLink} data-testid="mobile-nav-mps">Managed Print Services</NavLink>
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

                        <div className="pt-2 mt-2 border-t border-black/[0.06] space-y-2">
                            {!user ? (
                                <>
                                    <button
                                        onClick={() => { closeMobile(); navigate("/login"); }}
                                        className="block w-full px-4 py-3 rounded-lg text-[14.5px] font-semibold text-[#1D1D1F] border border-[#E8E8EC] hover:bg-black/[0.04] text-left"
                                        data-testid="mobile-login-btn"
                                    >
                                        Sign in
                                    </button>
                                    <button
                                        onClick={() => { closeMobile(); navigate("/register"); }}
                                        className="btn-cta w-full"
                                        data-testid="mobile-register-btn"
                                    >
                                        Join free
                                    </button>
                                </>
                            ) : (
                                <button onClick={async () => { closeMobile(); await handleLogout(); }} className="block w-full px-4 py-3 rounded-lg text-[15px] font-medium text-[#1D1D1F] hover:bg-black/[0.04] text-left flex items-center gap-2" data-testid="mobile-logout-btn">
                                    <LogOut size={16} /> Log out ({(user.name || "").split(" ")[0]})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
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
