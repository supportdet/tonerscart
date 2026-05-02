import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut, ShieldCheck, Boxes, User } from "lucide-react";

export default function Header() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);
    const ticking = useRef(false);

    useEffect(() => {
        const onScroll = () => {
            if (ticking.current) return;
            ticking.current = true;
            requestAnimationFrame(() => {
                setScrolled(window.scrollY > 8);
                ticking.current = false;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const dashboardPath =
        user?.role === "admin" ? "/admin" :
        user?.role === "supplier" ? "/supplier" :
        user?.role === "customer" ? "/customer" : null;

    // Landing page has a dark hero at the top; other pages start with white bg.
    const isLanding = location.pathname === "/";
    const overHero = isLanding && !scrolled;

    const navBase = "text-[14px] font-medium px-4 py-2 rounded-full transition-colors";
    const navLight = ({ isActive }) =>
        `${navBase} ${isActive ? "text-white bg-white/10" : "text-white/80 hover:text-white hover:bg-white/10"}`;
    const navSolid = ({ isActive }) =>
        `${navBase} ${isActive ? "text-[#0A0A0B] bg-black/[0.06]" : "text-[#1D1D1F] hover:text-black hover:bg-black/[0.04]"}`;
    const navLink = overHero ? navLight : navSolid;

    return (
        <header
            className={`sticky top-0 z-50 transition-all duration-300 ${
                !overHero
                    ? "bg-white/72 backdrop-blur-xl backdrop-saturate-150 border-b border-black/[0.06]"
                    : "bg-transparent border-b border-transparent"
            }`}
            data-testid="site-header"
        >
            <div className="tc-container flex items-center justify-between h-16">
                <Link to="/" className="flex items-center gap-2.5 group" data-testid="logo-home-link">
                    <div className="relative w-8 h-8 rounded-lg bg-[#0A0A0B] grid place-items-center overflow-hidden transition-transform group-hover:scale-105">
                        <span className="text-white font-bold text-[13px] relative z-10 tracking-tight">TC</span>
                        <span className="absolute top-0 left-0 w-1.5 h-1.5 bg-[#00B7C7]" />
                        <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#E6007E]" />
                        <span className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-[#F5C400]" />
                    </div>
                    <span className={`font-semibold tracking-tight text-[17px] transition-colors ${overHero ? "text-white" : "text-[#0A0A0B]"}`}>
                        TonersCart
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    <NavLink to="/search" className={navLink} data-testid="nav-search">Browse</NavLink>
                    <NavLink to="/register?role=supplier" className={navLink} data-testid="nav-sell">Sell</NavLink>
                    {user?.role === "supplier" && <NavLink to="/supplier" className={navLink} data-testid="nav-supplier">Seller</NavLink>}
                    {user?.role === "customer" && <NavLink to="/customer" className={navLink} data-testid="nav-customer">Orders</NavLink>}
                    {user?.role === "admin" && <NavLink to="/admin" className={navLink} data-testid="nav-admin">Admin</NavLink>}
                </nav>

                <div className="flex items-center gap-2">
                    {!user ? (
                        <>
                            <button
                                onClick={() => navigate("/login")}
                                className={`text-[14px] font-medium px-4 py-2 rounded-full transition-colors ${overHero ? "text-white/85 hover:text-white hover:bg-white/10" : "text-[#1D1D1F] hover:bg-black/[0.04]"}`}
                                data-testid="header-login-btn"
                            >
                                Sign in
                            </button>
                            <button onClick={() => navigate("/register")} className="btn-cta text-[14px]" data-testid="header-register-btn">
                                Join free
                            </button>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => dashboardPath && navigate(dashboardPath)}
                                className={`hidden sm:flex items-center gap-2 text-[14px] px-3 py-2 rounded-full transition-colors ${overHero ? "text-white/85 hover:text-white hover:bg-white/10" : "text-[#1D1D1F] hover:text-black hover:bg-black/[0.04]"}`}
                                data-testid="header-user-chip"
                            >
                                {user.role === "admin" ? <ShieldCheck size={15} /> : user.role === "supplier" ? <Boxes size={15} /> : <User size={15} />}
                                <span className="font-medium">{user.name}</span>
                            </button>
                            {overHero ? (
                                <button onClick={async () => { await logout(); navigate("/"); }} className="btn-ghost-light text-[14px]" data-testid="header-logout-btn">
                                    <LogOut size={14} className="inline mr-1" /> Logout
                                </button>
                            ) : (
                                <Button variant="outline" className="rounded-full" onClick={async () => { await logout(); navigate("/"); }} data-testid="header-logout-btn">
                                    <LogOut size={14} className="mr-1" /> Logout
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
