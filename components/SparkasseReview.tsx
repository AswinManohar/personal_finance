import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { isAddable } from '../utils/sparkasseEmail';
import { recallLocalMerchant, learnMerchant } from '../services/advanziaCapture';
import { newId } from '../utils/id';
import type { SparkasseItem } from '../services/sparkasseCapture';
import { Field, FormError, GhostButton, Input, PrimaryButton, SectionLabel, Select } from './ui';
import { ymdFromEpoch } from '../utils/expenseDate';

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
  const [date, setDate] = useState(ymdFromEpoch(item.postedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addable = isAddable(line.kind);

  const save = async () => {
    // Same parsing as the Advanzia sheet: this UI is German, so a comma decimal
    // separator is the ordinary way to type an amount and `Number` would make
    // NaN of it. Non-finite and non-positive are still refused.
    const value = parseFloat(amount.replace(',', '.'));
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
    <>
      <div aria-hidden="true" className="fixed inset-0 bg-[rgba(13,14,18,0.6)] z-40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={addable ? 'Umsatz prüfen' : 'Nur zur Information'}
        className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card z-50 bg-surface-container rounded-t-sheet px-4 pt-4 pb-6 app-sheet-safe shadow-[0_-8px_32px_rgba(0,0,0,0.4)] max-h-[85%] overflow-y-auto app-scroll flex flex-col gap-3"
      >
        <div className="w-9 h-1 rounded-full bg-outline-variant mx-auto md:hidden" aria-hidden="true" />

        <SectionLabel>{addable ? 'Umsatz prüfen' : 'Nur zur Information'}</SectionLabel>

        {line.kind === 'incoming' && (
          <p className="text-label text-secondary opacity-70">
            Geldeingang — wird nicht als Ausgabe erfasst.
          </p>
        )}
        {line.kind === 'settlement' && (
          <p className="text-label text-secondary opacity-70">
            Abrechnung der Advanzia-Kreditkarte. Die einzelnen Zahlungen wurden bereits
            über die Benachrichtigungen erfasst — nicht noch einmal hinzufügen.
          </p>
        )}
        {line.kind === 'flagged' && line.reason && (
          <p className="text-label text-negative">Bitte prüfen: {line.reason}</p>
        )}
        {item.possibleDuplicateOf && (
          <p className="text-label text-negative">Möglicherweise doppelt.</p>
        )}

        {/* The raw line is always visible — the parser is never the last word. */}
        <p className="text-label text-secondary p-3 rounded-field bg-surface-container-highest/30 whitespace-pre-wrap">
          {line.raw}
        </p>

        {addable && (
          <>
            <Field label="Name" htmlFor="sparkasse-name">
              <Input
                id="sparkasse-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </Field>
            <Field label="Betrag (EUR)" htmlFor="sparkasse-amount">
              <Input
                id="sparkasse-amount"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Kategorie" htmlFor="sparkasse-category">
              <Select
                id="sparkasse-category"
                value={category}
                onChange={e => setCategory(e.target.value as ExpenseCategory)}
              >
                {Object.values(ExpenseCategory).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Datum" htmlFor="sparkasse-date">
              <Input
                id="sparkasse-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </Field>

            <FormError>{error}</FormError>

            {/* Absent, not disabled, for incoming and settlement. */}
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? 'Speichern…' : 'Hinzufügen'}
            </PrimaryButton>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <GhostButton onClick={onCancel}>Abbrechen</GhostButton>
          <GhostButton onClick={onDismiss}>Verwerfen</GhostButton>
        </div>
      </div>
    </>
  );
};
