// Единый набор линейных иконок (24×24, stroke 1.6) — вместо эмодзи и случайных иконок.
const P: Record<string, string[]> = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
  briefcase: ['M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M3 13h18'],
  mail: ['M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'm3 7 9 6 9-6'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  sliders: ['M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1', 'M15 4v4M9 10v4M17 16v4'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  download: ['M12 4v12', 'm7 11 5 5 5-5', 'M4 20h16'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  'check-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm8 12.5 2.8 2.8L16 10'],
  alert: ['m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z', 'M12 9.5v4', 'M12 17h.01'],
  x: ['M6 6l12 12M18 6 6 18'],
  'x-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm9.5 9.5 5 5m0-5-5 5'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 12h.01'],
  'chevron-right': ['m9 6 6 6-6 6'],
  'chevron-left': ['m15 6-6 6 6 6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'arrow-right': ['M5 12h14', 'm13 6 6 6-6 6'],
  'arrow-left': ['M19 12H5', 'm11 6-6 6 6 6'],
  copy: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  refresh: ['M20 11a8 8 0 0 0-14.9-3M4 5v4h4', 'M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4'],
  edit: ['M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z', 'm13.5 6.5 4 4'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-4-4'],
  trend: ['m3 17 6-6 4 4 8-8', 'M15 7h6v6'],
  shield: ['M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z', 'm9 12 2 2 4-4'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5'],
  plus: ['M12 5v14M5 12h14'],
  list: ['M9 6h11M9 12h11M9 18h11', 'M4.5 6h.01M4.5 12h.01M4.5 18h.01'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12', 'M9 7V4h6v3'],
  skip: ['m5 5 9 7-9 7z', 'M19 5v14'],
};

export type IconName = keyof typeof P;

export default function Icon({ name, size = 18, className, strokeWidth = 1.6 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      {P[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
