'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from './Icon';

type Tone = 'ok' | 'bad' | 'info';
const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** Ненавязчивые уведомления о результате действия (копирование, сохранение, ошибки). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string, tone: Tone = 'ok') => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60]">
        {toast && (
          <div key={toast.id} data-testid="toast" className="toast-in pointer-events-auto absolute bottom-[84px] left-1/2 flex max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-full bg-ink py-2.5 pl-3.5 pr-4 text-sm text-milk shadow-pop lg:bottom-8">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${toast.tone === 'bad' ? 'bg-bad' : toast.tone === 'info' ? 'bg-white/15' : 'bg-accent-500'}`}>
              <Icon name={toast.tone === 'bad' ? 'x' : toast.tone === 'info' ? 'target' : 'check'} size={12} strokeWidth={2.6} />
            </span>
            <span className="min-w-0">{toast.message}</span>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
