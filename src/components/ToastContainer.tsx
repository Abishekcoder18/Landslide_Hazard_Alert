import React from 'react';
import { useApp } from '../state/AppContext';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-4 z-[1300] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        let bgClass = 'bg-white border-[#E7E3DA] text-[#1F2933]';
        let icon = <Info className="w-4 h-4 text-[#3780C8] shrink-0" />;

        if (toast.type === 'success') {
          bgClass = 'bg-[#DFF1E5] border-[#BDE3C9] text-[#2F6B45]';
          icon = <CheckCircle2 className="w-4 h-4 text-[#2F6B45] shrink-0" />;
        } else if (toast.type === 'warning') {
          bgClass = 'bg-[#FBF1CC] border-[#F3E29F] text-[#7A5B00]';
          icon = <AlertTriangle className="w-4 h-4 text-[#7A5B00] shrink-0" />;
        } else if (toast.type === 'error') {
          bgClass = 'bg-[#F8D7D7] border-[#EEAFAF] text-[#9B2C2C]';
          icon = <AlertOctagon className="w-4 h-4 text-[#9B2C2C] shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3 rounded-lg border shadow-md flex items-start justify-between gap-2.5 text-xs transition-all ${bgClass}`}
            role="status"
          >
            <div className="flex items-start gap-2">
              {icon}
              <div className="font-medium pt-0.5 leading-tight">
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-0.5 rounded hover:bg-black/5 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
