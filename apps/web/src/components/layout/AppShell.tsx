import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell() {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-[#8B5CF6] via-[#93C5FD] to-[#CBD5E1] dark:from-[#312E81] dark:via-[#1D4ED8] dark:to-[#020617] p-3 lg:p-5">
      {/* App Window */}
      <div className="flex-1 flex flex-col rounded-window bg-[var(--surface-window)] shadow-window-light dark:shadow-window-dark overflow-hidden">
        {/* Chrome Bar */}
        <header className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-[var(--surface-divider)]">
          {/* Window Controls (decorative) */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <span className="ml-3 text-nav font-semibold text-[var(--text-primary)]">
              PCN/EOL Platform
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
