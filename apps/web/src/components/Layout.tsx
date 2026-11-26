import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { getTelegram } from "../lib/telegram";
import { BottomNav } from "./BottomNav";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const hideNav = location.pathname.startsWith("/write/");

  useEffect(() => {
    const backButton = getTelegram()?.BackButton;
    if (!backButton) return;
    if (location.pathname === "/") {
      backButton.hide();
      return;
    }
    const handler = () => navigate(-1);
    backButton.onClick(handler);
    backButton.show();
    return () => {
      backButton.offClick(handler);
      backButton.hide();
    };
  }, [location.pathname, navigate]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <main className={hideNav ? "flex-1 px-4 pb-10" : "flex-1 px-4 pb-28"}>
        <Outlet />
      </main>
      {hideNav ? null : <BottomNav />}
    </div>
  );
}
