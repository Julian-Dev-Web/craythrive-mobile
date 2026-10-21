import { supabase } from '../lib/supabase';
import { fetchServerTime } from '../utils/serverClock';
import { manilaDayRange, manilaReportRange } from '../utils/philippineTime';

// Read-only. Legacy automation/command tables have broad policies; never read
// them directly as a fallback for the reviewed owner-checked endpoint.
export async function fetchTankActivity({ tankId, date = '', limit = 100 }, db = supabase) {
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth?.user?.id) throw Object.assign(new Error('Sign in and retry activity history.'), { code: 'AUTH_REQUIRED' });
  const userId = auth.user.id;
  const { data: tank, error: tankError } = await db.from('tanks').select('id,tank_name,user_id')
    .eq('id', tankId).eq('user_id', userId).maybeSingle();
  if (tankError) throw tankError;
  if (!tank || String(tank.user_id) !== String(userId)) throw Object.assign(new Error('This tank is unavailable to your account.'), { code: '42501' });
  const range = date ? { ...manilaDayRange(date), firstDay: date, today: date }
    : manilaReportRange(await fetchServerTime(db), 7);
  const { data, error } = await db.rpc('craythrive_tank_activity_history', {
    p_tank_id: tankId, p_start: range.start, p_end: range.end, p_limit: limit,
  });
  if (!error) {
    if (String(data?.tank?.id) !== String(tankId) || !data?.sources) throw new Error('Activity response does not match this tank. Retry.');
    return { tank, userId, range, sources: data.sources, limit,
      limited: Object.values(data.sources).some(rows => Array.isArray(rows) && rows.length >= limit) };
  }
  if (!['PGRST202', '42883'].includes(error.code)) throw error;
  const query = table => db.from(table).select(table === 'alerts'
    ? 'id,user_id,tank_id,type,title,message,severity,status,command_id,created_at,resolved_at,metadata'
    : 'id,user_id,tank_id,ammonia_level,ammonia_mg_l,ammonia_status,status,message,chart_label,created_at')
    .eq('user_id', userId).eq('tank_id', tankId);
  const responses = await Promise.all([
    query('alerts').gte('created_at', range.start).lt('created_at', range.end).order('created_at', { ascending: false }).limit(limit),
    query('alerts').gte('resolved_at', range.start).lt('resolved_at', range.end).order('resolved_at', { ascending: false }).limit(limit),
    query('ammonia_readings').gte('created_at', range.start).lt('created_at', range.end).order('created_at', { ascending: false }).limit(limit),
  ]);
  for (const response of responses) if (response.error) throw response.error;
  const alerts = [...new Map([...responses[0].data || [], ...responses[1].data || []].map(row => [row.id, row])).values()];
  return { tank, userId, range, limit, sources: { alerts, ammonia_readings: responses[2].data || [] },
    limited: responses.some(response => response.data?.length >= limit),
    notice: 'Showing saved alerts and ammonia tests. Detailed control, automation and threshold history is pending the reviewed database update.' };
}
