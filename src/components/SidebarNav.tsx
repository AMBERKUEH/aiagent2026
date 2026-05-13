import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function buildNavItems(t: (k: string) => string) {
  return [
    { icon: "today", label: t("today"), path: "/" },
    { icon: "sensors", label: t("sensors"), path: "/sensors" },
    { icon: "science", label: t("simulate"), path: "/scenarios" },
    { icon: "forum", label: t("ask"), path: "/chat" },
    { icon: "map", label: t("map"), path: "/map" },
    { icon: "agriculture", label: t("harvest"), path: "/harvest" },
  ];
}

interface SidebarNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SidebarNav({ isOpen, onClose }: SidebarNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navItems = buildNavItems(t);

  const handleNav = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-[2001] w-[72px] bg-white border-r border-slate-100 shadow-2xl flex flex-col items-center py-5 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
              agriculture
            </span>
          </div>
          <span className="text-[7px] font-bold uppercase tracking-[0.1em] text-primary mt-1">
            SmartPaddy
          </span>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path === "/" && location.pathname === "/");
            return (
              <button
                key={item.path}
                onClick={() => handleNav(item.path)}
                className={`group relative flex flex-col items-center justify-center w-full py-2 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
                )}
                <span
                  className={`material-symbols-outlined text-xl transition-all ${isActive ? "text-primary" : ""}`}
                  style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 400" } : undefined}
                >
                  {item.icon}
                </span>
                <span className={`text-[8px] font-bold mt-0.5 tracking-wide ${isActive ? "text-primary" : ""}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Bottom - User Avatar */}
        <div className="mt-auto flex flex-col items-center gap-2 pt-2">
          <button
            onClick={() => handleNav("/settings")}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-500 text-base">settings</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden">
            <span className="text-[10px] font-bold text-primary uppercase">
              {user?.email?.charAt(0) ?? "F"}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
