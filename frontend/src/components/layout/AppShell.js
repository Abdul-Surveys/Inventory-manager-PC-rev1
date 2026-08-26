import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Boxes, ArrowLeftRight, TrendingUp, PackageX, FileUp, Settings, Menu, Fuel,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "sidebar-nav-dashboard-link" },
  { to: "/inventory", label: "Inventory", icon: Boxes, testId: "sidebar-nav-inventory-link" },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight, testId: "sidebar-nav-transactions-link" },
  { to: "/analysis", label: "Consumption & Min/Max", icon: TrendingUp, testId: "sidebar-nav-analysis-link" },
  { to: "/non-moving", label: "Non-Moving Items", icon: PackageX, testId: "sidebar-nav-non-moving-link" },
  { to: "/import-export", label: "Import / Export", icon: FileUp, testId: "sidebar-nav-import-export-link" },
  { to: "/settings", label: "Settings", icon: Settings, testId: "sidebar-nav-settings-link" },
];

const PAGE_TITLES = {
  "/": "Management Dashboard",
  "/inventory": "Main Stock / Inventory",
  "/transactions": "Warehouse Transactions",
  "/analysis": "Consumption Analysis & Min/Max Recommendations",
  "/non-moving": "Non-Moving Items",
  "/import-export": "Import / Export",
  "/settings": "Planning Settings",
};

const NavItems = ({ onNavigate }) => (
  <nav className="flex flex-col gap-1 px-3">
    {NAV.map(({ to, label, icon: Icon, testId }) => (
      <NavLink
        key={to}
        to={to}
        end={to === "/"}
        data-testid={testId}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </NavLink>
    ))}
  </nav>
);

const Brand = () => (
  <div className="flex items-center gap-3 px-6 py-5">
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Fuel className="h-5 w-5" />
    </div>
    <div>
      <p className="font-heading text-sm font-semibold leading-tight text-white">PetroChina GPP</p>
      <p className="text-xs text-slate-400">Inventory Planning</p>
    </div>
  </div>
);

export const AppShell = ({ children }) => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = PAGE_TITLES[location.pathname] || "Inventory Management";

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col bg-[hsl(200_35%_11%)] lg:flex">
        <Brand />
        <div className="h-px bg-white/10 mx-4 mb-4" />
        <NavItems />
        <div className="mt-auto px-6 py-4">
          <p className="text-[11px] text-slate-500">GPP Planning Team · USD</p>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur-sm sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button data-testid="mobile-nav-toggle" variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-[hsl(200_35%_11%)] border-r-0 p-0">
              <Brand />
              <div className="h-px bg-white/10 mx-4 mb-4" />
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 data-testid="page-title" className="font-heading text-base sm:text-lg font-semibold tracking-tight truncate">{title}</h1>
        </header>
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
};
