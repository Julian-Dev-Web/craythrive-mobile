import { useCallback, useRef } from 'react';

// Set the lock before calling the action, including before confirmation dialogs.
export default function useSingleFlight(action) {
  const actionRef = useRef(action);
  const pendingRef = useRef(null);
  actionRef.current = action;
  return useCallback((...args) => {
    if (pendingRef.current) return pendingRef.current;
    const pending = Promise.resolve().then(() => actionRef.current(...args));
    pendingRef.current = pending;
    const clear = () => {
      if (pendingRef.current === pending) pendingRef.current = null;
    };
    pending.then(clear, clear);
    return pending;
  }, []);
}
