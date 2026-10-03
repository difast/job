'use client';
import { useEffect, useId, useRef } from 'react';
import Icon from './Icon';

/** Диалог: по центру на desktop, «шторка» снизу на мобильных. Esc, клик по фону, блокировка прокрутки, возврат фокуса. */
export default function Modal({ open, onClose, title, description, children, footer, width = 'max-w-2xl' }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; width?: string;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={`sheet-in flex max-h-[92dvh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-[0_24px_80px_-12px_rgba(14,17,32,0.35)] outline-none sm:rounded-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink"><Icon name="x" size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="safe-bottom flex items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}
