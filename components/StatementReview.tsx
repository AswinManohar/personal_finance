import React, { useState } from 'react';
import { FileScan, ShieldCheck, Plus, AlertTriangle } from 'lucide-react';
import {
  reviewStatement, importTransaction, ReviewReport, StatementTransaction,
} from '../services/statementReview';

interface StatementReviewProps {
  onImported: () => void;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export const StatementReview: React.FC<StatementReviewProps> = ({ onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [redact, setRedact] = useState(true);
  const [statementType, setStatementType] = useState<'bank' | 'credit_card'>('bank');
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());

  const txKey = (tx: StatementTransaction) => `${tx.date}|${tx.description}|${tx.amount}`;

  const runReview = async () => {
    if (!file) return;
    setBusy(true); setError(null); setReport(null);
    try {
      setReport(await reviewStatement(file, redact, statementType));
    } catch (e: any) {
      setError(e.message || 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (tx: StatementTransaction) => {
    await importTransaction(tx);
    setImportedKeys(prev => new Set(prev).add(txKey(tx)));
    onImported();
  };

  const sortedFlags = report
    ? [...report.flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  return (
    <section className="bg-surface-container-low p-6 rounded-xl flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-on-surface flex items-center gap-2">
        <FileScan size={20} /> Review statement
      </h2>

      <label htmlFor="statement-pdf" className="text-sm text-on-surface-variant">
        Statement PDF
      </label>
      <input
        id="statement-pdf"
        type="file"
        accept="application/pdf"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
        className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-3 text-on-surface"
      />

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
          <input type="checkbox" checked={redact} onChange={e => setRedact(e.target.checked)} />
          <ShieldCheck size={16} /> Redact personal data before sending
        </label>
        <select
          value={statementType}
          onChange={e => setStatementType(e.target.value as 'bank' | 'credit_card')}
          className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg p-2 text-on-surface"
        >
          <option value="bank">Bank statement</option>
          <option value="credit_card">Credit card</option>
        </select>
      </div>

      <button
        onClick={runReview}
        disabled={!file || busy}
        className="bg-primary text-on-primary rounded-lg py-3 px-4 font-semibold disabled:opacity-40"
      >
        {busy ? 'Reviewing…' : 'Review statement'}
      </button>

      {error && (
        <p className="text-[#F26B6B] text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </p>
      )}

      {report && (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="font-semibold text-on-surface mb-2">
              Flagged spend · {report.totals.flagged_spend.toFixed(2)} of{' '}
              {report.totals.statement_spend.toFixed(2)}
            </h3>
            {sortedFlags.length === 0 && (
              <p className="text-sm text-on-surface-variant">Nothing looked avoidable. Nice.</p>
            )}
            {sortedFlags.map((f, i) => (
              <div key={i} className="py-2 border-b border-outline-variant/20 text-sm">
                <span className="font-medium text-on-surface">
                  {f.transaction.description} · {f.transaction.amount.toFixed(2)}
                </span>{' '}
                <span className="uppercase text-xs text-on-surface-variant">{f.severity}</span>
                <p className="text-on-surface-variant">{f.reason}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-semibold text-on-surface mb-2">Missing in app</h3>
            {report.crosscheck.missing_in_app.length === 0 && (
              <p className="text-sm text-on-surface-variant">Everything on the statement is tracked.</p>
            )}
            {report.crosscheck.missing_in_app.map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-outline-variant/20 text-sm">
                <span className="text-on-surface">
                  {tx.date} · {tx.description} · {tx.amount.toFixed(2)}
                </span>
                {importedKeys.has(txKey(tx)) ? (
                  <span className="text-[#3DD68C] text-xs">Added</span>
                ) : (
                  <button
                    onClick={() => handleImport(tx)}
                    className="flex items-center gap-1 text-primary text-xs font-semibold"
                  >
                    <Plus size={14} /> Add to expenses
                  </button>
                )}
              </div>
            ))}
            {report.crosscheck.amount_mismatch.length > 0 && (
              <div className="mt-2 text-sm text-on-surface-variant">
                {report.crosscheck.amount_mismatch.map((m, i) => (
                  <p key={i}>
                    Amount differs for {m.statement_tx.description}: statement{' '}
                    {m.statement_tx.amount.toFixed(2)} vs app entry (Δ {m.delta.toFixed(2)})
                  </p>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-on-surface-variant">
            Redacted before upload:{' '}
            {Object.entries(report.redaction_preview.masked_counts)
              .map(([k, v]) => `${k}×${v}`)
              .join(', ') || 'nothing (redaction off)'}
          </p>
        </div>
      )}
    </section>
  );
};
