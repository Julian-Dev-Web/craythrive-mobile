import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// One navigation auth listener. Supabase owns persistence and refresh retries.
export default function useAuthSession() {
  const [state, setState] = useState(/** @type {{session: import('@supabase/supabase-js').Session | null, authReady: boolean, restoreError: string}} */ (
    { session: null, authReady: false, restoreError: '' }
  ));
  const retryRef = useRef(() => {});
  const retryRestore = useCallback(() => retryRef.current(), []);

  useEffect(() => {
    let disposed = false, revision = 0, pending = false;
    async function restore() {
      if (disposed || pending) return;
      pending = true;
      const requestedRevision = revision;
      setState(current => ({ ...current, restoreError: '' }));
      try {
        const { data, error } = await supabase.auth.getSession();
        if (disposed || revision !== requestedRevision) return;
        if (error) throw error;
        setState({ session: data.session, authReady: true, restoreError: '' });
      } catch (error) {
        if (disposed || revision !== requestedRevision) return;
        // getSession refreshes through the SDK, which removes rejected refresh
        // sessions. Storage failures and network/server failures stay retryable.
        const invalid = isAuthSessionMissingError(error) ||
          (isAuthApiError(error) && [400, 401, 403].includes(error.status));
        if (invalid) setState({ session: null, authReady: true, restoreError: '' });
        else setState(current => ({ ...current,
          restoreError: "We couldn't restore your account. Check your connection and try again." }));
      } finally {
        pending = false;
      }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION can be null when an offline refresh failed. The explicit
      // getSession result owns startup; only confirmed sign-out clears identity.
      if (disposed || event === 'INITIAL_SESSION' || (!session && event !== 'SIGNED_OUT')) return;
      revision++;
      setState({ session, authReady: true, restoreError: '' });
    });
    retryRef.current = restore;
    void restore();
    const app = AppState.addEventListener('change', next => {
      if (next === 'active') void restore();
    });
    return () => {
      disposed = true;
      retryRef.current = () => {};
      subscription.unsubscribe();
      app.remove();
    };
  }, []);

  return { ...state, retryRestore };
}
