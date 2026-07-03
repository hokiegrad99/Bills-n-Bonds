import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Holding, HoldingStatus } from '../../lib/types';
import { cn } from '../../lib/cn';
import { TypeBadge } from '../ui/TypeBadge';
import { effectiveStatus, fromISODate, isWithin7Days, daysBetween } from '../../lib/calc';
import { fmtDateISO, fmtUSD, termLabel } from '../../lib/format';

interface HoldingsTableProps {
  holdings: Holding[];
  onEdit: (h: Holding) => void;
  onDelete: (h: Holding) => void;
}

type SortKey =
  | 'securityType'
  | 'institution'
  | 'termMonths'
  | 'maturityDate'
  | 'faceValue'
  | 'highRate'
  | 'interestEarned'
  | 'status';

export function HoldingsTable({ holdings, onEdit, onDelete }: HoldingsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'maturityDate',
    dir: 'asc',
  });

  const sorted = useMemo(() => {
    const list = [...holdings];
    list.sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      const cmp =
        av instanceof Date || bv instanceof Date
          ? fromISODate(String(av ?? '')).getTime() - fromISODate(String(bv ?? '')).getTime()
          : typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [holdings, sort]);

  const totalFace = holdings.reduce((s, h) => s + h.faceValue, 0);
  const totalInterest = holdings.reduce((s, h) => s + h.interestEarned, 0);

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <Th label="Type" k="securityType" sort={sort} setSort={setSort} />
            <Th label="Institution" k="institution" sort={sort} setSort={setSort} />
            <Th label="Term" k="termMonths" sort={sort} setSort={setSort} className="text-right" />
            <Th label="Confirm #" k="securityType" sort={null} setSort={null} className="hidden md:table-cell" />
            <Th label="CUSIP" k="securityType" sort={null} setSort={null} className="hidden md:table-cell" />
            <Th label="Maturity" k="maturityDate" sort={sort} setSort={setSort} />
            <Th label="Face" k="faceValue" sort={sort} setSort={setSort} className="text-right" />
            <Th label="Yield" k="highRate" sort={sort} setSort={setSort} className="text-right" />
            <Th label="Interest" k="interestEarned" sort={sort} setSort={setSort} className="text-right" />
            <Th label="Status" k="status" sort={sort} setSort={setSort} />
            <th className=""></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            // Compute days-until-maturity ONCE per row; reused for the
            // amber row ring (derived-Pending cue) AND the StatusPill
            // copy ("Matures today" / "Matures in 5d" etc.).
            const eff = effectiveStatus(h);
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            const daysUntilMaturity =
              eff === 'Pending'
                ? daysBetween(todayMidnight, fromISODate(h.maturityDate))
                : undefined;
            return (
              <tr
                key={h.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td
                  className={cn(
                    // Paint the imminence marker on the FIRST <td> using
                    // an ALWAYS-ON 4-px transparent left border so the
                    // colour swap never causes a layout reflow between
                    // rows. (Ring-inset on <tr> is unreliable across
                    // browsers — Safari in particular — so we anchor on
                    // a reliably-paintable cell.)
                    'border-l-4 border-l-transparent',
                    isWithin7Days(h) && 'border-l-amber-400 dark:border-l-amber-500',
                  )}
                >
                  <TypeBadge type={h.securityType} />
                </td>
                <td className="font-medium">{h.institution}</td>
                <td className="text-right tabular-nums">{termLabel(h.termMonths)}</td>
                <td className="hidden md:table-cell font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {h.confirmNumber ?? '—'}
                </td>
                <td className="hidden md:table-cell font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {h.cusip ?? '—'}
                </td>
                <td className="tabular-nums">{fmtDateISO(h.maturityDate)}</td>
                <td className="text-right tabular-nums">{fmtUSD(h.faceValue)}</td>
                <td className="text-right tabular-nums">{h.highRate.toFixed(2)}%</td>
                <td className="text-right tabular-nums">{fmtUSD(h.interestEarned, { cents: true })}</td>
                <td>
                  <StatusPill
                    status={eff}
                    stateTaxExempt={h.stateTaxExempt}
                    daysUntilMaturity={daysUntilMaturity}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    <button className="btn-ghost p-1.5" onClick={() => onEdit(h)} title="Edit">
                      Edit
                    </button>
                    <button
                      className="btn-ghost p-1.5 text-rose-600 dark:text-rose-400"
                      onClick={() => onDelete(h)}
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 dark:bg-slate-900/60 font-semibold">
            <td colSpan={6} className="px-3 py-2">Total ({sorted.length} holding{sorted.length === 1 ? '' : 's'})</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totalFace)}</td>
            <td></td>
            <td className="px-3 py-2 text-right tabular-nums">
              {fmtUSD(totalInterest, { cents: true })}
            </td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  label,
  k,
  sort,
  setSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null;
  setSort: ((s: { key: SortKey; dir: 'asc' | 'desc' }) => void) | null;
  className?: string;
}) {
  if (!sort || !setSort) {
    return <th className={cn('px-3 py-2', className)}>{label}</th>;
  }
  const isActive = sort.key === k;
  const Icon = !isActive ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cn('px-3 py-2 select-none cursor-pointer', className)}>
      <button
        className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100"
        onClick={() => setSort({ key: k, dir: isActive && sort.dir === 'asc' ? 'desc' : 'asc' })}
      >
        <span>{label}</span>
        <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
      </button>
    </th>
  );
}

function StatusPill({
  status,
  stateTaxExempt,
  daysUntilMaturity,
}: {
  status: HoldingStatus;
  stateTaxExempt: boolean;
  daysUntilMaturity?: number;
}) {
  const cls =
    status === 'Active'
      ? 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-900/30 dark:text-accent-200 dark:ring-accent-800'
      : status === 'Matured'
      ? 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
      : status === 'Pending'
      ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800'
      : 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800';
  // Replace the bare "Pending" status word with a count-aware message
  // so imminence reads in plain English at a glance (matches the row's
  // amber ring cue). Negative days (e.g. explicit Pending on a past
  // mat-date) collapse to "Matures today" for safety.
  const label =
    status === 'Pending' && daysUntilMaturity !== undefined
      ? daysUntilMaturity <= 0
        ? 'Matures today'
        : daysUntilMaturity === 1
          ? 'Matures tomorrow'
          : `Matures in ${daysUntilMaturity}d`
      : status;
  return (
    <span className={cn('badge ring-inset whitespace-nowrap', cls)}>
      {stateTaxExempt ? (
        <span title="State tax exempt" className="text-[10px] uppercase tracking-wider">
          S/E
        </span>
      ) : null}
      {label}
    </span>
  );
}
