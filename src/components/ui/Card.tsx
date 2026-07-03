import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Single source of truth for the colour-key union used across Card
 * borders and KPICard accent prop. New accents (eg. cyan) should be
 * added here once and consumed by both widgets.
 */
export type Accent = 'brand' | 'accent' | 'amber' | 'violet' | 'rose';

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  bodyClassName?: string;
  variant?: 'default' | 'subtle';
  /**
   * Optional colour accent for a 4-px coloured left border. Mirrors
   * KPICard's accent system so KPI tiles and chart/info cards share
   * the same visual language across the dashboard / app.
   */
  accent?: Accent;
}

// Shared map so KPICard can also reuse it without duplicating the
// Tailwind-class literal strings (which Tailwind JIT requires).
export const ACCENT_BORDER: Record<Accent, string> = {
  // Longhand `border-l-...` so only the LEFT edge receives the accent
  // colour. Each entry also carries a `dark:` variant at shade-400 —
  // lighter for higher pop on `bg-slate-900` and crucially with
  // specificity (0, 2, 0) matching `.dark .card`'s `border-color`
  // shorthand (specificity also (0, 2, 0)), so the @layer utilities
  // source order lets our dark longhand win over the .card's dark
  // SHORTHAND `border-color: slate-800` (which would otherwise silently
  // re-tint the LEFT edge back to slate-800 in dark mode and make the
  // accent border invisible against the dark frame).
  brand: 'border-l-brand-500 dark:border-l-brand-400',
  accent: 'border-l-accent-500 dark:border-l-accent-400',
  amber: 'border-l-amber-500 dark:border-l-amber-400',
  violet: 'border-l-violet-500 dark:border-l-violet-400',
  rose: 'border-l-rose-500 dark:border-l-rose-400',
};

export function Card({
  className,
  title,
  eyebrow,
  action,
  children,
  bodyClassName,
  variant = 'default',
  accent,
  ...rest
}: CardProps) {
  const showHeader = Boolean(title || eyebrow || action);
  return (
    <div
      className={cn(
        'card',
        variant === 'subtle' && 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800',
        accent && `border-l-4 ${ACCENT_BORDER[accent]}`,
        className,
      )}
      {...rest}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4">
          <div>
            {eyebrow && <div className="label-eyebrow">{eyebrow}</div>}
            {title && <h3 className="mt-0.5">{title}</h3>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn('px-4 md:px-5 py-4', bodyClassName)}>{children}</div>
    </div>
  );
}
