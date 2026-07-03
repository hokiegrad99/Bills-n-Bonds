import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FilePlus2, FileUp, PiggyBank, Trash2, Banknote, CircleDollarSign } from 'lucide-react';
import { useSavingsBonds } from '../lib/savings-storage';
import type { SavingsBond } from '../lib/types';
import { SavingsBondForm } from '../components/savings/SavingsBondForm';
import { SavingsBondsTable } from '../components/savings/SavingsBondsTable';
import { SavingsBondsImportDialog } from '../components/savings/SavingsBondsImportDialog';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { KPICard } from '../components/ui/KPICard';
import { savingsBondsToCSV } from '../lib/csv-savings';
import { useToast } from '../components/ui/Toast';
import { fmtUSD } from '../lib/format';

// Sentinel key for bonds with no POD, sorted to the end of the group list.
const NO_POD = '__no_pod__';

export function SavingsBondsPage() {
  const {
    savingsBonds,
    addSavingsBond,
    updateSavingsBond,
    deleteSavingsBond,
    deleteSavingsBonds,
    importSavingsBonds,
  } = useSavingsBonds();
  const { toast } = useToast();

  const [editing, setEditing] = useState<SavingsBond | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SavingsBond | null>(null);
  // Multi-select state: a Set of bond IDs the user has ticked. The
  // page-level "Select all" toggle and the per-row checkboxes both
  // mutate this; the bulk "Delete N selected" action reads it.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Bulk-delete confirmation: an array of IDs queued for deletion,
  // or null when the modal is closed.
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);

  // Prune any selected IDs that no longer correspond to a bond (e.g.
  // the user deleted a selected row via the per-row Delete button, or
  // a restore replaced the dataset). Without this, the "Delete N
  // selected" count could lie until the next explicit clear.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(savingsBonds.map((b) => b.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [savingsBonds]);

  const allSelected = savingsBonds.length > 0 && selectedIds.size === savingsBonds.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  // Snapshot of which POD groups + count are affected by the in-flight
  // bulk-delete confirmation. Drives the "across N POD groups" copy
  // in the modal without recomputing the set on every render.
  const { affectedPodCount, affectedPod } = useMemo(() => {
    if (!bulkDeleteIds) return { affectedPodCount: 0, affectedPod: '' as string };
    const idSet = new Set(bulkDeleteIds);
    const pods = new Set<string>();
    for (const b of savingsBonds) {
      if (idSet.has(b.id)) pods.add(b.pod.trim() || 'No POD');
    }
    return {
      affectedPodCount: pods.size,
      affectedPod: pods.size === 1 ? Array.from(pods)[0] : '',
    };
  }, [bulkDeleteIds, savingsBonds]);

  // The native HTML checkbox has no React prop for `indeterminate`
  // (until React 19), so we mirror the partial-selection state into
  // the DOM via a ref on each render.
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(savingsBonds.map((b) => b.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const totalCount = savingsBonds.length;
  const totalAmount = useMemo(
    () => savingsBonds.reduce((s, b) => s + b.amount, 0),
    [savingsBonds],
  );
  const totalCurrent = useMemo(
    () => savingsBonds.reduce((s, b) => s + b.currentValue, 0),
    [savingsBonds],
  );
  const unrealized = totalCurrent - totalAmount;

  // Group bonds by POD, sorted alphabetically with the empty-POD group last.
  const groups = useMemo(() => {
    const map = new Map<string, SavingsBond[]>();
    for (const b of savingsBonds) {
      const key = b.pod.trim() || NO_POD;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === NO_POD) return 1;
        if (b === NO_POD) return -1;
        return a.localeCompare(b);
      })
      .map(([key, items]) => ({
        key,
        label: key === NO_POD ? 'No POD' : key,
        bonds: items,
      }));
  }, [savingsBonds]);

  function exportCSV() {
    const csv = savingsBondsToCSV(savingsBonds);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bnb-savings-bonds-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card
        accent="brand"
        eyebrow="Savings Bonds"
        title={`${totalCount} bond${totalCount === 1 ? '' : 's'}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {/* "Select all" + "Delete N selected" appear whenever the
                user has any selection. The checkbox state is the
                standard tri-state: unchecked (none), indeterminate
                (some), checked (all). Clicking it cycles to the
                opposite of the "all" state so a single tap is enough
                to either fully select or fully deselect. */}
            {totalCount > 0 && (
              <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 select-none cursor-pointer">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="h-4 w-4 rounded accent-brand-600 cursor-pointer"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all savings bonds"
                />
                <span>
                  {allSelected
                    ? `All ${totalCount} selected`
                    : someSelected
                    ? `${selectedIds.size} of ${totalCount} selected`
                    : 'Select all'}
                </span>
              </label>
            )}
            {selectedIds.size > 0 && (
              <button
                className="btn-danger"
                onClick={() => setBulkDeleteIds(Array.from(selectedIds))}
                title="Delete the selected bonds"
              >
                <Trash2 size={14} /> Delete {selectedIds.size} selected
              </button>
            )}
            <button className="btn-secondary" onClick={() => setShowImport(true)}>
              <FileUp size={14} /> Import CSV
            </button>
            <button className="btn-secondary" onClick={exportCSV} disabled={!savingsBonds.length}>
              <Download size={14} /> Export CSV
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              <FilePlus2 size={14} /> Add savings bond
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Track US Savings Bonds (Series EE, I, etc.) by Payable-on-Death beneficiary. Each
          group below is one POD — bonds with no POD appear in a final “No POD” group.
        </p>
      </Card>

      {/* Page-specific KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <KPICard
          label="Total Savings Bonds"
          value={totalCount}
          icon={PiggyBank}
          accent="brand"
          hint={`Across ${groups.length} POD group${groups.length === 1 ? '' : 's'}`}
        />
        <KPICard
          label="Total Amount"
          value={fmtUSD(totalAmount, { compact: true })}
          icon={Banknote}
          accent="accent"
          hint="Original issue amount"
        />
        <KPICard
          label="Total Current Value"
          value={fmtUSD(totalCurrent, { compact: true })}
          icon={CircleDollarSign}
          accent="violet"
          hint={
            unrealized === 0
              ? 'Current redeemable value'
              : unrealized > 0
              ? `+${fmtUSD(unrealized, { compact: true })} unrealized`
              : // Negative branch: format the magnitude with fmtUSD and
                // prepend an explicit sign so the hint reads "-$50
                // unrealized" instead of the "$-50" artefact fmtUSD
                // produces when handed a negative number.
                `-${fmtUSD(Math.abs(unrealized), { compact: true })} unrealized`
          }
        />
      </div>

      {savingsBonds.length === 0 ? (
        <Card accent="amber" eyebrow="Table" title="No bonds yet" bodyClassName="p-0">
          <div className="p-6">
            <EmptyState
              icon={<PiggyBank size={20} />}
              title="No savings bonds yet"
              description="Add your first Series EE or Series I savings bond to get started, or import from a CSV."
              action={
                <button className="btn-primary" onClick={() => setShowForm(true)}>
                  Add savings bond
                </button>
              }
            />
          </div>
        </Card>
      ) : (          groups.map((g) => (
            <Card
              key={g.key}
              accent="amber"
              eyebrow="POD"
              title={g.label}
              bodyClassName="p-0"
            >
              <SavingsBondsTable
                bonds={g.bonds}
                onEdit={(b) => {
                  setEditing(b);
                  setShowForm(true);
                }}
                onDelete={(b) => setConfirmDelete(b)}
                selectedIds={selectedIds}
                onToggleSelect={toggleRow}
              />
            </Card>
          ))
      )}

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={editing ? 'Edit savings bond' : 'Add a new savings bond'}
        size="lg"
      >
        <SavingsBondForm
          initial={editing ?? undefined}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={(b) => {
            if (editing) {
              updateSavingsBond(editing.id, b);
              toast('Savings bond updated', 'success');
            } else {
              addSavingsBond(b);
              toast('Savings bond added', 'success');
            }
            setShowForm(false);
            setEditing(null);
          }}
        />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this savings bond?"
        size="sm"
      >
        {confirmDelete && (
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3">
            <div>
              You're about to permanently delete this savings bond owned by{' '}
              <strong>{confirmDelete.registration}</strong> with current value{' '}
              <strong>{fmtUSD(confirmDelete.currentValue)}</strong>.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  deleteSavingsBond(confirmDelete.id);
                  setConfirmDelete(null);
                  toast('Savings bond deleted', 'info');
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      <SavingsBondsImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={(rows) => {
          const count = importSavingsBonds(rows);
          // A new import may overwrite IDs the user previously
          // selected, so clear the selection to keep the count
          // honest.
          clearSelection();
          toast(
            `Imported ${count} savings bond${count === 1 ? '' : 's'}`,
            'success',
          );
          return count;
        }}
      />

      {/* Bulk-delete confirmation: surfaces when the user clicks
          "Delete N selected" in the header. The IDs are snapshotted
          at click-time so a concurrent import / delete can't shift
          what gets removed. */}
      <Modal
        open={bulkDeleteIds != null}
        onClose={() => setBulkDeleteIds(null)}
        title={
          bulkDeleteIds
            ? `Delete ${bulkDeleteIds.length} savings bond${bulkDeleteIds.length === 1 ? '' : 's'}?`
            : 'Delete selected savings bonds?'
        }
        size="sm"
      >
        {bulkDeleteIds && (
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-3">
            {/* Group-count summary helps the user see at a glance
                whether the selection spans multiple POD buckets. The
                memo is recomputed only when the selection or the
                underlying dataset changes, so the confirmation copy
                doesn't pay an O(N*M) cost on every render. */}
            <div>
              You're about to permanently delete{' '}
              <strong>
                {bulkDeleteIds.length} savings bond{bulkDeleteIds.length === 1 ? '' : 's'}
              </strong>
              {affectedPodCount > 1 && (
                <>
                  {' '}across <strong>{affectedPodCount}</strong> POD groups
                </>
              )}
              {affectedPodCount === 1 && affectedPod && (
                <>
                  {' '}in the <strong>{affectedPod}</strong> POD group
                </>
              )}
              . This cannot be undone.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setBulkDeleteIds(null)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  const count = bulkDeleteIds.length;
                  deleteSavingsBonds(bulkDeleteIds);
                  setBulkDeleteIds(null);
                  clearSelection();
                  toast(
                    `Deleted ${count} savings bond${count === 1 ? '' : 's'}`,
                    'info',
                  );
                }}
              >
                <Trash2 size={14} /> Delete {bulkDeleteIds.length}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
