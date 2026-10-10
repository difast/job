import Link from 'next/link';
import type { ReactNode } from 'react';
import { LandingFooter, LandingHeader } from './landing';
import { COMPANY, LEGAL_DOCS, LEGAL_EDITION } from '@/lib/legal';
import { cx } from './ui';

export interface LegalSection { id: string; title: string; items?: (ReactNode | { text: ReactNode; sub: ReactNode[] })[]; body?: ReactNode }

const isSub = (x: unknown): x is { text: ReactNode; sub: ReactNode[] } => !!x && typeof x === 'object' && 'sub' in (x as object);

export function Requisites() {
  const rows: [string, string][] = [
    ['Наименование', COMPANY.fullName], ['ОГРН', COMPANY.ogrn], ['ИНН', COMPANY.inn], ['КПП', COMPANY.kpp],
    ['Адрес', COMPANY.address], ['Часы связи', COMPANY.hours],
  ];
  if (COMPANY.email) rows.splice(5, 0, ['Электронная почта', COMPANY.email]);
  return (
    <dl className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
          <dt className="text-sm text-muted">{k}</dt><dd className="text-[15px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Страница юридического документа: оглавление, нумерованные пункты, переключение между документами. */
export default function LegalDoc({ href, signedIn, intro, sections }: { href: string; signedIn: boolean; intro?: ReactNode; sections: LegalSection[] }) {
  const doc = LEGAL_DOCS.find((d) => d.href === href)!;
  return (
    <>
      <LandingHeader signedIn={signedIn} />
      <main className="mx-auto w-full max-w-[1240px] px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        <nav aria-label="Юридические документы" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.href} href={d.href} aria-current={d.href === href ? 'page' : undefined}
              className={cx('shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors', d.href === href ? 'bg-ink text-milk' : 'bg-stone text-ink-2 hover:text-ink')}>{d.short}</Link>
          ))}
        </nav>

        <header className="mt-10 max-w-[760px]">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[42px]">{doc.title}</h1>
          <p className="mt-4 text-[15px] text-ink-2">Редакция от {LEGAL_EDITION} · {COMPANY.name}, ИНН {COMPANY.inn}</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav aria-label="Содержание" className="sticky top-24">
              <div className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-muted">Содержание</div>
              <ol className="space-y-1 border-l border-line">
                {sections.map((s, i) => (
                  <li key={s.id}><a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-sm leading-snug text-ink-2 transition-colors hover:border-accent-500 hover:text-ink">{i + 1}. {s.title}</a></li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="user-text max-w-[760px] text-[15.5px] leading-[1.7] text-ink">
            {intro && <div className="mb-10 space-y-4 text-ink-2">{intro}</div>}
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-line pb-2 pt-8 first:border-t-0 first:pt-0">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{i + 1}. {s.title}</h2>
                {s.items && (
                  <ol className="mt-4 space-y-3">
                    {s.items.map((it, j) => (
                      <li key={j} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2">
                        <span className="tabular text-ink-2">{i + 1}.{j + 1}.</span>
                        {isSub(it) ? (
                          <div>{it.text}
                            <ul className="mt-2 space-y-1.5">{it.sub.map((x, k) => <li key={k} className="flex gap-3"><span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink-2" />{<span>{x}</span>}</li>)}</ul>
                          </div>
                        ) : <div>{it}</div>}
                      </li>
                    ))}
                  </ol>
                )}
                {s.body && <div className="mt-4">{s.body}</div>}
              </section>
            ))}
          </article>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}

export const A = ({ href, children }: { href: string; children: ReactNode }) => <Link href={href} className="font-medium text-accent-600 underline decoration-accent-200 underline-offset-2 hover:text-accent-700">{children}</Link>;
