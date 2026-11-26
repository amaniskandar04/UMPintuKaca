import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/format";
import { IconHome, IconSettings, IconShield, IconStar, IconUser } from "./icons";

export function BottomNav() {
  const { user } = useAuth();
  const items = [
    { to: "/", label: "Home", icon: IconHome, end: true },
    { to: "/my-reviews", label: "Reviews", icon: IconStar, end: false },
    { to: "/verify", label: "Verify", icon: IconUser, end: false },
    ...(user?.role === "admin" ? [{ to: "/admin", label: "Admin", icon: IconShield, end: false }] : []),
    { to: "/settings", label: "Settings", icon: IconSettings, end: false }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--tg-border)] bg-[var(--tg-bg-2)] backdrop-blur">
      <div className="safe-bottom mx-auto flex w-full max-w-md items-stretch justify-around px-1 pt-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn("nav-link flex-1", isActive && "nav-link-active")}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
