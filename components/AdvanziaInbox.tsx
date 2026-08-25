import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Expense, ExpenseCategory } from '../types';
import {
  Card, EmptyState, Field, FormError, GhostButton, Input, ListRow, Pill,
  PrimaryButton, SectionLabel, Select, ToggleButton,
} from './ui';
import { newId } from '../utils/id';
import {
  drainPending, getCaptureStatus, guessMerchant, learnMerchant,
  openBatterySettings, openListenerSettings, readPending, recallLocalMerchant,
  requestNotificationPermission, resolvePending,
  type CaptureStatus, type PendingItem,
} from '../services/advanziaCapture';
import { ymdFromEpoch } from '../utils/expenseDate';

/**
 * Captured Advanzia transactions waiting to be confirmed.
 *
 * Everything here is built around one rule: nothing becomes an expense without a
 * human looking at it, and nothing is ever silently dropped. That is why the
 * list carries flags rather than filtering — a capture the parser was unsure
 * about, or one that resembles a recent purchase, is shown *and marked*, never
 * hidden or auto-merged.
 *
 * The failure mode of this whole feature is silence, so the header states when
 * capture last worked and says so loudly when notification access is off.
 */

const flagsFor = (item: PendingItem) => ({
  /** Parser fell through to the loose tier: prefilled, but must be checked. */
  needsChecking: item.parse.kind === 'loose',
  /** Negative marker — a decline or refund. Never convertible to an expense. */
  rejected: item.parse.kind === 'rejected',
  /** Failed the title gate but quoted an amount: capture itself may be broken. */
  suspicious: item.gate === 'suspicious',
  duplicate: item.possibleDuplicateOf !== null,
});

const relativeTime = (epochMs: number): string => {
  const minutes = Math.round((Date.now() - epochMs) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const parsedAmount = (item: PendingItem): number | null =>
  item.parse.kind === 'strict' ? item.parse.amount
    : item.parse.kind === 'loose' ? item.parse.amount
      : null;

const parsedMerchant = (item: PendingItem): string | null =>
  item.parse.kind === 'strict' ? item.parse.merchant
    : item.parse.kind === 'loose' ? item.parse.merchant
      : null;

export const AdvanziaInbox: React.FC<{
  onAddExpense: (expense: Expense) => Promise<void>;
  /**
   * Capture key from a notification tap. Owned by App, not by this component:
   * the deep-link listener has to be registered even when this tab is not
   * mounted, which it usually is not — the app opens on Savings.
   */
  focusKey?: string | null;
  onFocusHandled?: () => void;
}> = ({ onAddExpense, focusKey, onFocusHandled }) => {
  const [pending, setPending] = useState<PendingItem[]>(() => readPending());
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [reviewing, setReviewing] = useState<PendingItem | null>(null);

  const refresh = useCallback(async () => {
    setPending(await drainPending());
    setStatus(await getCaptureStatus());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Notifications arrive while the app is away, so coming back to the
  // foreground is the moment the queue must be drained. Notification access can
  // also be revoked from system settings with no callback, so the status is
  // re-read here too rather than cached from startup.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // A tap arrives while this tab may not even be mounted, so App owns the
  // listener and hands the key down. Opening the sheet still waits for the
  // drain: on a cold start the key is known before the capture it points at has
  // been read out of the native queue.
  useEffect(() => {
    if (!focusKey) return;
    const match = pending.find(p => p.key === focusKey);
    if (match) {
      setReviewing(match);
      onFocusHandled?.();
    }
  }, [focusKey, pending, onFocusHandled]);

  const dismiss = (key: string) => {
    setPending(resolvePending(key));
    setReviewing(null);
  };

  const confirm = async (item: PendingItem, expense: Expense, rawMerchant: string | null) => {
    await onAddExpense(expense);
    // Only a confirmation teaches the map — a guess the user never accepted
    // would otherwise cement itself for every future transaction.
    if (rawMerchant) {
      learnMerchant(rawMerchant, { name: expense.name, category: expense.category });
    }
    setPending(resolvePending(item.key));
    setReviewing(null);
  };

  const captureOff = status !== null && !status.listenerEnabled;
  // Access granted but notifications denied is the quietest broken state of the
  // lot: captures still queue, and every single nudge about them — including the
  // alarm that says capture is broken — is dropped by the OS without a word.
  const notificationsOff = status !== null && status.listenerEnabled && !status.notificationsEnabled;
  const health = useMemo(() => {
    if (!status) return null;
    // A suspicious notification more recent than the last real capture is the
    // signal that Advanzia changed their wording and the title gate is now
    // swallowing transactions.
    if (status.lastSuspiciousAt > status.lastCaptureAt) return 'suspicious';
    return null;
  }, [status]);

  if (pending.length === 0 && !captureOff && !notificationsOff && !health) return null;

  return (
    <>
      <Card>
        <div className="flex justify-between items-center gap-2 mb-2">
          <SectionLabel>Captured</SectionLabel>
          {pending.length > 0 && (
            <span className="text-label font-bold tracking-[.08em] uppercase text-primary">
              {pending.length} to review
            </span>
          )}
        </div>

        {/* Capture failing looks exactly like capture having nothing to do, so
            an empty inbox is only reassuring next to the last time it worked. */}
        {status !== null && status.listenerEnabled && status.lastCaptureAt > 0 && (
          <p className="mb-3 text-label text-secondary opacity-70">
            Last captured {relativeTime(status.lastCaptureAt)}.
          </p>
        )}

        {/* Onboarding lives here rather than on a screen of its own: it appears
            only when something is actually wrong, in the place the captures
            would have shown up. Notification access first — nothing works
            without it — then the permission to tell you about them, then the
            battery exemption, which is only hardening. */}
        {captureOff && (
          <div className="mb-3 p-3 rounded-field bg-surface-container-highest/30 flex flex-col gap-2">
            <span className="text-label text-secondary">
              Notification access is off, so no transactions are being captured.
              Android asks for this in system settings — find Cashflow in the list and turn it on.
            </span>
            <GhostButton onClick={() => void openListenerSettings()}>
              Turn on notification access
            </GhostButton>
            <button
              type="button"
              onClick={() => void openBatterySettings()}
              className="text-label text-secondary opacity-70 underline bg-transparent border-0 cursor-pointer p-0 text-left"
            >
              Also set Cashflow to Unrestricted battery, so capture isn’t killed in the background
            </button>
          </div>
        )}

        {notificationsOff && (
          <div className="mb-3 p-3 rounded-field bg-surface-container-highest/30 flex flex-col gap-2">
            <span className="text-label text-secondary">
              Transactions are being captured, but Cashflow can’t notify you about them —
              they’ll only appear here.
            </span>
            <GhostButton onClick={() => void requestNotificationPermission().then(refresh)}>
              Allow notifications
            </GhostButton>
          </div>
        )}

        {health === 'suspicious' && (
          <div className="mb-3 p-3 rounded-field bg-surface-container-highest/30">
            <span className="text-label text-negative">
              An Advanzia notification looked like a transaction but wasn’t recognised.
              Capture may need updating.
            </span>
          </div>
        )}

        <div className="flex flex-col">
          {pending.length === 0 ? (
            <EmptyState icon="notifications_active">Nothing waiting to be reviewed.</EmptyState>
          ) : (
            pending.map((item, i) => {
              const flags = flagsFor(item);
              const amount = parsedAmount(item);
              const merchant = parsedMerchant(item);
              return (
                <ListRow key={item.key} divider={i < pending.length - 1} className="min-h-14 py-2">
                  <button
                    type="button"
                    onClick={() => setReviewing(item)}
                    className="flex flex-col gap-1 min-w-0 flex-1 text-left bg-transparent border-0 cursor-pointer p-0"
                  >
                    <span className="text-body font-medium truncate">
                      {merchant || item.body}
                    </span>
                    <span className="flex gap-1 flex-wrap">
                      <Pill tone="neutral">{relativeTime(item.postedAt)}</Pill>
                      {flags.rejected && <Pill tone="negative">Not an expense</Pill>}
                      {flags.needsChecking && <Pill tone="tertiary">Needs checking</Pill>}
                      {flags.suspicious && <Pill tone="negative">Unrecognised</Pill>}
                      {flags.duplicate && <Pill tone="tertiary">Possible duplicate</Pill>}
                    </span>
                  </button>
                  <span className="text-body font-bold tabular-nums flex-none">
                    {amount === null ? '—' : `€${amount.toFixed(2)}`}
                  </span>
                </ListRow>
              );
            })
          )}
        </div>
      </Card>

      {reviewing && (
        <ReviewSheet
          item={reviewing}
          onCancel={() => setReviewing(null)}
          onDismiss={() => dismiss(reviewing.key)}
          onConfirm={confirm}
        />
      )}
    </>
  );
};

const ReviewSheet: React.FC<{
  item: PendingItem;
  onCancel: () => void;
  onDismiss: () => void;
  onConfirm: (item: PendingItem, expense: Expense, rawMerchant: string | null) => Promise<void>;
}> = ({ item, onCancel, onDismiss, onConfirm }) => {
  const flags = flagsFor(item);
  const merchant = parsedMerchant(item);
  const amount = parsedAmount(item);

  const [name, setName] = useState(merchant ?? '');
  const [amountText, setAmountText] = useState(amount === null ? '' : amount.toFixed(2));
  const [category, setCategory] = useState<ExpenseCategory>(ExpenseCategory.OTHER);
  const [date, setDate] = useState(ymdFromEpoch(item.postedAt));
  const [isEssential, setIsEssential] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [guessFailed, setGuessFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The learned map answers instantly and offline for any merchant already
  // confirmed once; the LLM is only ever asked about a descriptor never seen
  // before, and its failure costs the prefill, not the capture.
  useEffect(() => {
    if (!merchant || flags.rejected) return;

    const known = recallLocalMerchant(merchant);
    if (known) {
      setName(known.name);
      setCategory(known.category);
      return;
    }

    let cancelled = false;
    setGuessing(true);
    void guessMerchant(merchant).then(guess => {
      if (cancelled) return;
      if (guess) {
        setName(guess.name);
        setCategory(guess.category);
      } else {
        setGuessFailed(true);
      }
      setGuessing(false);
    });
    return () => { cancelled = true; };
  }, [merchant, flags.rejected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const save = async () => {
    const parsedValue = parseFloat(amountText.replace(',', '.'));
    if (!amountText || isNaN(parsedValue) || parsedValue <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!name.trim()) {
      setError('Add a description so you can recognise this later.');
      return;
    }
    setError(null);
    setSaving(true);
    await onConfirm(item, {
      id: newId(),
      name: name.trim(),
      amount: parsedValue,
      category,
      vendor: merchant ?? undefined,
      date,
      isRecurring: false,
      isEssential,
    }, merchant);
    setSaving(false);
  };

  return (
    <>
      <div
        onClick={onCancel}
        aria-hidden="true"
        className="fixed inset-0 bg-[rgba(13,14,18,0.6)] z-40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review captured transaction"
        className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card z-50 bg-surface-container rounded-t-sheet px-4 pt-4 pb-6 app-sheet-safe shadow-[0_-8px_32px_rgba(0,0,0,0.4)] max-h-[85%] overflow-y-auto app-scroll flex flex-col gap-3"
      >
        <div className="w-9 h-1 rounded-full bg-outline-variant mx-auto md:hidden" aria-hidden="true" />

        <div>
          <SectionLabel>Review capture</SectionLabel>
          <p className="mt-1 text-label text-secondary opacity-70">{relativeTime(item.postedAt)}</p>
        </div>

        {/* The raw notification, always. When the parser was unsure this is the
            only trustworthy record of what the bank actually said. */}
        <p className="text-label text-secondary p-3 rounded-field bg-surface-container-highest/30">
          {item.body}
        </p>

        {flags.rejected && (
          <p className="text-label text-negative">
            This looks like a declined or refunded transaction (“{item.parse.kind === 'rejected' ? item.parse.marker : ''}”),
            so it can’t be added as an expense. Dismiss it, or add it manually if that’s wrong.
          </p>
        )}

        {flags.suspicious && (
          <p className="text-label text-negative">
            This didn’t look like a normal transaction notification. Capture may need updating —
            check the wording above.
          </p>
        )}

        {flags.needsChecking && !flags.suspicious && (
          <p className="text-label text-tertiary">
            Unrecognised wording, so these fields were guessed. Check them before saving.
          </p>
        )}

        {flags.duplicate && item.possibleDuplicateOf && (
          <p className="text-label text-tertiary">
            Possible duplicate of {item.possibleDuplicateOf.merchant ?? 'a recent capture'} for
            €{item.possibleDuplicateOf.amount?.toFixed(2)} at{' '}
            {new Date(item.possibleDuplicateOf.postedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.
            Save it anyway if you really bought two.
          </p>
        )}

        {!flags.rejected && (
          <>
            <Input
              type="number"
              inputSize="hero"
              prefix="€"
              aria-label="Amount"
              value={amountText}
              onChange={e => setAmountText(e.target.value)}
              placeholder="0.00"
            />

            <Field label="Category" htmlFor="capture-category">
              <Select
                id="capture-category"
                value={category}
                onChange={e => setCategory(e.target.value as ExpenseCategory)}
              >
                {Object.values(ExpenseCategory).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>

            <Field label="Description" htmlFor="capture-name">
              <Input
                id="capture-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={guessing ? 'Looking up merchant…' : 'e.g. Weekly Groceries'}
              />
            </Field>

            {guessing && (
              <p className="text-label text-secondary opacity-70">Looking up “{merchant}”…</p>
            )}
            {guessFailed && (
              <p className="text-label text-secondary opacity-70">
                Couldn’t look up “{merchant}” — fill it in yourself and it’ll be remembered.
              </p>
            )}

            <Field label="Date" htmlFor="capture-date">
              <Input
                id="capture-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </Field>

            <ToggleButton
              on={isEssential}
              onClick={() => setIsEssential(!isEssential)}
              icon="verified"
              accent="positive"
            >
              {isEssential ? 'Essential' : 'Non-essential'}
            </ToggleButton>

            <FormError>{error}</FormError>

            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Add expense'}
            </PrimaryButton>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <GhostButton onClick={onCancel}>Later</GhostButton>
          <GhostButton onClick={onDismiss}>Dismiss</GhostButton>
        </div>
      </div>
    </>
  );
};
