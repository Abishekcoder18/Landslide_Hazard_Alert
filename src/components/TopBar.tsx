import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '../context/DemoContext';
import { Bell } from 'lucide-react';

interface TopBarProps {
  title: string;
}

export const TopBar: React.FC<TopBarProps> = ({ title }) => {
  const { pendingApprovalsCount } = useDemo();
  const navigate = useNavigate();
  const [timeStr, setTimeStr] = useState<string>('01 Nov 2026, 09:45 AM');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setTimeStr(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 px-6 bg-white border-b border-[#E7E3DA] flex items-center justify-between shrink-0">
      <h1 className="text-lg md:text-xl font-semibold text-[#1F2933] tracking-tight">
        {title}
      </h1>

      <div className="flex items-center gap-4 text-xs">
        <span className="text-[#6B7280] font-medium hidden sm:inline">
          {timeStr}
        </span>

        <button
          onClick={() => navigate('/approvals')}
          className="relative p-1.5 rounded-md hover:bg-[#FAF8F3] text-[#6B7280] hover:text-[#1F2933] transition-colors"
          title={`${pendingApprovalsCount} pending approvals`}
          aria-label={`${pendingApprovalsCount} pending approvals`}
        >
          <Bell className="w-4 h-4" />
          {pendingApprovalsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#D45555] text-white text-[9px] font-bold flex items-center justify-center">
              {pendingApprovalsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
