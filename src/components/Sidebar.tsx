import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useDemo } from '../context/DemoContext';
import { DemoRole } from '../types';
import { 
  Map, 
  FileText, 
  GitBranch, 
  FileCheck2, 
  AlertOctagon, 
  Settings, 
  ChevronUp, 
  Shield 
} from 'lucide-react';

const ROLE_DISPLAY: Record<DemoRole, string> = {
  control_officer: 'Officer',
  second_approver: 'Second Approver',
  road_engineer: 'Road Engineer',
  patrol: 'Highway Patrol',
  traveller: 'Traveller',
  admin: 'Administrator'
};

export const Sidebar: React.FC = () => {
  const { currentRole, setRole, pendingApprovalsCount, setIsSettingsOpen } = useDemo();
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);

  const navItems = [
    { name: 'Corridor', path: '/', icon: Map },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Decisions', path: '/decisions', icon: GitBranch },
    { 
      name: 'Approvals', 
      path: '/approvals', 
      icon: FileCheck2, 
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined 
    },
    { name: 'Incidents', path: '/incidents', icon: AlertOctagon }
  ];

  return (
    <aside className="w-16 md:w-60 shrink-0 bg-white border-r border-[#E7E3DA] flex flex-col justify-between h-screen sticky top-0 z-40 select-none">
      
      {/* Top: Logo & RESILION 2.0 */}
      <div>
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#E7E3DA]">
          <div className="w-7 h-7 rounded-md bg-[#3780C8] flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="hidden md:inline font-semibold text-base tracking-tight text-[#1F2933]">
            RESILION 2.0
          </span>
        </div>

        {/* Five Navigation Items */}
        <nav className="p-2 space-y-1" aria-label="Main navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#3780C8]/10 text-[#3780C8] font-semibold'
                      : 'text-[#1F2933] hover:text-[#1F2933] hover:bg-[#FAF8F3]'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden md:inline">{item.name}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="hidden md:flex w-4 h-4 rounded-full bg-[#3780C8] text-white text-[10px] font-bold items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom of Sidebar */}
      <div className="p-3 border-t border-[#E7E3DA] space-y-2">
        
        {/* User Chip with Role Switcher Menu */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(prev => !prev)}
            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#FAF8F3] text-left text-xs text-[#1F2933] transition-colors"
            title="Switch user role"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-[#3780C8] shrink-0"></span>
              <span className="hidden md:inline font-medium text-xs truncate">
                Control Room · {ROLE_DISPLAY[currentRole]}
              </span>
            </div>
            <ChevronUp className="w-3.5 h-3.5 text-[#6B7280] hidden md:block shrink-0" />
          </button>

          {roleMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setRoleMenuOpen(false)} 
              />
              <div className="absolute left-0 bottom-full mb-1 w-52 bg-white border border-[#E7E3DA] rounded-lg shadow-lg p-1 z-50 text-xs">
                {(['control_officer', 'second_approver', 'road_engineer', 'patrol', 'admin'] as DemoRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => {
                      setRole(r);
                      setRoleMenuOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between ${
                      currentRole === r ? 'bg-[#3780C8]/10 text-[#3780C8] font-semibold' : 'text-[#1F2933] hover:bg-[#FAF8F3]'
                    }`}
                  >
                    <span>{ROLE_DISPLAY[r]}</span>
                    {currentRole === r && <span className="w-1.5 h-1.5 rounded-full bg-[#3780C8]"></span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Settings button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-medium text-[#6B7280] hover:text-[#1F2933] hover:bg-[#FAF8F3] transition-colors"
          title="Open settings"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Settings</span>
        </button>

        {/* Small grey tag */}
        <div className="hidden md:block pt-1">
          <div className="text-[11px] text-[#6B7280] px-2 py-1 rounded bg-[#FAF8F3] border border-[#E7E3DA] truncate">
            NH-27 · Dima Hasao · Sample data
          </div>
        </div>

      </div>

    </aside>
  );
};
