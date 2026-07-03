import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { HoldingsPage } from './pages/HoldingsPage';
import { AuctionsPage } from './pages/AuctionsPage';
import { LadderPage } from './pages/LadderPage';
import { YieldsPage } from './pages/YieldsPage';
import { ResearchPage } from './pages/ResearchPage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ErrorBoundary pageName="Dashboard"><DashboardPage /></ErrorBoundary>} />
        <Route path="/holdings" element={<ErrorBoundary pageName="Holdings"><HoldingsPage /></ErrorBoundary>} />
        <Route path="/auctions" element={<ErrorBoundary pageName="Auctions"><AuctionsPage /></ErrorBoundary>} />
        <Route path="/ladder" element={<ErrorBoundary pageName="Ladder"><LadderPage /></ErrorBoundary>} />
        <Route path="/yields" element={<ErrorBoundary pageName="Yields"><YieldsPage /></ErrorBoundary>} />
        <Route path="/research" element={<ErrorBoundary pageName="Research"><ResearchPage /></ErrorBoundary>} />
        <Route path="/reports" element={<ErrorBoundary pageName="Reports"><ReportsPage /></ErrorBoundary>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
