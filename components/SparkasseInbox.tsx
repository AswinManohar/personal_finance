import React, { useCallback, useEffect, useState } from 'react';
import { Expense } from '../types';
import { isAddable } from '../utils/sparkasseEmail';
import { authorize, isAuthorized } from '../services/gmailAuth';
import {
  pollSparkasse,
  readSparkassePending,
  readSparkasseStatus,
  resolveSparkasseItem,
  type SparkasseItem,
  type SparkasseStatus,
} from '../services/sparkasseCapture';
import { SparkasseReview } from './SparkasseReview';
import { Card, GhostButton, ListRow, Pill, SectionLabel } from './ui';

/**
 * Pending Sparkasse captures, at the top of the Expenses tab.
 *
 * A sibling of AdvanziaInbox, not a replacement — the two capture paths are
 * fully parallel and share no code. Like it, this renders NOTHING when there is
 * nothing waiting and capture is healthy, so the tab is unchanged for anyone not
 * using it.
 *
 * The failure mode worth designing for is silence: an empty inbox looks exactly
 * like a broken poller. Hence "zuletzt geprüft" as evidence the thing is alive,
 * and a loud warning when Kontowecker mail arrives that no longer matches the
 * expected wording.
 */

const relativeTime = (epochMs: number): string => {
  const minutes = Math.floor((Date.now() - epochMs) / 60000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  return `vor ${Math.floor(hours / 24)} d`;
};

const amountLabel = (item: SparkasseItem): string =>
  item.line.amount === null
    ? '—'
    : `${item.line.kind === 'incoming' ? '+' : '−'}${item.line.amount.toFixed(2)} €`;

export const SparkasseInbox: React.FC<{
  onAddExpense: (expense: Expense) => Promise<void>;
}> = ({ onAddExpense }) => {
  const [pending, setPending] = useState<SparkasseItem[]>(() => readSparkassePending());
  const [status, setStatus] = useState<SparkasseStatus>(() => readSparkasseStatus());
  const [reviewing, setReviewing] = useState<SparkasseItem | null>(null);

  const refresh = useCallback(async () => {
    const authorized = await isAuthorized();
    if (authorized) await pollSparkasse();
    setPending(readSparkassePending());
    setStatus({ ...readSparkasseStatus(), authorized });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = async () => {
    if (await authorize()) await refresh();
  };

  const dismiss = (key: string) => {
    setPending(resolveSparkasseItem(key));
    setReviewing(null);
  };

  const confirm = async (item: SparkasseItem, expense: Expense) => {
    await onAddExpense(expense);
    setPending(resolveSparkasseItem(item.key));
    setReviewing(null);
  };

  const needsAttention = !status.authorized || status.lastSuspiciousAt > 0;
  if (pending.length === 0 && !needsAttention) return null;

  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Sparkasse</SectionLabel>
          {status.lastPolledAt > 0 && (
            <span className="text-label text-secondary opacity-70">
              zuletzt geprüft {relativeTime(status.lastPolledAt)}
            </span>
          )}
        </div>

        {!status.authorized && (
          <GhostButton onClick={connect} className="text-left justify-start h-auto whitespace-normal">
            Gmail verbinden, um Umsätze automatisch zu erfassen.
          </GhostButton>
        )}

        {status.lastSuspiciousAt > 0 && (
          <div className="p-3 rounded-field bg-surface-container-highest/30">
            <span className="text-label text-negative">
              Eine Kontowecker-Mail wurde nicht gelesen — der Wortlaut hat sich
              möglicherweise geändert.
            </span>
          </div>
        )}

        <div className="flex flex-col">
          {pending.map((item, i) => (
            <ListRow key={item.key} divider={i < pending.length - 1} className="min-h-14 py-2">
              <button
                type="button"
                onClick={() => setReviewing(item)}
                className="flex flex-col gap-1 min-w-0 flex-1 text-left bg-transparent border-0 cursor-pointer p-0"
              >
                <span className="text-body font-medium truncate">{item.line.counterparty}</span>
                <span className="flex gap-1 flex-wrap items-center">
                  <Pill tone="neutral">{relativeTime(item.postedAt)}</Pill>
                  {item.line.kind === 'incoming' && <Pill tone="tertiary">Geldeingang</Pill>}
                  {item.line.kind === 'settlement' && <Pill tone="tertiary">Kartenabrechnung</Pill>}
                  {item.line.kind === 'flagged' && <Pill tone="negative">bitte prüfen</Pill>}
                  {!isAddable(item.line.kind) && <Pill tone="neutral">keine Ausgabe</Pill>}
                </span>
              </button>
              <span className="text-body font-bold tabular-nums flex-none">
                {amountLabel(item)}
              </span>
            </ListRow>
          ))}
        </div>
      </Card>

      {reviewing && (
        <SparkasseReview
          item={reviewing}
          onCancel={() => setReviewing(null)}
          onDismiss={() => dismiss(reviewing.key)}
          onConfirm={expense => confirm(reviewing, expense)}
        />
      )}
    </>
  );
};
