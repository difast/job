'use client';
import { useState } from 'react';
import Icon from '../Icon';

export default function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  async function copy() {
    try { await navigator.clipboard.writeText(url); setState('ok'); } catch { setState('err'); }
    setTimeout(() => setState('idle'), 1800);
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-canvas px-3 py-2 text-[12.5px]" data-testid="link-url">{url}</code>
      <button type="button" onClick={copy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-white px-3 text-[13px] font-medium hover:bg-subtle" aria-label={`Копировать ссылку ${url}`}>
        <Icon name={state === 'ok' ? 'check' : 'copy'} size={14} />{state === 'ok' ? 'Скопировано' : state === 'err' ? 'Выделите вручную' : 'Копировать'}
      </button>
    </div>
  );
}
