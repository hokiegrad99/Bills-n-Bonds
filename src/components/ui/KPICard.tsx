import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { ACCENT_BORDER, type Accent } from './Card';

interface KPICardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  /** Optional trend, e.g. +5.2%. Up = green, Down = red, Flat = slate. */
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  /** Shared accent key with <Card>. */
  accent?: Accent;
  footer?: React.ReactNode;
  /**
   * If set, the entire card becomes a deep-link to that URL (rendered
   * as a react-router <Link> anchor). Empty/undefined renders a plain
   * <div> so non-link variants stay unchanged.
   */
  to?: string;
}

const ACCENT_BG: Record<Accent, string> = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200',
  accent: 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-200',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
};

export function KPICard({ label, value, icon: Icon, hint, trend, accent, footer, to }: KPICardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? 'text-accent-700 dark:text-accent-300'
      : trend?.direction === 'down'
      ? 'text-rose-700 dark:text-rose-300'
      : 'text-slate-600 dark:text-slate-300';
  const TrendIcon =
    trend?.direction === 'up' ? ArrowUpRight : trend?.direction === 'down' ? ArrowDownRight : Minus;

  const accentBorder = accent ? `border-l-4 ${ACCENT_BORDER[accent]}` : undefined;
  const cardBody = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="label-eyebrow">{label}</span>
        {Icon && (
          <span
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md',
              accent ? ACCENT_BG[accent] : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            <Icon size={14} />
          </span>
        )}
      </div>
      <div className="text-2xl md:text-[26px] font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 min-h-[16px]">
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', trendColor)}>
            <TrendIcon size={12} />
            {trend.label}
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
      {footer && <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{footer}</div>}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          'card p-4 md:p-5 flex flex-col gap-2 min-h-[112px] no-underline text-inherit rounded-[inherit] hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/50 focus-visible:outline-none transition-colors',
          accentBorder,
        )}
      >
        {cardBody}
      </Link>
    );
  }

  return (
    <div className={cn('card p-4 md:p-5 flex flex-col gap-2 min-h-[112px]', accentBorder)}>
      {cardBody}
    </div>
  );
}
