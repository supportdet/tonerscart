import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut, ShieldCheck, Boxes, User } from "lucide-react";

const navLink = ({ isActive }) =>
    `text-sm font-medium px-3 py-2 rounded-md transition-colors ${
        isActive ? "text-[#0E0F12] bg-[#0E0F12]/5" : "text-slate-600 hover:text-[#0E0F12] hover:bg-slate-100"
    }`;

export default function Header() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const dashboardPath =
        user?.role === "admin" ? "/admin" :
        user?.role === "supplier" ? "/supplier" :
        user?.role === "customer" ? "/customer" : null;

    return (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40 backdrop-blur" data-testid="site-header">
            <div className="tc-container flex items-center justify-between h-16">
                <Link to="/" className="flex items-center gap-2.5" data-testid="logo-home-link">
                    <div className="relative w-9 h-9 rounded-lg bg-[#0E0F12] grid place-items-center overflow-hidden">
                        <span className="text-white font-bold text-sm relative z-10">TC</span>
                        <span className="absolute top-0 left-0 w-2 h-2 bg-[#00B7C7]" />
                        <span className="absolute top-0 right-0 w-2 h-2 bg-[#E6007E]" />
                        <span className="absolute bottom-0 left-0 w-2 h-2 bg-[#F7C600]" />
                    </div>
                    <div className="leading-none">
                        <div className="font-bold text-[#0E0F12] tracking-tight text-lg">TonersCart</div>
                        <div className="text-[10px] tracking-[0.2em] uppercase text-slate-500">B2B · Toner Marketplace · India</div>
                    </div>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    <NavLink to="/" end className={navLink} data-testid="nav-home">Home</NavLink>
                    <NavLink to="/search" className={navLink} data-testid="nav-search">Browse</NavLink>
                    {user?.role === "supplier" && <NavLink to="/supplier" className={navLink} data-testid="nav-supplier">Seller</NavLink>}
                    {user?.role === "customer" && <NavLink to="/customer" className={navLink} data-testid="nav-customer">Orders</NavLink>}
                    {user?.role === "admin" && <NavLink to="/admin" className={navLink} data-testid="nav-admin">Admin</NavLink>}
                </nav>

                <div className="flex items-center gap-2">
                    {!user ? (
                        <>
                            <Button variant="ghost" onClick={() => navigate("/login")} data-testid="header-login-btn">Sign in</Button>
                            <Button className="btn-cta" onClick={() => navigate("/register")} data-testid="header-register-btn">
                                Join free
                            </Button>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => dashboardPath && navigate(dashboardPath)}
                                className="hidden sm:flex items-center gap-2 text-sm text-slate-700 hover:text-[#0E0F12] px-3 py-2 rounded-md hover:bg-slate-100"
                                data-testid="header-user-chip"
                            >
                                {user.role === "admin" ? <ShieldCheck size={16} /> : user.role === "supplier" ? <Boxes size={16} /> : <User size={16} />}
                                <span className="font-medium">{user.name}</span>
                                <span className="tc-badge tc-badge-gray">{user.role}</span>
                            </button>
                            <Button variant="outline" onClick={async () => { await logout(); navigate("/"); }} data-testid="header-logout-btn">
                                <LogOut size={16} className="mr-1" /> Logout
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
