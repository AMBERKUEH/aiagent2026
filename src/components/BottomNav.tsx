import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { icon: "neurology", label: "Command", path: "/" },
  { icon: "account_tree", label: "Scenarios", path: "/scenarios" },
  { icon: "smart_toy", label: "AI", path: "/chat" },
  { icon: "center_focus_strong", label: "Scanner", path: "/scanner" },
  { icon: "map", label: "Map", path: "/map" },
];

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 w-full z-50 flex justify-around items-center px-4 pt-3 pb-6 glass-panel border-t border-outline-variant/15 shadow-[0_-8px_32px_rgba(25,28,29,0.04)] rounded-t-3xl">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center transition-all duration-300 ease-out ${
              isActive
                ? "text-primary font-bold"
                : "text-outline hover:text-primary"
            }`}
          >
            <span
              className="material-symbols-outlined mb-1"
              style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" } : undefined}
            >
              {item.icon}
            </span>
            <span className="text-[11px] font-label font-medium tracking-[0.03em] uppercase">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
