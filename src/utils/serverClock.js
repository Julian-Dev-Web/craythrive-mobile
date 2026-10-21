import { supabase } from '../lib/supabase';
import { parseTimestamp } from './philippineTime';

let anchor = null;
const monotonicNow = () => {
  const tick = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : null;
  return Number.isFinite(tick) ? tick : null;
};

// No Date.now fallback: a manually adjusted phone/laptop clock is not authority.
export async function fetchServerTime(client = supabase) {
  const { data, error } = await client.rpc('craythrive_server_time');
  if (error) throw error;
  const date = parseTimestamp(data);
  if (!date) throw new Error('Could not verify server time. Please refresh and try again.');
  anchor = { epoch: date.getTime(), monotonic: monotonicNow() };
  return date.toISOString();
}
export function getServerNow() {
  if (!anchor) return null;
  const tick = monotonicNow();
  if (tick === null || anchor.monotonic === null || tick < anchor.monotonic) return null;
  return new Date(anchor.epoch + tick - anchor.monotonic);
}
