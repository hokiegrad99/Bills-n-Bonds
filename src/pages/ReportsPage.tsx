import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useHoldings } from '../lib/storage';
import type { Holding, SecurityType } from '../lib/types';
import { SECURITY_TYPES } from '../lib/types';
import { Card } from '../components/ui/Card';
import { ToggleRow } from '../components/ui/ToggleRow';
import { cn } from '../lib/cn';
import { exportStandardPDF, exportTaxSummaryPDF } from '../lib/pdf';
import { holdingsToCSV } from '../lib/csv';
import { effectiveStatus } from '../lib/calc';
import { TypeBadge } from '../components/ui/TypeBadge';
import { fmtUSD } from '../lib/format';

interface FilterState {
  status: Holding['status'] | 'all';
  types: Set<SecurityType>;
  institution: string;
  taxYear: number | 'all';
}

const blankFilter: FilterState = {
  status: 'all',
  types: new Set<SecurityType>(),
  institution: '',
  taxYear: new Date().getFullYear(),
};

export function ReportsPage() {
  const { holdings } = useHoldings();
  const [mode, setMode] = useState<'standard' | 'tax'>('standard');
  const [filter, setFilter] = useState<FilterState>(blankFilter);

  const filtered = useMemo(() => {
    return holdings.filter((h) => {
      if (filter.status !== 'all' && h.status !== filter.status && effectiveStatus(h) !== filter.status)
        return false;
      if (filter.types.size > 0 && !filter.types.has(h.securityType)) return false;
      if (filter.institution && !h.institution.toLowerCase().includes(filter.institution.toLowerCase()))
        return false;
      if (filter.taxYear !== 'all' && h.taxYear !== filter.taxYear) return false;
      return true;
    });
  }, [holdings, filter]);

  const taxFiltered = useMemo(() => {
    return holdings.filter((h) => filter.taxYear === 'all' ? false : h.taxYear === filter.taxYear);
  }, [holdings, filter.taxYear]);

  function exportCSV() {
    const csv = holdingsToCSV(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bnb-report-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    if (mode === 'standard') {
      // Coerce to the PDF ReportFilter shape.
      const reportFilter = {
        status: filter.status === 'all' ? undefined : filter.status,
        securityTypes: filter.types.size ? Array.from(filter.types) : undefined,
        institution: filter.institution || undefined,
        taxYear: filter.taxYear === 'all' ? undefined : filter.taxYear,
      };
      exportStandardPDF({
        holdings: filtered,
        filter: reportFilter,
        meta: {
          Status: filter.status,
          Types: filter.types.size ? Array.from(filter.types).join(', ') : 'All',
          Institution: filter.institution || 'Any',
          TaxYear: filter.taxYear === 'all' ? 'All' : String(filter.taxYear),
        },
      });
    } else {
      const taxYear = filter.taxYear === 'all' ? new Date().getFullYear() : filter.taxYear;
      exportTaxSummaryPDF({ holdings: taxFiltered, taxYear });
    }
  }

  return (
    <div className="space-y-6">
      <Card accent="brand" eyebrow="Reports" title="Export & Schedule">
        <div className="flex items-center gap-2 mb-4">
          <button
            className={cn('pill-tab', mode === 'standard' && 'pill-tab-active')}
            onClick={() => setMode('standard')}
          >
            <FileText size={14} /> Standard
          </button>
          <button
            className={cn('pill-tab', mode === 'tax' && 'pill-tab-active')}
            onClick={() => setMode('tax')}
          >
            <FileSpreadsheet size={14} /> Tax Summary
          </button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
          {mode === 'standard' && (
            <>
              <Field label="Status">
                <select
                  className="select"
                  value={filter.status}
                  onChange={(e) => setFilter({ ...filter, status: e.target.value as any })}
                >
                  <option value="all">All</option>
                  <option>Active</option>
                  <option>Matured</option>
                  <option>Pending</option>
                  <option>Sold</option>
                </select>
              </Field>
              <Field label="Institution contains">
                <input
                  className="input"
                  placeholder="e.g. TreasuryDirect"
                  value={filter.institution}
                  onChange={(e) => setFilter({ ...filter, institution: e.target.value })}
                />
              </Field>
              <Field label="Tax Year">
                <select
                  className="select"
                  value={filter.taxYear}
                  onChange={(e) =>
                    setFilter({ ...filter, taxYear: e.target.value === 'all' ? 'all' : Number(e.target.value) })
                  }
                >
                  <option value="all">All years</option>
                  {uniqueTaxYears(holdings).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Security Types">
                <div className="flex flex-wrap gap-1">
                  {SECURITY_TYPES.map((t) => {
                    const active = filter.types.has(t);
                    return (
                      <button
                        key={t}
                        className={cn('pill-tab', active && 'pill-tab-active')}
                        onClick={() => {
                          const next = new Set(filter.types);
                          if (active) next.delete(t); else next.add(t);
                          setFilter({ ...filter, types: next });
                        }}
                      >
                        <TypeBadge type={t} showLabel={false} />
                        {t}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}

          {mode === 'tax' && (
            <>
              <Field label="Tax Year">
                <select
                  className="select"
                  value={filter.taxYear}
                  onChange={(e) =>
                    setFilter({ ...filter, taxYear: e.target.value === 'all' ? 'all' : Number(e.target.value) })
                  }
                >
                  <option value="all">All years</option>
                  {uniqueTaxYears(holdings).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Total Interest">
                <div className="card p-3 bg-slate-50 dark:bg-slate-800/40">
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmtUSD(taxFiltered.reduce((s, h) => s + h.interestEarned, 0), { cents: true })}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Across {taxFiltered.length} holdings tied to this year.
                  </div>
                </div>
              </Field>
              <Field label="State-Tax-Exempt portion">
                <div className="card p-3 bg-slate-50 dark:bg-slate-800/40">
                  <div className="text-2xl font-semibold tabular-nums text-accent-700 dark:text-accent-300">
                    {fmtUSD(
                      taxFiltered.filter((h) => h.stateTaxExempt).reduce((s, h) => s + h.interestEarned, 0),
                      { cents: true },
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Mostly Treasuries. CDs may not qualify.
                  </div>
                </div>
              </Field>
              <Field label="Notes">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Use this summary alongside official 1099-INT. Adjust your taxYear filter to scope or expand.
                </div>
              </Field>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 justify-end">
          <button className="btn-secondary" onClick={() => setFilter(blankFilter)}>
            Reset filters
          </button>
          <ToggleRow
            label="Show only active holdings"
            description="Off = include matured, sold and pending holdings"
            checked={filter.status === 'Active'}
            onChange={(v) => setFilter({ ...filter, status: v ? 'Active' : 'all' })}
          />
          <button className="btn-secondary" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn-primary" onClick={exportPDF}>
            <Printer size={14} /> Export PDF
          </button>
        </div>
      </Card>

      {/* Preview */}
      <Card accent="accent" eyebrow="Preview" title={`${mode === 'tax' ? taxFiltered.length : filtered.length} rows included`} bodyClassName="p-0">
        <div className="overflow-x-auto max-h-[480px]">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Institution</th>
                <th>Purchased</th>
                <th>Matures</th>
                <th className="text-right">Face</th>
                <th className="text-right">Interest</th>
                <th>State-Exempt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(mode === 'tax' ? taxFiltered : filtered).map((h) => (
                <tr key={h.id}>
                  <td><TypeBadge type={h.securityType} /></td>
                  <td>{h.institution}</td>
                  <td className="tabular-nums">{h.purchaseDate}</td>
                  <td className="tabular-nums">{h.maturityDate}</td>
                  <td className="text-right tabular-nums">{fmtUSD(h.faceValue)}</td>
                  <td className="text-right tabular-nums">{fmtUSD(h.interestEarned, { cents: true })}</td>
                  <td>{h.stateTaxExempt ? 'Yes' : 'No'}</td>
                  <td>{effectiveStatus(h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        Documents are generated entirely in your browser using jsPDF — no
        data is uploaded. Verify against official statements before filing.
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</div>
      {children}
    </div>
  );
}

function uniqueTaxYears(holdings: Holding[]): number[] {
  const set = new Set<number>([new Date().getFullYear()]);
  for (const h of holdings) set.add(h.taxYear);
  return Array.from(set).sort((a, b) => b - a);
}
