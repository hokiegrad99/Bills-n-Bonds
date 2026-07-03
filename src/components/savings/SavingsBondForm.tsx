import { useState } from 'react';
import type { SavingsBond, HoldingStatus } from '../../lib/types';

interface SavingsBondFormProps {
  initial?: SavingsBond;
  onSubmit: (b: Omit<SavingsBond, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const blank = () => ({
  registration: 'Self',
  pod: '',
  confirmNumber: '',
  issueDate: new Date().toISOString().slice(0, 10),
  interestRate: 0,
  status: 'Active' as HoldingStatus,
  amount: 0,
  currentValue: 0,
});

export function SavingsBondForm({ initial, onSubmit, onCancel }: SavingsBondFormProps) {
  const [form, setForm] = useState(() => {
    if (!initial) return blank();
    const { id, createdAt, updatedAt, ...rest } = initial;
    void id; void createdAt; void updatedAt;
    return rest;
  });
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.registration.trim()) return setError('Registration is required.');
    if (!form.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.issueDate))
      return setError('Issue Date is required (YYYY-MM-DD).');
    if (form.amount <= 0) return setError('Amount must be greater than 0.');
    if (form.currentValue < 0) return setError('Current Value cannot be negative.');
    if (form.interestRate < 0) return setError('Interest Rate must be 0 or greater.');

    onSubmit({
      ...form,
      registration: form.registration.trim(),
      pod: form.pod.trim(),
      confirmNumber: form.confirmNumber?.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Registration">
        <input
          className="input"
          placeholder='e.g. Self, Joint, "Trust FBO Children"'
          value={form.registration}
          onChange={(e) => set('registration', e.target.value)}
        />
      </Field>
      <Field label="POD (Payable on Death)">
        <input
          className="input"
          placeholder="Beneficiary name (optional)"
          value={form.pod}
          onChange={(e) => set('pod', e.target.value)}
        />
      </Field>
      <Field label="Confirm #">
        <input
          className="input font-mono"
          value={form.confirmNumber ?? ''}
          onChange={(e) => set('confirmNumber', e.target.value)}
          placeholder="optional"
        />
      </Field>
      <Field label="Issue Date">
        <input
          type="date"
          className="input"
          value={form.issueDate}
          onChange={(e) => set('issueDate', e.target.value)}
        />
      </Field>
      <Field label="Interest Rate (% APR)">
        <input
          type="number"
          min={0}
          step={0.001}
          className="input tabular-nums text-right"
          value={form.interestRate}
          onChange={(e) => set('interestRate', Number(e.target.value))}
        />
      </Field>
      <Field label="Status">
        <select
          className="select"
          value={form.status}
          onChange={(e) => set('status', e.target.value as HoldingStatus)}
        >
          {/* Underlying values are the shared HoldingStatus enum so the
              same vocabulary rolls into CSV / storage. The user-facing
              labels swap "Sold" → "Redeemed" because a savings bond is
              redeemed at TreasuryDirect, never sold in a market sense. */}
          <option value="Active">Active</option>
          <option value="Matured">Matured</option>
          <option value="Pending">Pending</option>
          <option value="Sold">Redeemed</option>
        </select>
      </Field>
      <Field label="Amount (USD)">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input tabular-nums text-right"
          value={form.amount}
          onChange={(e) => set('amount', Number(e.target.value))}
        />
      </Field>
      <Field label="Current Value (USD)">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input tabular-nums text-right"
          value={form.currentValue}
          onChange={(e) => set('currentValue', Number(e.target.value))}
        />
      </Field>

      {error && (
        <div className="sm:col-span-2 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {initial ? 'Save Changes' : 'Add Savings Bond'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
