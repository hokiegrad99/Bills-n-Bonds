import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { SavingsBond, HoldingStatus } from '../../lib/types';
import { cn } from '../../lib/cn';
import { fmtDateISO, fmtUSD } from '../../lib/format';

interface SavingsBondsTableProps {
  bonds: SavingsBond[];
  onEdit: (b: SavingsBond) => void;
  onDelete: (b: SavingsBond) => void;
  /**
   * Multi-select state for the bulk-delete flow. The page owns the Set
   * so it can also render the page-level "Select all" + "Delete N
   * selected" affordances without re-lifting state. Pass an empty Set
   * (or omit via the optional default) to keep the table in single-row
   * mode without checkboxes.
   */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

type SortKey = 'registration' | 'issueDate' | 'interestRate' | 'amount' | 'currentValue' | 'status';

export function SavingsBondsTable({
  bonds,
  onEdit,
  onDelete,
  selectedIds,
  onToggleSelect,
}: SavingsBondsTableProps) {
  const selectionEnabled = selectedIds != null && onToggleSelect != null;
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'issueDate',
    dir: 'asc',
  });

  const sorted = useMemo(() => {
    const list = [...bonds];
    list.sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [bonds, sort]);

  const totalAmount = bonds.reduce((s, b) => s + b.amount, 0);
  const totalCurrent = bonds.reduce((s, b) => s + b.currentValue, 0);

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {selectionEnabled && (
              <th className="px-2 py-2 w-8" aria-label="Select">
                <span className="sr-only">Select</span>
              </th>
            )}
            <Th label="Registration" k="registration" sort={sort} setSort={setSort} />
            <Th label="Confirm #" k="registration" sort={null} setSort={null} className="hidden md:table-cell" />
            <Th label="Issue Date" k="issueDate" sort={sort} setSort={setSort} />
            <Th label="Rate" k="interestRate" sort={sort} setSort={setSort} className="text-right" />
            <Th label="Status" k="status" sort={sort} setSort={setSort} />
            <Th label="Amount" k="amount" sort={sort} setSort={setSort} className="text-right" />
            <Th label="Current Value" k="currentValue" sort={sort} setSort={setSort} className="text-right" />
            <th className=""></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => (
            <tr
              key={b.id}
              className={
                selectionEnabled && selectedIds!.has(b.id)
                  ? // Highlight selected rows so the user can see the
                    // multi-select state at a glance without scanning
                    // every checkbox.
                    'bg-brand-50/50 dark:bg-brand-900/20 hover:bg-brand-50 dark:hover:bg-brand-900/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }
            >
              {selectionEnabled && (
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded accent-brand-600 cursor-pointer"
                    checked={selectedIds!.has(b.id)}
                    onChange={() => onToggleSelect!(b.id)}
                    aria-label={`Select bond for ${b.registration}`}
                  />
                </td>
              )}
              <td className="font-medium">{b.registration}</td>
              <td className="hidden md:table-cell font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {b.confirmNumber ?? '—'}
              </td>
              <td className="tabular-nums">{fmtDateISO(b.issueDate)}</td>
              <td className="text-right tabular-nums">{b.interestRate.toFixed(2)}%</td>
              <td>
                <StatusPill status={b.status} />
              </td>
              <td className="text-right tabular-nums">{fmtUSD(b.amount)}</td>
              <td className="text-right tabular-nums">{fmtUSD(b.currentValue, { cents: true })}</td>
              <td>
                <div className="flex items-center gap-1 justify-end">
                  <button className="btn-ghost p-1.5" onClick={() => onEdit(b)} title="Edit">
                    Edit
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-rose-600 dark:text-rose-400"
                    onClick={() => onDelete(b)}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 dark:bg-slate-900/60 font-semibold">
            <td colSpan={selectionEnabled ? 6 : 5} className="px-3 py-2">
              Subtotal ({sorted.length} bond{sorted.length === 1 ? '' : 's'})
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totalAmount)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(totalCurrent, { cents: true })}</td>
            <td></td>
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

// Display label map: keeps the underlying HoldingStatus enum (so the
// status type stays shared with Holdings) but swaps the savings-bond-
// specific terms so the user never sees "Sold" for a redeemed bond.
const STATUS_DISPLAY: Record<HoldingStatus, string> = {
  Active: 'Active',
  Matured: 'Matured',
  Pending: 'Pending',
  Sold: 'Redeemed',
};

function StatusPill({ status }: { status: HoldingStatus }) {
  const cls =
    status === 'Active'
      ? 'bg-accent-50 text-accent-700 ring-accent-200 dark:bg-accent-900/30 dark:text-accent-200 dark:ring-accent-800'
      : status === 'Matured'
      ? 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
      : status === 'Pending'
      ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800'
      : 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800';
  return <span className={cn('badge ring-inset whitespace-nowrap', cls)}>{STATUS_DISPLAY[status]}</span>;
}
