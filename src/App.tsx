/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DemoProvider } from './context/DemoContext';
import { Sidebar } from './components/Sidebar';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ToastContainer } from './components/ToastContainer';

import { CorridorPage } from './pages/CorridorPage';
import { ReportsPage } from './pages/ReportsPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { IncidentsPage } from './pages/IncidentsPage';

export default function App() {
  return (
    <HashRouter>
      <DemoProvider>
        <div className="min-h-screen flex bg-[#FAF8F3] text-[#1F2933] antialiased">
          {/* Fixed Left Sidebar (240px on md, icon-only on small) */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <main className="flex-1">
              <Routes>
                {/* 5 primary pages */}
                <Route path="/" element={<CorridorPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/decisions" element={<DecisionsPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/incidents" element={<IncidentsPage />} />
                <Route path="/incidents/:id" element={<IncidentsPage />} />

                {/* Redirects for all previous routes */}
                <Route path="/control" element={<Navigate to="/" replace />} />
                <Route path="/segment/:id" element={<Navigate to="/" replace />} />
                <Route path="/reports/new" element={<Navigate to="/reports" replace />} />
                <Route path="/traveller" element={<Navigate to="/decisions" replace />} />
                <Route path="/audit" element={<Navigate to="/incidents" replace />} />
                <Route path="/settings" element={<Navigate to="/" replace />} />
                <Route path="/about" element={<Navigate to="/" replace />} />
                <Route path="/story" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            {/* Single-line grey footer */}
            <footer className="h-9 px-6 border-t border-[#E7E3DA] bg-white flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>RESILION 2.0 · PS13</span>
              <span>NH-27 Dima Hasao</span>
            </footer>
          </div>

          {/* Drawers & Notifications */}
          <SettingsDrawer />
          <ToastContainer />
        </div>
      </DemoProvider>
    </HashRouter>
  );
}
