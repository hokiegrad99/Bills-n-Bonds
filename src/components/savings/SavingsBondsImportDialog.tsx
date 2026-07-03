import { useState } from 'react';
import { Download, Upload, ClipboardCopy } from 'lucide-react';
import { Modal } from '../ui/Modal';
import {
  SAVINGS_BOND_COLUMNS,
  SAVINGS_BOND_SAMPLE_CSV,
  parseSavingsBondsCSV,
} from '../../lib/csv-savings';

interface SavingsBondsImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ReturnType<typeof parseSavingsBondsCSV>['rows']) => number;
}

export function SavingsBondsImportDialog({ open, onClose, onImport }: SavingsBondsImportDialogProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof parseSavingsBondsCSV> | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setText(value);
      setResult(parseSavingsBondsCSV(value));
    };
    reader.readAsText(file);
  }

  function handleCommit() {
    if (!result?.rows.length) return;
    const added = onImport(result.rows);
    setText('');
    setResult(null);
    onClose();
    void added;
  }

  return (
    <Modal open={open} onClose={onClose} title="Import Savings Bonds from CSV" size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card p-3 text-sm">
            <div className="label-eyebrow">Expected columns</div>
            <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
              {SAVINGS_BOND_COLUMNS.map((c) => (
                <li key={c.header} className="font-mono">{c.header}</li>
              ))}
            </ul>
          </div>
          <div className="card p-3 text-sm">
            <div className="label-eyebrow">Sample CSV</div>
            <pre className="mt-2 max-h-32 overflow-auto text-[11px] font-mono leading-snug whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {SAVINGS_BOND_SAMPLE_CSV}
            </pre>
            <div className="mt-2 flex items-center gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(SAVINGS_BOND_SAMPLE_CSV);
                }}
              >
                <ClipboardCopy size={12} /> Copy sample
              </button>
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  const blob = new Blob([SAVINGS_BOND_SAMPLE_CSV], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'bnb-savings-bonds-sample.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={12} /> Download sample
              </button>
            </div>
          </div>
        </div>

        <label
          className={
            'block border-2 border-dashed rounded-md p-4 text-center text-sm cursor-pointer ' +
            (dragOver
              ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-900/20'
              : 'border-slate-300 dark:border-slate-700')
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <Upload className="inline mr-2" size={14} />
          Drop CSV here or click to browse
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>

        <details>
          <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
            Or paste CSV text below
          </summary>
          <textarea
            className="input min-h-[140px] font-mono text-[11px] mt-2"
            placeholder="Paste CSV here..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) setResult(parseSavingsBondsCSV(e.target.value));
              else setResult(null);
            }}
          />
        </details>

        {result && (
          <div className="card p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <strong>{result.rows.length}</strong> savings bond{result.rows.length === 1 ? '' : 's'} ready to import.
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {result.errors.length} error(s)
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto text-[11px] font-mono whitespace-pre-wrap text-rose-700 dark:text-rose-300">
                {result.errors.map((e, i) => (
                  <div key={i}>
                    Row {e.row}: {e.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!result?.rows.length}
            onClick={handleCommit}
          >
            Import {result?.rows.length ?? 0} savings bond{result?.rows.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
