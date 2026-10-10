'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from './Modal';
import { Button } from './ui';

interface Opts { title: string; text: string; confirm: string; danger?: boolean }
const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);
/** Подтверждение необратимых действий: объясняет последствия, кнопка подтверждения названа по действию. */
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const ask = useCallback((o: Opts) => new Promise<boolean>((resolve) => { resolver.current = resolve; setOpts(o); }), []);
  const close = useCallback((v: boolean) => { resolver.current?.(v); setOpts(null); }, []);
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal open={!!opts} onClose={() => close(false)} title={opts?.title ?? ''} width="max-w-md"
        footer={<><Button variant="ghost" onClick={() => close(false)}>Отмена</Button><Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-testid="confirm-ok">{opts?.confirm}</Button></>}>
        <p className="text-[15px] leading-relaxed text-ink-2">{opts?.text}</p>
      </Modal>
    </Ctx.Provider>
  );
}
