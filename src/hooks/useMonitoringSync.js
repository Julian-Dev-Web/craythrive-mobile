import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchLatestMonitoringRows, fetchPairedTankIds, monitoringRequestVersion } from '../utils/sensorMonitoring';
import { fetchTankThresholdSettings } from '../utils/thresholdSettings';
import { fetchServerTime } from '../utils/serverClock';
let sequence = 0;
// Read-only monitoring refresh. Notifications and equipment never run here.
export default function useMonitoringSync(tankIds, onSnapshot, onReset) {
  const idsKey = JSON.stringify([...new Set(tankIds.filter(Boolean).map(String))].sort());
  const callbacks = useRef({
    onSnapshot,
    onReset,
    idsKey
  });
  callbacks.current = {
    onSnapshot,
    onReset,
    idsKey
  };
  const [state, setState] = useState({
    loading: true,
    dataAvailable: false
  });
  const retryRef = useRef(() => {}),
    refresh = useCallback(() => retryRef.current(), []);
  useEffect(() => {
    const ids = JSON.parse(idsKey);
    let disposed = false,
      busy = false,
      queued = false,
      userId = null,
      channel = null,
      epoch = 0;
    let active = !AppState?.currentState || AppState.currentState === 'active';
    setState({
      idsKey,
      loading: !!ids.length,
      dataAvailable: false
    });
    if (!ids.length) return;
    const clearChannel = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
    async function read() {
      if (disposed || !active || !userId) return;
      if (busy) {
        queued = true;
        return;
      }
      busy = true;
      const identity = epoch,
        owner = userId,
        version = monitoringRequestVersion();
      try {
        const [rows, thresholds, paired, serverTime] = await Promise.all([fetchLatestMonitoringRows(owner, ids, {
          version
        }), fetchTankThresholdSettings(owner, ids), fetchPairedTankIds(owner, ids), fetchServerTime().catch(() => null)]);
        if (disposed || epoch !== identity || queued || callbacks.current.idsKey !== idsKey) return;
        const snapshot = {
          ...rows,
          thresholds,
          paired,
          serverTime,
          userId: owner
        };
        // A screen may have completed a newer explicit refresh in the meantime.
        if (callbacks.current.onSnapshot?.(snapshot) === false) return;
        setState({
          idsKey,
          loading: false,
          dataAvailable: true,
          snapshot
        });
      } catch {
        if (!disposed && epoch === identity && callbacks.current.idsKey === idsKey) {
          setState(current => ({
            ...current,
            idsKey,
            loading: false,
            dataAvailable: false,
            error: 'Monitoring refresh unavailable. Displayed saved readings may be out of date; retry when connected.'
          }));
        }
      } finally {
        busy = false;
        if (queued && !disposed) {
          queued = false;
          void read();
        }
      }
    }
    function setOwner(next) {
      if (disposed) return;
      if (userId !== next) {
        const reset = userId !== null;
        epoch++;
        userId = next;
        clearChannel();
        setState({
          idsKey,
          loading: !!next,
          dataAvailable: false
        });
        if (reset) callbacks.current.onReset?.();
      }
      if (!next || !active) return;
      if (!channel) {
        const listeningChannel = supabase.channel(`monitoring-sync-${++sequence}`);
        channel = listeningChannel;
        // These two sources are published in the audited project. Unpublished
        // pairing/settings tables recover through polling and explicit refresh.
        for (const table of ['sensor_readings', 'ammonia_readings']) listeningChannel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${next}`
        }, payload => {
          if (disposed || userId !== next || channel !== listeningChannel || callbacks.current.idsKey !== idsKey) return;
          const changed = payload?.new?.tank_id || payload?.old?.tank_id;
          if (!changed || ids.includes(String(changed))) void read();
        });
        listeningChannel.subscribe(status => {
          if (disposed || userId !== next || channel !== listeningChannel || callbacks.current.idsKey !== idsKey) return;
          if (status === 'SUBSCRIBED') void read(); // also fires after channel reconnect
          else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setState(current => ({
            ...current,
            error: 'Realtime connection interrupted. Saved readings refresh periodically while this screen is active.'
          }));
        });
      }
      void read();
    }
    async function identify() {
      const identity = epoch;
      try {
        const {
          data,
          error
        } = await supabase.auth.getSession();
        if (disposed || epoch !== identity || callbacks.current.idsKey !== idsKey) return;
        if (error) throw error;
        if (!data?.session?.user?.id) {
          setOwner(null);
          callbacks.current.onReset?.();
          setState({
            idsKey,
            loading: false,
            dataAvailable: false,
            error: 'Sign in to refresh monitoring.'
          });
          return;
        }
        setOwner(data.session.user.id);
      } catch {
        if (!disposed && epoch === identity && callbacks.current.idsKey === idsKey) setState(current => ({
          ...current,
          idsKey,
          loading: false,
          dataAvailable: false,
          error: 'Monitoring refresh unavailable. Saved readings may be out of date; retry when connected.'
        }));
      }
    }
    const auth = supabase.auth.onAuthStateChange?.((event, session) => {
      Promise.resolve().then(() => {
        if (disposed || callbacks.current.idsKey !== idsKey || (!session && event !== 'SIGNED_OUT')) return;
        epoch++;
        setOwner(session?.user?.id || null);
        if (event === 'SIGNED_OUT') callbacks.current.onReset?.();
      });
    });
    retryRef.current = () => userId ? read() : identify();
    void identify();
    const timer = setInterval(() => retryRef.current(), 60000);
    const app = AppState?.addEventListener?.('change', next => {
      active = next === 'active';
      if (!active) {
        epoch++;
        clearChannel();
      }
      if (active) void identify();
    });
    return () => {
      disposed = true;
      epoch++;
      retryRef.current = () => {};
      clearInterval(timer);
      app?.remove();
      auth?.data?.subscription?.unsubscribe();
      clearChannel();
    };
  }, [idsKey]);
  return {
    ...(state.idsKey === idsKey ? state : {
      loading: true,
      dataAvailable: false
    }),
    refresh
  };
}
