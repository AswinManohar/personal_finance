import { useEffect, useState } from 'react';
import { localYmd } from '../utils/expenseDate';

/**
 * The clock the period window and the week buckets are computed against.
 *
 * Reading `new Date()` inside a useMemo froze it: a phone left on this tab
 * across midnight kept yesterday's 7D/30D window and yesterday's "this week"
 * bucket until an expense changed. Re-read when the tab comes back to the
 * foreground and once a minute, but only publish a new value when the
 * calendar day has actually moved, so nothing re-renders for no reason.
 */
export const useToday = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(prev => (localYmd(prev) === localYmd(new Date()) ? prev : new Date()));
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refresh, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVisible); clearInterval(timer); };
  }, []);
  return now;
};
