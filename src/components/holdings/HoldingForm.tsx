import { useEffect, useMemo, useState } from 'react';
import type { Holding, SecurityType } from '../../lib/types';
import { SECURITY_TYPES } from '../../lib/types';
import { addMonths, billDiscountInterest, couponInterestToMaturity } from '../../lib/calc';
import { toISODate } from '../../lib/calc';
import { termLabel } from '../../lib/format';

interface HoldingFormProps {
  initial?: Holding;
  onSubmit: (h: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const TERM_PRESETS: Record<SecurityType, { months: number; label: string }[]> = {
  Bill: [
    { months: 1, label: '4-Week (1M)' },
    { months: 1.5, label: '6-Week' },
    { months: 2, label: '8-Week' },
    { months: 3, label: '13-Week (3M)' },
    { months: 4.25, label: '17-Week' },
    { months: 6, label: '26-Week (6M)' },
    { months: 12, label: '52-Week (12M)' },
  ],
  Note: [
    { months: 24, label: '2-Year' },
    { months: 36, label: '3-Year' },
    { months: 60, label: '5-Year' },
    { months: 84, label: '7-Year' },
    { months: 120, label: '10-Year' },
  ],
  Bond: [
    { months: 240, label: '20-Year' },
    { months: 360, label: '30-Year' },
  ],
  TIPS: [
    { months: 60, label: '5-Year' },
    { months: 120, label: '10-Year' },
    { months: 240, label: '20-Year' },
    { months: 360, label: '30-Year' },
  ],
  CD: [
    { months: 6, label: '6-Month' },
    { months: 12, label: '12-Month' },
    { months: 24, label: '24-Month' },
    { months: 60, label: '60-Month' },
  ],
};

const blank = () => ({
  securityType: 'Bill' as SecurityType,
  institution: 'US Treasury (TreasuryDirect)',
  termMonths: 3,
  confirmNumber: '',
  cusip: '',
  purchaseDate: toISODate(new Date()),
  maturityDate: toISODate(addMonths(new Date(), 3)),
  faceValue: 10000,
  purchasePrice: 0,
  highRate: 0,
  interestEarned: 0,
  taxYear: new Date().getFullYear(),
  stateTaxExempt: true,
  status: 'Active' as Holding['status'],
  autoReinvest: false,
  notes: '',
});

export function HoldingForm({ initial, onSubmit, onCancel }: HoldingFormProps) {
  const [form, setForm] = useState(() => {
    if (!initial) return blank();
    const { id, createdAt, updatedAt, ...rest } = initial;
    void id; void createdAt; void updatedAt;
    return rest;
  });
  const [error, setError] = useState<string | null>(null);

  // Auto-derive maturity date when purchase or term changes (only if user
  // hasn't manually edited it). Stores a flag.
  const [autoMaturity, setAutoMaturity] = useState(!initial);
  useEffect(() => {
    if (autoMaturity && form.purchaseDate) {
      setForm((f) => ({
        ...f,
        maturityDate: toISODate(addMonths(new Date(f.purchaseDate), f.termMonths)),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.purchaseDate, form.termMonths, autoMaturity]);

  const computedInterest = useMemo(() => {
    const face = Number(form.faceValue) || 0;
    const rate = Number(form.highRate) || 0;
    if (!face || !rate) return 0;
    if (form.securityType === 'Bill') {
      // Approximate days: 365 days / year * termYears
      const days = Math.round((form.termMonths / 12) * 365);
      return billDiscountInterest(face, rate, days).interest;
    }
    return couponInterestToMaturity(face, rate, form.termMonths / 12);
  }, [form.faceValue, form.highRate, form.securityType, form.termMonths]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.institution.trim()) return setError('Institution is required.');
    if (form.faceValue <= 0) return setError('Face value must be greater than 0.');
    if (form.highRate < 0) return setError('Yield/rate must be 0 or greater.');
    if (!form.purchaseDate || !form.maturityDate) return setError('Purchase and maturity dates are required.');

    onSubmit({
      ...form,
      purchasePrice: form.purchasePrice || computedPurchasePrice(),
      interestEarned: form.interestEarned || Math.round(computedInterest * 100) / 100,
    });
  }

  function computedPurchasePrice() {
    const face = Number(form.faceValue) || 0;
    const rate = Number(form.highRate) || 0;
    if (form.securityType === 'Bill') {
      const days = Math.round((form.termMonths / 12) * 365);
      return Math.round(billDiscountInterest(face, rate, days).purchasePrice * 100) / 100;
    }
    return face;
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Security Type">
        <select
          className="select"
          value={form.securityType}
          onChange={(e) => {
            const newType = e.target.value as SecurityType;
            const preset = TERM_PRESETS[newType].find((p) => p.months === form.termMonths)
              ?? TERM_PRESETS[newType][0];
            set('securityType', newType);
            set('termMonths', preset.months);
            if (newType !== 'Bill') set('stateTaxExempt', newType === 'TIPS');
          }}
        >
          {SECURITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Institution">
        <input
          className="input"
          placeholder="US Treasury, Bank, Broker, etc."
          value={form.institution}
          onChange={(e) => set('institution', e.target.value)}
        />
      </Field>
      <Field label="Term">
        <select
          className="select"
          value={form.termMonths}
          onChange={(e) => set('termMonths', Number(e.target.value))}
        >
          {TERM_PRESETS[form.securityType].map((t) => (
            <option key={t.months} value={t.months}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Confirm #">
        <input
          className="input"
          value={form.confirmNumber ?? ''}
          onChange={(e) => set('confirmNumber', e.target.value)}
          placeholder="optional"
        />
      </Field>
      <Field label="CUSIP">
        <input
          className="input font-mono"
          value={form.cusip ?? ''}
          onChange={(e) => set('cusip', e.target.value.toUpperCase())}
          placeholder="optional"
        />
      </Field>
      <Field label="Purchase Date">
        <input
          type="date"
          className="input"
          value={form.purchaseDate}
          onChange={(e) => set('purchaseDate', e.target.value)}
        />
      </Field>
      <Field label="Maturity Date">
        <input
          type="date"
          className="input"
          value={form.maturityDate}
          onChange={(e) => {
            setAutoMaturity(false);
            set('maturityDate', e.target.value);
          }}
        />
        <div className="text-[11px] text-slate-500 mt-1">
          {autoMaturity ? 'Auto-derived from term.' : 'Manually set.'}
        </div>
      </Field>
      <Field label="Face Value (USD)">
        <input
          type="number"
          min={0}
          step={100}
          className="input tabular-nums text-right"
          value={form.faceValue}
          onChange={(e) => set('faceValue', Number(e.target.value))}
        />
      </Field>
      <Field label="Purchase Price (USD)">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input tabular-nums text-right"
          value={form.purchasePrice || computedPurchasePrice()}
          onChange={(e) => set('purchasePrice', Number(e.target.value))}
        />
      </Field>
      <Field label={`High Rate / Yield (% ${form.securityType === 'Bill' ? 'discount' : 'APR'})`}>
        <input
          type="number"
          min={0}
          step={0.0001}
          className="input tabular-nums text-right"
          value={form.highRate}
          onChange={(e) => set('highRate', Number(e.target.value))}
        />
      </Field>
      <Field label="Interest Earned (USD)">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input tabular-nums text-right"
          value={form.interestEarned || Math.round(computedInterest * 100) / 100}
          onChange={(e) => set('interestEarned', Number(e.target.value))}
        />
        <div className="text-[11px] text-slate-500 mt-1">
          {form.faceValue && form.highRate ? (
            <>
              Estimated at <span className="font-mono">{termLabel(form.termMonths)}</span>:{' '}
              <span className="font-medium tabular-nums">${computedInterest.toFixed(2)}</span>
            </>
          ) : (
            'Enter face value and yield to auto-estimate.'
          )}
        </div>
      </Field>
      <Field label="Tax Year">
        <input
          type="number"
          min={2000}
          max={2099}
          className="input tabular-nums text-right"
          value={form.taxYear}
          onChange={(e) => set('taxYear', Number(e.target.value))}
        />
      </Field>
      <Field label="Status">
        <select
          className="select"
          value={form.status}
          onChange={(e) => set('status', e.target.value as Holding['status'])}
        >
          <option>Active</option>
          <option>Matured</option>
          <option>Pending</option>
          <option>Sold</option>
        </select>
      </Field>
      <Field label="State Tax Exempt?">
        <label className="inline-flex items-center gap-2 mt-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-brand-600"
            checked={form.stateTaxExempt}
            onChange={(e) => set('stateTaxExempt', e.target.checked)}
          />
          Mark as state-tax-exempt
        </label>
      </Field>
      <Field label="Auto-Reinvest at Maturity?">
        <label className="inline-flex items-center gap-2 mt-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-brand-600"
            checked={form.autoReinvest}
            onChange={(e) => set('autoReinvest', e.target.checked)}
          />
          Reinvest principal at maturity
        </label>
      </Field>
      <Field label="Notes" full>
        <textarea
          className="input min-h-[80px]"
          value={form.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Strategy, source, broker notes, etc."
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
          {initial ? 'Save Changes' : 'Add Holding'}
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
