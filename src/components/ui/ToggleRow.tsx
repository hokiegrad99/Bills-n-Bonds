import { cn } from '../../lib/cn';

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}

export function ToggleRow({ label, description, checked, onChange, className }: ToggleRowProps) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 cursor-pointer select-none p-3 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/70',
        className,
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-brand-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</div>
        )}
      </div>
    </label>
  );
}
