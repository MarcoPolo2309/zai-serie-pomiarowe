export const ICONS = ['circle', 'square', 'triangle', 'diamond'] as const;
export const ICON_LABELS: Record<string, string> = { circle: 'koło', square: 'kwadrat', triangle: 'trójkąt', diamond: 'romb' };
// Styl linii dobierany po kolejności serii: seria nie jest rozróżniana tylko kolorem (WCAG 1.4.1)
export const DASHES = ['', '8 4', '2 4', '10 4 2 4'];

interface P { kind: string | null; cx: number; cy: number; r?: number; color: string; selected?: boolean }

export function Marker({ kind, cx, cy, r = 5, color, selected }: P) {
  const common = { fill: color, stroke: '#fff', strokeWidth: 1 };
  let shape;
  switch (kind) {
    case 'square': shape = <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />; break;
    case 'triangle': shape = <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} {...common} />; break;
    case 'diamond': shape = <polygon points={`${cx},${cy - r - 2} ${cx + r + 2},${cy} ${cx},${cy + r + 2} ${cx - r - 2},${cy}`} {...common} />; break;
    default: shape = <circle cx={cx} cy={cy} r={r} {...common} />;
  }
  return (
    <g>
      {selected && <circle cx={cx} cy={cy} r={r + 9} fill="none" stroke="#000" strokeWidth={3} />}
      {selected && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="#fff" strokeWidth={2} />}
      {shape}
    </g>
  );
}

/** Próbka legendy: odcinek linii w stylu serii z jej znacznikiem. */
export function Swatch({ kind, color, dash }: { kind: string | null; color: string; dash: string }) {
  return (
    <svg width="40" height="16" viewBox="0 0 40 16" aria-hidden="true" focusable="false">
      <line x1="0" y1="8" x2="40" y2="8" stroke={color} strokeWidth="2" strokeDasharray={dash || undefined} />
      <Marker kind={kind} cx={20} cy={8} r={4} color={color} />
    </svg>
  );
}
