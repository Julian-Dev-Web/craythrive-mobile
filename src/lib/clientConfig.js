import { decode } from 'base-64';

// Configuration shipped in the APK must be safe for an unauthenticated public client.
export function validatePublicSupabaseConfig(url, key) {
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new Error('Missing or invalid public Supabase URL.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
    throw new Error('Supabase must use an HTTPS endpoint without URL credentials.');
  }
  if (typeof key !== 'string' || !key) throw new Error('Missing public Supabase key.');
  if (key.startsWith('sb_publishable_') && key.length > 20) return;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    if (key.split('.').length === 3 && JSON.parse(decode(padded)).role === 'anon') return;
  } catch { /* Never include a supplied key in an exception or log. */ }
  throw new Error('Only a Supabase publishable or legacy anon key may be used by the mobile app.');
}
