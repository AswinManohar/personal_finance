import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { isAddable } from '../utils/sparkasseEmail';
import { recallLocalMerchant, learnMerchant } from '../services/advanziaCapture';
import { newId } from '../utils/id';
import type { SparkasseItem } from '../services/sparkasseCapture';

/**
 * Turning a captured Kartenumsatz into an expense.
 *
 * INVARIANT: this is one of exactly two places in the app where a capture
 * becomes money — the other is the ReviewSheet inside AdvanziaInbox.tsx. It is
 * duplicated rather than shared because that one is module-local and not
 * exported, and the Advanzia path is not being modified. If you change a
 * money-handling rule here, check whether the other needs it too.
 *
 * `incoming` and `settlement` items reach this sheet for READING only. They
 * have no save control at all — absent, not disabled — so there is no code path
 * from them to an Expense.
 *
 * No LLM call, unlike the Advanzia sheet. Counterparties here are creditors,
 * standing orders and PEOPLE; the merchant-guess prompt is written for card
 * acquirer descriptors and would confidently turn a person into a business,
 * which structured output cannot catch because the result is well-formed.
 */

const isoDate = (epochMs: number): string => new Date(epochMs).toISOString().split('T')[0];

export const SparkasseReview: React.FC<{
  item: SparkasseItem;
  onCancel: () => void;
  onDismiss: () => void;
  onConfirm: (expense: Expense) => Promise<void>;
}> = ({ item, onCancel, onDismiss, onConfirm }) => {
  const { line } = item;
  const remembered = recallLocalMerchant(line.counterparty);

  const [name, setName] = useState(remembered?.name ?? line.counterparty);
  const [amount, setAmount] = useState(line.amount !== null ? String(line.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory>(
    remembered?.category ?? ExpenseCategory.OTHER,
  );
  const [date, setDate] = useState(isoDate(item.postedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addable = isAddable(line.kind);

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Bitte einen gültigen Betrag eingeben.');
      return;
    }
    setSaving(true);
    setError(null);
    const finalName = name.trim() || line.counterparty;
    try {
      await onConfirm({
        id: newId(),
        name: finalName,
        amount: value,
        category,
        date,
        isRecurring: false,
        // Keep the bank's own string, exactly as the Advanzia path keeps the
        // acquirer descriptor. It is the only audit trail back to the email.
        vendor: line.counterparty,
      });
      learnMerchant(line.counterparty, { name: finalName, category });
    } catch {
      setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/50">
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">
          {addable ? 'Umsatz prüfen' : 'Nur zur Information'}
        </h2>

        {line.kind === 'incoming' && (
          <p className="text-sm text-slate-500 mb-3">
            Geldeingang — wird nicht als Ausgabe erfasst.
          </p>
        )}
        {line.kind === 'settlement' && (
          <p className="text-sm text-slate-500 mb-3">
            Abrechnung der Advanzia-Kreditkarte. Die einzelnen Zahlungen wurden bereits
            über die Benachrichtigungen erfasst — nicht noch einmal hinzufügen.
          </p>
        )}
        {line.kind === 'flagged' && line.reason && (
          <p className="text-sm text-amber-600 dark:text-amber-500 mb-3">
            Bitte prüfen: {line.reason}
          </p>
        )}
        {item.possibleDuplicateOf && (
          <p className="text-sm text-amber-600 dark:text-amber-500 mb-3">
            Möglicherweise doppelt.
          </p>
        )}

        {/* The raw line is always visible — the parser is never the last word. */}
        <pre className="text-xs bg-slate-100 dark:bg-slate-800 rounded p-2 mb-4 whitespace-pre-wrap">
          {line.raw}
        </pre>

        {addable && (
          <div className="flex flex-col gap-3">
            <label className="text-sm">
              Name
              <input
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Betrag (EUR)
              <input
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Kategorie
              <select
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                value={category}
                onChange={e => setCategory(e.target.value as ExpenseCategory)}
              >
                {Object.values(ExpenseCategory).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Datum
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1 bg-transparent"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </label>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5">
          <button className="flex-1 py-2 rounded border" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="flex-1 py-2 rounded border" onClick={onDismiss}>
            Verwerfen
          </button>
          {/* Absent, not disabled, for incoming and settlement. */}
          {addable && (
            <button
              className="flex-1 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Speichern…' : 'Hinzufügen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
