import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut, ShieldCheck, Boxes, User } from "lucide-react";

const navLink = ({ isActive }) =>
    `text-sm font-medium px-3 py-2 rounded-md transition-colors ${
        isActive ? "text-[#0B1B3D] bg-[#0B1B3D]/5" : "text-slate-600 hover:text-[#0B1B3D] hover:bg-slate-100"
    }`;

export default function Header() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const dashboardPath =
        user?.role === "admin" ? "/admin" :
        user?.role === "supplier" ? "/supplier" :
        user?.role === "customer" ? "/customer" : null;

    return (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40" data-testid="site-header">
            <div className="tc-container flex items-center justify-between h-16">
                <Link to="/" className="flex items-center gap-2" data-testid="logo-home-link">
                    <div className="w-8 h-8 rounded-md bg-[#0B1B3D] grid place-items-center">
                        <span className="text-white font-bold text-sm">TC</span>
                    </div>
                    <div className="leading-none">
                        <div className="font-bold text-[#0B1B3D] tracking-tight tc-display text-lg">TonersCart</div>
                        <div className="text-[10px] tracking-[0.18em] uppercase text-slate-500">B2B Toner Marketplace · India</div>
                    </div>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    <NavLink to="/" end className={navLink} data-testid="nav-home">Home</NavLink>
                    <NavLink to="/search" className={navLink} data-testid="nav-search">Browse Toners</NavLink>
                    {user?.role === "supplier" && <NavLink to="/supplier" className={navLink} data-testid="nav-supplier">Supplier</NavLink>}
                    {user?.role === "customer" && <NavLink to="/customer" className={navLink} data-testid="nav-customer">My Orders</NavLink>}
                    {user?.role === "admin" && <NavLink to="/admin" className={navLink} data-testid="nav-admin">Admin</NavLink>}
                </nav>

                <div className="flex items-center gap-2">
                    {!user ? (
                        <>
                            <Button variant="ghost" onClick={() => navigate("/login")} data-testid="header-login-btn">Sign in</Button>
                            <Button className="btn-primary text-white" onClick={() => navigate("/register")} data-testid="header-register-btn">
                                Join Free
                            </Button>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => dashboardPath && navigate(dashboardPath)}
                                className="hidden sm:flex items-center gap-2 text-sm text-slate-700 hover:text-[#0B1B3D] px-3 py-2 rounded-md hover:bg-slate-100"
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
