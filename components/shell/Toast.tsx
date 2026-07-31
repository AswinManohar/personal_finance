import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Transient confirmation, per the prototype: centred, just above the bottom bar.
 *
 * Replaces the `alert()` calls scattered through the screens, which block the
 * thread and look nothing like the app.
 */
export const Toast: React.FC<{ message: string | null }> = ({ message }) => {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-[90%] px-5 py-2.5 rounded-xl
        bg-surface-container-highest text-on-surface text-caption font-semibold text-center
        shadow-[0_4px_16px_rgba(0,0,0,0.4)] animate-toast-in"
    >
      {message}
    </div>
  );
};

/**
 * Owns the message and its dismissal timer.
 *
 * The timer is cleared on both re-toast and unmount so a message can never
 * outlive the screen that raised it, or be cut short by an earlier one.
 */
export const useToast = () => {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { message, toast };
};
