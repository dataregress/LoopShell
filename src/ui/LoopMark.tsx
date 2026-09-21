import { cn } from '@/lib/cn';

export interface LoopMarkProps {
  size?: number;
  /** Ring filled while the panel is open. */
  filled?: boolean;
  className?: string;
}

/**
 * Loop mark: open ring in `--primary` with a yellow spark at 2 o'clock; the
 * ring gap faces the spark (docs/ui-ux.md §4.4). Never recoloured.
 */
export function LoopMark({ size = 28, filled = false, className }: LoopMarkProps) {
  // Ring gap centred on 2 o'clock (-30deg from 12), spanning ~50deg.
  const r = 11;
  const c = 14;
  const gapCentre = -30;
  const gapHalf = 26;
  const start = polar(c, r, gapCentre + gapHalf);
  const end = polar(c, r, gapCentre - gapHalf + 360);
  const spark = polar(c, r + 1.2, gapCentre);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {filled && <circle cx={c} cy={c} r={r - 1.25} fill="var(--primary)" opacity={0.18} />}
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle cx={spark.x} cy={spark.y} r={2.5} fill="var(--accent)" />
    </svg>
  );
}

function polar(c: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: +(c + r * Math.cos(rad)).toFixed(3), y: +(c + r * Math.sin(rad)).toFixed(3) };
}
