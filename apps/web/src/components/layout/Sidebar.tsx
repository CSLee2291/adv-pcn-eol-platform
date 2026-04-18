import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Brain,
  GitBranch,
  Folder,
  Bell,
  ClipboardCheck,
  Search,
  Star,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: FileText, label: "PCN Events", path: "/pcn" },
  { icon: Brain, label: "AI Analysis", path: "/analysis" },
  { icon: GitBranch, label: "Where-Used", path: "/where-used" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: ClipboardCheck, label: "Verification", path: "/verification" },
  { icon: Folder, label: "Cases", path: "/cases" },
];

export function Sidebar() {
  return (
    <aside className="w-[260px] shrink-0 bg-[var(--surface-sidebar)] flex flex-col h-full border-r border-[var(--surface-divider)]">
      {/* Search */}
      <div className="p-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-pill bg-[var(--surface-card)] border border-neutral-200 dark:border-neutral-700 text-[var(--text-muted)] text-meta cursor-pointer hover:border-primary-300 transition-colors">
          <Search className="h-4 w-4" />
          <span className="flex-1">Search...</span>
          <kbd className="text-axis bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>
      </div>

      {/* Favorites */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 text-meta text-[var(--text-muted)] mb-1">
          <Star className="h-3.5 w-3.5" />
          <span className="font-medium">Favorites</span>
          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-panel text-nav transition-colors",
                isActive
                  ? "bg-[var(--nav-selected-bg)] text-[var(--text-primary)] font-semibold"
                  : "text-[var(--text-secondary)] hover:bg-neutral-100 dark:hover:bg-neutral-800"
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Promo Card */}
      <div className="p-4">
        <div className="rounded-card bg-primary-500 p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-5 w-5" />
            <span className="font-semibold text-sm">AI Insights</span>
          </div>
          <p className="text-xs opacity-90 mb-3">
            AI-powered PCN analysis with automatic risk assessment
          </p>
          <button className="w-full py-1.5 rounded-pill bg-white text-primary-500 text-sm font-medium hover:bg-neutral-50 transition-colors">
            Learn more
          </button>
        </div>
      </div>
    </aside>
  );
}
