import { Expense } from '../types';

/**
 * Reconciles a cloud pull against local state.
 *
 * `App.tsx` used to do `if (data.expenses) setExpenses(data.expenses)`. An empty
 * array is truthy, so a pull that returned nothing replaced everything held
 * locally — anything added on this device and not yet pushed was gone.
 *
 * This is the pull-side twin of the push-side bug fixed in f3381be, and it has
 * the same shape: **absence is not proof of deletion.** A row missing from the
 * pull is either deleted upstream or never pushed from here, and the two are
 * indistinguishable from the active rows alone.
 *
 * The tombstones are what tell them apart. `user_expenses` keeps deleted rows
 * flagged rather than removing them, so a row deleted on another device comes
 * back in the pull as a tombstone and can be dropped positively. A row in
 * neither list has genuinely never reached the cloud, and is kept.
 *
 * @param local    what this device currently holds
 * @param cloud    active (non-deleted) rows from the pull
 * @param deleted  ids the cloud has flagged deleted
 */
export const mergePulledExpenses = (
  local: Expense[],
  cloud: Expense[],
  deleted: string[] = []
): Expense[] => {
  const cloudIds = new Set(cloud.map(e => e.id));
  const tombstoned = new Set(deleted);

  // A tombstone is authoritative wherever it appears. The two lists should never
  // disagree, but if they do, honouring the delete is the safer reading — the
  // alternative resurrects a row the user removed.
  const alive = cloud.filter(e => !tombstoned.has(e.id));

  // Local rows the cloud has never heard of. Deliberately keeps rows the cloud
  // does not know about at all, and drops the ones it has positively tombstoned.
  const unpushed = local.filter(e => !cloudIds.has(e.id) && !tombstoned.has(e.id));

  return [...alive, ...unpushed].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
};
