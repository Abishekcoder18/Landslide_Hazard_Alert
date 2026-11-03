import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './state/AppContext';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/ToastContainer';
import { NAV, homeFor } from './navigation';
import { LoginPage } from './pages/LoginPage';
import { CorridorPage } from './pages/CorridorPage';
import { ReportsPage } from './pages/ReportsPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { RecordsPage } from './pages/RecordsPage';
import { ConfigurationPage } from './pages/ConfigurationPage';

const PAGES: Record<string, React.FC> = {
  '/corridor': CorridorPage,
  '/reports': ReportsPage,
  '/decisions': DecisionsPage,
  '/approvals': ApprovalsPage,
  '/incidents': IncidentsPage,
  '/records': RecordsPage,
  '/configuration': ConfigurationPage
};

const Shell: React.FC = () => {
  const { session, snapshot } = useApp();
  if (!session) return <LoginPage />;
  const allowed = NAV.filter(n => n.allowed(session.role));
  return (
    <div className="min-h-screen flex bg-app text-ink antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">
          {!snapshot ? (
            <div className="p-10 text-center text-[13px] text-ink-2">Loading…</div>
          ) : (
            <Routes>
              {allowed.map(n => {
                const Page = PAGES[n.path];
                return <Route key={n.path} path={n.path} element={<Page />} />;
              })}
              <Route path="*" element={<Navigate to={homeFor(session.role)} replace />} />
            </Routes>
          )}
        </main>
        <footer className="h-9 px-4 lg:px-6 border-t border-line bg-surface flex items-center justify-between text-[11px] text-ink-3">
          <span>RESILION 2.0 · PS13</span>
          <span>Initial corridor · NH-27 within Dima Hasao</span>
        </footer>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <HashRouter>
      <AppProvider>
        <Shell />
        <ToastContainer />
      </AppProvider>
    </HashRouter>
  );
}
