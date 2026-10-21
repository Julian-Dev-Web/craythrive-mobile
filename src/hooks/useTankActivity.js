import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchTankActivity } from '../services/tankActivityService';

let sequence = 0;
export default function useTankActivity(tankId, date = '', limit = 100) {
  const [state, setState] = useState({ loading: true });
  const refreshRef = useRef(() => {}), refresh = useCallback(() => refreshRef.current(), []);
  const identity = JSON.stringify([tankId, date, limit]);
  useEffect(() => {
    let disposed = false, busy = false, queued = false, channel;
    let active = !AppState?.currentState || AppState.currentState === 'active';
    setState({ identity, loading: true });
    async function read() {
      if (disposed || !active || !tankId) return;
      if (busy) { queued = true; return; }
      busy = true; setState(current => ({ ...current, loading: true }));
      try {
        const data = await fetchTankActivity({ tankId, date, limit });
        if (disposed) return;
        setState({ identity, loading: false, data });
        if (!channel) {
          channel = supabase.channel(`tank-activity-${++sequence}`);
          for (const table of ['alerts','ammonia_readings']) channel.on('postgres_changes', {
            event: '*', schema: 'public', table, filter: `user_id=eq.${data.userId}`,
          }, payload => { const changed = payload?.new?.tank_id || payload?.old?.tank_id;
            if (!changed || String(changed) === String(tankId)) void read(); });
          channel.subscribe();
        }
      } catch (error) {
        if (!disposed) setState(current => ({ ...(['AUTH_REQUIRED','42501'].includes(error.code) ? {} : current), identity, loading: false,
          error: 'Could not refresh activity history. Check your connection/sign-in and retry.' }));
      } finally { busy = false; if (queued && !disposed) { queued = false; void read(); } }
    }
    refreshRef.current = read; void read();
    const timer = setInterval(read, 60000), subscription = AppState?.addEventListener?.('change', next => {
      active = next === 'active'; if (active) void read();
    });
    return () => { disposed = true; refreshRef.current = () => {}; clearInterval(timer); subscription?.remove(); if (channel) supabase.removeChannel(channel); };
  }, [identity, tankId, date, limit]);
  return { ...(state.identity === identity ? state : { loading: true }), refresh };
}
