import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/layout/ErrorBoundary';

// Route-level code splitting: each page (and its heavy dependencies —
// recharts on Dashboard/Ladder, jsPDF on Reports) is loaded in its own
// chunk on first visit, instead of shipping everything in one ~1.1 MB
// bundle. The per-page ErrorBoundary below catches chunk-load failures.
// Pages export named components, so adapt the default-export shape that
// React.lazy expects.
const load = <T extends { [K in string]: unknown }>(mod: () => Promise<T>, name: keyof T) =>
  lazy(() => mod().then((m) => ({ default: m[name] as React.ComponentType })));

const DashboardPage = load(() => import('./pages/DashboardPage'), 'DashboardPage');
const HoldingsPage = load(() => import('./pages/HoldingsPage'), 'HoldingsPage');
const LadderPage = load(() => import('./pages/LadderPage'), 'LadderPage');
const SavingsBondsPage = load(() => import('./pages/SavingsBondsPage'), 'SavingsBondsPage');
const ReportsPage = load(() => import('./pages/ReportsPage'), 'ReportsPage');

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="card animate-pulse px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
        Loading…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ErrorBoundary pageName="Dashboard"><DashboardPage /></ErrorBoundary>} />
          <Route path="/holdings" element={<ErrorBoundary pageName="Holdings"><HoldingsPage /></ErrorBoundary>} />
          <Route path="/ladder" element={<ErrorBoundary pageName="Ladder"><LadderPage /></ErrorBoundary>} />
          <Route path="/savings-bonds" element={<ErrorBoundary pageName="Savings Bonds"><SavingsBondsPage /></ErrorBoundary>} />
          <Route path="/reports" element={<ErrorBoundary pageName="Reports"><ReportsPage /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
