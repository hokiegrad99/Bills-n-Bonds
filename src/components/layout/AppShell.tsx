import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Layers,
  FileText,
  Sun,
  Moon,
  Banknote,
  PiggyBank,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTheme } from './ThemeProvider';
import { cn } from '../../lib/cn';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/holdings', label: 'My Holdings', Icon: Wallet },
  { to: '/ladder', label: 'Ladder Planner', Icon: Layers },
  { to: '/savings-bonds', label: 'Savings Bonds', Icon: PiggyBank },
  { to: '/reports', label: 'Reports', Icon: FileText },
];

export function AppShell() {
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Close mobile sidebar on navigation.
    document.documentElement.dataset.route = location.pathname;
  }, [location.pathname]);

  const currentNav =
    NAV_ITEMS.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))) ??
    NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        <div className="px-4 py-5 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-600 to-accent-500 grid place-items-center text-white shadow">
            <Banknote size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold">Bills n' Bonds</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Treasury Tracker
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-600 text-white shadow'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
          100% local · Your data never leaves this device.
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 backdrop-blur bg-white/85 dark:bg-slate-900/85 border-b border-slate-200 dark:border-slate-800">
          <div className="px-4 md:px-6 h-14 flex items-center gap-3">
            <button
              className="md:hidden btn-secondary"
              aria-label="Menu"
              onClick={() => {
                const sidebar = document.getElementById('mobile-sidebar');
                sidebar?.classList.toggle('hidden');
              }}
            >
              ☰
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Bills n' Bonds
              </div>
              <h1 className="text-base font-semibold truncate">{currentNav.label}</h1>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {now.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <button
              onClick={toggle}
              className="btn-secondary"
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden md:inline">
                {theme === 'dark' ? 'Light' : 'Dark'}
              </span>
            </button>
          </div>
        </header>

        {/* Mobile sidebar */}
        <div
          id="mobile-sidebar"
          className="hidden md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <nav className="px-3 py-3 grid grid-cols-2 gap-1">
            {NAV_ITEMS.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  )
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="flex-1 px-4 md:px-6 py-6">
          <Outlet />
        </main>

        <footer className="px-4 md:px-6 py-6 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800">
          100% client-side · Your data and inputs never leave this device.
        </footer>
      </div>
    </div>
  );
}
