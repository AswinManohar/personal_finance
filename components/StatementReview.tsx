import React, { useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import {
  Card, ChipGroup, EmptyState, FieldLabel, ListRow, Pill, PrimaryButton, ProgressBar,
  SectionLabel, ToggleButton,
} from './ui';
import {
  reviewStatement, importTransaction, ReviewReport, StatementTransaction,
} from '../services/statementReview';
import { Expense } from '../types';

interface StatementReviewProps {
  onImported: (expense: Expense) => void;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export const StatementReview: React.FC<StatementReviewProps> = ({ onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [redact, setRedact] = useState(true);
  const [statementType, setStatementType] = useState<'bank' | 'credit_card'>('bank');
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedIdx, setImportedIdx] = useState<Set<number>>(new Set());

  const runReview = async () => {
    if (!file) return;
    setBusy(true); setError(null); setReport(null); setImportedIdx(new Set());
    try {
      setReport(await reviewStatement(file, redact, statementType));
    } catch (e: any) {
      setError(e.message || 'Review failed');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (tx: StatementTransaction, i: number) => {
    try {
      const created = await importTransaction(tx);
      setError(null);
      setImportedIdx(prev => new Set(prev).add(i));
      onImported(created);
    } catch (e: any) {
      setError(`Import failed: ${e.message || 'unknown error'}`);
    }
  };

  const sortedFlags = report
    ? [...report.flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    : [];

  const SEVERITY_TONE = { high: 'negative', medium: 'tertiary', low: 'primary' } as const;

  const redactSummary =
    Object.entries(report?.redaction_preview.masked_counts ?? {})
      .map(([k, v]) => `${k}×${v}`)
      .join(', ') || 'nothing (redaction off)';

  const coverage = report?.totals.coverage_pct ?? 0;

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      {/* ── Upload ── */}
      <Card>
        <SectionLabel className="mb-4">Review a Statement</SectionLabel>

        <label
          htmlFor="statement-pdf"
          className="flex flex-col items-center justify-center gap-2 h-28 mb-4 box-border rounded-field
            border border-dashed border-primary/35 bg-surface-container-lowest cursor-pointer
            hover:border-primary/60 transition-colors"
        >
          <span className="material-symbols-outlined text-primary" aria-hidden="true" style={{ fontSize: 24 }}>
            upload_file
          </span>
          <span className="text-body font-semibold max-w-[90%] truncate">
            {file ? file.name : 'Tap to choose a PDF'}
          </span>
          <span className="text-label text-outline">PDF only</span>
        </label>
        {/* The visible label is the dropzone, whose text becomes the chosen
            filename — so the input carries its own stable accessible name. */}
        <input
          id="statement-pdf"
          type="file"
          accept="application/pdf"
          aria-label="Statement PDF"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />

        <div className="flex justify-between items-center gap-2 mb-4">
          <ChipGroup
            aria-label="Statement type"
            value={statementType}
            onChange={setStatementType}
            options={[
              { value: 'bank' as const, label: 'Bank' },
              { value: 'credit_card' as const, label: 'Card' },
            ]}
          />
          <ToggleButton
            on={redact}
            size="sm"
            accent="positive"
            icon="shield"
            onClick={() => setRedact(!redact)}
          >
            {redact ? 'Redacting' : 'Redact off'}
          </ToggleButton>
        </div>

        <PrimaryButton onClick={runReview} disabled={!file || busy}>
          {busy ? 'Reviewing…' : 'Review statement'}
        </PrimaryButton>

        <p className="mt-3 text-micro text-outline italic text-center">
          Personal data is masked on-device before analysis.
        </p>

        {error && (
          <p className="mt-3 flex items-center gap-2 text-body text-negative">
            <AlertTriangle size={16} /> {error}
          </p>
        )}
      </Card>

      {report && (
        <>
          {/* ── Flagged spend ── */}
          <Card>
            <div className="flex justify-between items-center mb-4">
              <SectionLabel>Flagged Spend</SectionLabel>
              <Pill tone="negative">{sortedFlags.length} flags</Pill>
            </div>
            <div className="mb-2">
              <span className="text-num font-extrabold text-hero tabular-nums">
                {report.totals.flagged_spend.toFixed(2)}
              </span>{' '}
              <span className="text-body text-outline">
                of {report.totals.statement_spend.toFixed(2)} statement spend
              </span>
            </div>
            {sortedFlags.length === 0 ? (
              <EmptyState icon="check_circle">Nothing looked avoidable. Nice.</EmptyState>
            ) : (
              <div className="flex flex-col">
                {sortedFlags.map((f, i) => (
                  <div
                    key={i}
                    className={`py-3 ${i < sortedFlags.length - 1 ? 'border-b border-outline-variant/12' : ''}`}
                  >
                    <div className="flex justify-between items-center gap-2 mb-1">
                      <span className="text-body font-semibold truncate">
                        {f.transaction.description}
                      </span>
                      <span className="text-body font-bold tabular-nums flex-none">
                        {f.transaction.amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Pill tone={SEVERITY_TONE[f.severity]}>{f.severity}</Pill>
                      <span className="flex-1 text-label leading-relaxed text-secondary">
                        {f.reason}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Missing in app ── */}
          <Card>
            <SectionLabel className="mb-4">Missing in app</SectionLabel>
            {report.crosscheck.missing_in_app.length === 0 ? (
              <EmptyState icon="task_alt">Everything on the statement is tracked.</EmptyState>
            ) : (
              <div className="flex flex-col">
                {report.crosscheck.missing_in_app.map((tx, i, arr) => (
                  <ListRow key={i} divider={i < arr.length - 1} className="min-h-14 py-2">
                    <span className="min-w-0">
                      <span className="block text-body font-semibold truncate">{tx.description}</span>
                      <span className="block mt-0.5 text-label text-outline">
                        {tx.date} · {tx.category ?? 'Other'}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 flex-none">
                      <span className="text-body font-bold tabular-nums">{tx.amount.toFixed(2)}</span>
                      {importedIdx.has(i) ? (
                        <span className="text-label font-bold text-positive">Added</span>
                      ) : (
                        <button
                          onClick={() => handleImport(tx, i)}
                          className="h-8 px-3 rounded-lg border-0 bg-primary/10 text-primary text-label font-bold
                            cursor-pointer hover:bg-primary/20 transition-colors inline-flex items-center gap-1"
                        >
                          <Plus size={12} /> Add to expenses
                        </button>
                      )}
                    </span>
                  </ListRow>
                ))}
              </div>
            )}

            {report.crosscheck.amount_mismatch.length > 0 && (
              <div className="mt-3 p-3 rounded-field bg-tertiary/10">
                <FieldLabel className="!text-tertiary mb-1">Amount mismatch</FieldLabel>
                {report.crosscheck.amount_mismatch.map((m, i) => (
                  <p key={i} className="text-label leading-relaxed text-secondary">
                    Amount differs for {m.statement_tx.description}: statement{' '}
                    {m.statement_tx.amount.toFixed(2)} vs app entry (Δ {m.delta.toFixed(2)})
                  </p>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-outline-variant/12">
              <div className="flex justify-between mb-2">
                <FieldLabel>Coverage</FieldLabel>
                <span className="text-label font-bold text-primary tabular-nums">
                  {coverage.toFixed(0)}%
                </span>
              </div>
              <ProgressBar percent={coverage} />
              <p className="mt-3 text-micro text-outline italic">
                Redacted before upload: {redactSummary}
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
