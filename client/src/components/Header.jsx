import { Menu, X, User, LogOut } from "lucide-react";
import { useContext, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { ContextData } from "../contextData/Context";

const links = [
    { name: "Dashboard", path: "/" },
    { name: "Products", path: "/products" },
    { name: "Clients", path: "/clients" },
    { name: "Orders", path: "/orders" },
    { name: "Hodimlar", path: "/users" },
    { name: "Kassa", path: "/kassa" },
];

export const Header = () => {
    const [open, setOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    const navigate = useNavigate();
    const { user, setUser } = useContext(ContextData);

    const logout = () => {
        Cookies.remove("user_token");
        if (setUser) setUser(null);
        navigate("/login", { replace: true });
    };

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white shadow-sm">
                <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
                    {/* Logo */}
                    <Link to="/" className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="text-blue-600">●</span> OFM
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden items-center gap-1 lg:flex">
                        {links.map((link) => (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                className={({ isActive }) =>
                                    `px-4 py-2 rounded-lg text-sm font-medium transition ${isActive
                                        ? "bg-blue-50 text-blue-700"
                                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                    }`
                                }
                            >
                                {link.name}
                            </NavLink>
                        ))}
                    </nav>

                    {/* Right side */}
                    <div className="flex items-center gap-2">
                        {/* Profile dropdown */}
                        <div className="relative hidden md:block">
                            <button
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 transition hover:bg-gray-100"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                                    <User size={16} className="text-blue-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">
                                    {user?.name || "User"}
                                </span>
                            </button>

                            {profileOpen && (
                                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                                    <div className="border-b border-gray-100 px-4 py-3">
                                        <p className="font-semibold text-gray-900">{user?.name || "User"}</p>
                                        <p className="text-sm text-gray-500">{user?.phone || ""}</p>
                                    </div>
                                    <button
                                        onClick={logout}
                                        className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
                                    >
                                        <LogOut size={16} />
                                        Chiqish
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Mobile menu button */}
                        <button
                            onClick={() => setOpen(!open)}
                            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
                        >
                            {open ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>

                {/* Mobile menu */}
                {open && (
                    <nav className="border-t border-gray-200 bg-white lg:hidden">
                        {links.map((link) => (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                onClick={() => setOpen(false)}
                                className={({ isActive }) =>
                                    `block px-5 py-3 text-sm font-medium transition ${isActive
                                        ? "bg-blue-50 text-blue-700"
                                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                    }`
                                }
                            >
                                {link.name}
                            </NavLink>
                        ))}
                        <div className="border-t border-gray-200 px-5 py-4">
                            <div className="mb-4">
                                <p className="font-semibold text-gray-900">{user?.name || "User"}</p>
                                <p className="text-sm text-gray-500">{user?.phone || ""}</p>
                            </div>
                            <button
                                onClick={logout}
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-700"
                            >
                                <LogOut size={16} />
                                Chiqish
                            </button>
                        </div>
                    </nav>
                )}
            </header>

            {/* Spacer */}
            <div className="h-16" />
        </>
    );
};