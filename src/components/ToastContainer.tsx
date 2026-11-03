import React from 'react';
import { useApp } from '../state/AppContext';
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-4 z-[1300] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        let bgClass = 'bg-surface border-line text-ink';
        let icon = <Info className="w-4 h-4 text-primary-ink shrink-0" />;

        if (toast.type === 'success') {
          bgClass = 'bg-risk-green-bg border-risk-green-line text-risk-green-fg';
          icon = <CheckCircle2 className="w-4 h-4 text-risk-green-fg shrink-0" />;
        } else if (toast.type === 'warning') {
          bgClass = 'bg-dec-caution-bg border-dec-caution-line text-dec-caution-fg';
          icon = <AlertTriangle className="w-4 h-4 text-dec-caution-fg shrink-0" />;
        } else if (toast.type === 'error') {
          bgClass = 'bg-risk-red-bg border-risk-red-line text-risk-red-fg';
          icon = <AlertOctagon className="w-4 h-4 text-risk-red-fg shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3 rounded-card border shadow-pop flex items-start justify-between gap-2.5 text-[13px] transition-all ${bgClass}`}
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
