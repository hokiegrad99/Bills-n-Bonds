import { cn } from '../../lib/cn';
import type { SecurityType } from '../../lib/types';
import { SECURITY_TYPE_META } from '../../lib/types';

interface TypeBadgeProps {
  type: SecurityType;
  size?: 'sm' | 'md';
  className?: string;
  showLabel?: boolean;
}

export function TypeBadge({ type, size = 'sm', className, showLabel = true }: TypeBadgeProps) {
  const meta = SECURITY_TYPE_META[type];
  return (
    <span
      className={cn(
        'badge whitespace-nowrap',
        meta.bg,
        meta.tailwind,
        meta.ring,
        size === 'md' && 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{ color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {showLabel ? type : null}
    </span>
  );
}
