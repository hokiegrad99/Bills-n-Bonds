import type { TooltipProps } from 'recharts';

interface ChartTooltipProps extends Partial<TooltipProps<any, any>> {
  valueFormatter?: (v: number) => string;
  labelFormatter?: (l: any) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  // Render as floating text only — no background panel, border, or
  // shadow, so chart hover surfaces are clean in both light AND dark
  // mode (Recharts' own hover cursor rectangle is removed via
  // `cursor={false}` on every <Tooltip> invocation in the page files).
  // Text colour is semantic (`slate-900` / `slate-100`) so the floating
  // label reads against either card-bg without needing a contrasting
  // rounded box behind it.
  return (
    <div className="px-3 py-2 text-xs text-slate-900 dark:text-slate-100">
      {labelFormatter ? (
        <div className="font-medium mb-1">{labelFormatter(label)}</div>
      ) : label !== undefined ? (
        <div className="font-medium mb-1">{String(label)}</div>
      ) : null}
      <div className="space-y-0.5">
        {payload.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full inline-block"
              style={{ background: (p.color as string) ?? '#888' }}
            />
            <span className="text-slate-500 dark:text-slate-400">{p.name}</span>
            <span className="font-medium tabular-nums">
              {typeof p.value === 'number'
                ? valueFormatter
                  ? valueFormatter(p.value as number)
                  : p.value
                : String(p.value ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
