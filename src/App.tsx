import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { LadderPage } from './pages/LadderPage';
import { SavingsBondsPage } from './pages/SavingsBondsPage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  return (
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
  );
}
