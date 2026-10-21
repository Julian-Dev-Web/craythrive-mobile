import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchTankThresholdSettings } from '../utils/thresholdSettings';
let channelSequence = 0;

// Threshold reads only. Polling also covers tables without realtime publication.
export default function useThresholdRefresh(tankIds, onThresholds) {
  const idsKey = JSON.stringify([...new Set(tankIds.filter(Boolean).map(String))].sort());
  const callback = useRef(onThresholds);
  useEffect(() => { callback.current = onThresholds; }, [onThresholds]);
  useEffect(() => {
    const ids = JSON.parse(idsKey);
    if (!ids.length) return;
    let disposed = false, busy = false, queued = false, channel, timer, subscription;
    let appState = AppState?.currentState;
    let userId;
    const isActive = () => !appState || appState === 'active';
    async function refresh() {
      if (disposed || !userId || !isActive()) return;
      if (busy) { queued = true; return; }
      busy = true;
      try {
        const thresholds = await fetchTankThresholdSettings(userId, ids);
        if (!disposed) callback.current(thresholds);
      } catch (_error) {
        // Preserve the last successfully loaded values. Retry on next refresh.
        console.log('THRESHOLD REFRESH ERROR:');
      } finally {
        busy = false;
        if (queued) { queued = false; void refresh(); }
      }
    }
    async function start() {
      const { data, error } = await supabase.auth.getUser();
      if (disposed || error || !data?.user?.id) return;
      userId = data.user.id;
      channel = supabase.channel(`threshold-cards-${userId}-${++channelSequence}`);
      for (const table of ['tank_threshold_settings', 'threshold_settings']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, refresh);
      }
      channel.subscribe();
      timer = setInterval(refresh, 60000);
      subscription = AppState?.addEventListener?.('change', next => {
        appState = next;
        if (next === 'active') void refresh();
      });
      await refresh();
    }
    void start().catch(() => { console.log('THRESHOLD REFRESH SETUP ERROR:'); });
    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
      subscription?.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, [idsKey]);
}
