import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-10 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40',
        className,
      )}
    >
      {icon && (
        <div className="h-12 w-12 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 grid place-items-center mb-3">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold">{title}</div>
      {description && (
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md">{description}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
