// Display-only evaluation. Raw sensor values/status fields are never written back.
import {
  getReadingAmmonia, getReadingPh, getReadingTemperature,
  getReadingTurbidity, getReadingWaterDepth, 
} from './thresholdSettings';
import { supabase } from '../lib/supabase';
import { compareTimestamps, parseTimestamp } from './philippineTime';
export { SEVERITY_UI, evaluateMonitoring, formatReadingValue, formatAmmoniaTimestamp } from './thresholdSettings';

export function monitoringColor(tone, colors) {
  return tone === 'success' ? colors.success : tone === 'warning' ? colors.warning
    : tone === 'danger' ? colors.danger : colors.muted;
}

export function normalizeSensorReading(row) {
  if (!row) return null;
  const sensor = { ...row };
  // Legacy uploads may contain ammonia columns. They are not scan events.
  for (const key of Object.keys(sensor)) {
    if (/ammonia/i.test(key) || key === 'value') delete sensor[key];
  }
  return { ...sensor, reading_type: 'water', temperature: getReadingTemperature(row), ph: getReadingPh(row),
    turbidity: getReadingTurbidity(row), water_level: getReadingWaterDepth(row),
    water_depth_cm: getReadingWaterDepth(row) };
}

export const normalizeMonitoringReading = normalizeSensorReading;

export function ammoniaSourceLabel(row) {
  const method = String(row?.source || row?.input_method || row?.scan_source || '').toLowerCase();
  if (method.includes('manual')) return 'Manual test entry';
  if (/phone|gallery/.test(method)) return 'Phone scan';
  if (row?.camera_device_uid || row?.camera_registry_id) return 'Saved device scan';
  // Current inserts do not persist which phone/manual input method was used.
  return 'Saved test / scan (input method not recorded)';
}

export function normalizeAmmoniaScan(row) {
  if (!row) return null;
  return { ...row, reading_type: 'ammonia', has_ammonia_scan: true, ammonia: getReadingAmmonia(row),
    ammonia_created_at: row.created_at || null, ammonia_source: ammoniaSourceLabel(row) };
}

export const AMMONIA_CONTEXT_INSTRUCTION = 'Ammonia is manually scanned and may be older than the latest sensor readings. Never describe ammonia as a live sensor value. Mention its scan timestamp when relevant.';

// CURRENT DISPLAY ONLY. Never save this composite or use it as a history row.
// public.ammonia_readings is authoritative regardless of the sensor timestamp.
export function combineMonitoringReadings(sensor, scan) {
  if (sensor?.tank_id && scan?.tank_id && String(sensor.tank_id) !== String(scan.tank_id)) throw new Error('Monitoring rows belong to different tanks.');
  if (!sensor && !scan) return null;
  const combined = normalizeSensorReading(sensor) || {};
  combined.reading_type = 'current_display';
  combined.ammonia = getReadingAmmonia(scan);
  combined.ammonia_created_at = scan?.created_at || null;
  combined.ammonia_reading_id = scan?.id || null;
  combined.ammonia_source = scan ? ammoniaSourceLabel(scan) : null;
  combined.ammonia_status = scan?.ammonia_status ?? scan?.status ?? null;
  combined.ammonia_label = scan?.chart_label ?? scan?.ammonia_label ?? '';
  combined.has_ammonia_scan = Boolean(scan);
  combined.sensor_created_at = sensor?.created_at || null;
  combined.created_at = combined.sensor_created_at;
  combined.tank_id = sensor?.tank_id || scan?.tank_id || null;
  return combined;
}

export function buildMonitoringHistory(sensorRows = [], scanRows = []) {
  return [...sensorRows.map(row => ({ type: 'water', timestamp: row.created_at, reading: normalizeSensorReading(row) })),
    ...scanRows.map(row => ({ type: 'ammonia', timestamp: row.created_at, reading: normalizeAmmoniaScan(row) }))]
    .sort((a, b) => compareMonitoringRows(a.reading, b.reading) || a.type.localeCompare(b.type));
}

export function compareMonitoringRows(a, b) {
  return compareTimestamps(a?.created_at, b?.created_at, true) || String(b?.id || '').localeCompare(String(a?.id || ''));
}
export function newestMonitoringRow(rows = []) { return [...rows].sort(compareMonitoringRows)[0] || null; }
let requestSequence = 0;
export function monitoringRequestVersion() { return ++requestSequence; }
export function mergeMonitoringTank(current, next) {
  if (!current || String(current.id) !== String(next.id) || String(current.user_id) !== String(next.user_id)
    || (current.monitoring_version || 0) <= (next.monitoring_version || 0)) return next;
  return { ...next, ...Object.fromEntries(['latest_sensor','latest_ammonia','latest_reading','monitoring_thresholds','has_paired_device','monitoring_version'].map(key => [key,current[key]])) };
}
export function isSensorDevice(device) {
  const role = `${device?.device_type || ''} ${device?.device_uid || ''}`;
  return /sensor|monitor/i.test(role) && !/actuator|pump|relay|feeder|cam/i.test(role);
}
export async function fetchSensorBindings(userId, tankIds, db = supabase) {
  if (!userId || !tankIds.length) return {};
  const { data, error } = await db.from('iot_devices').select('id,user_id,tank_id,device_type,device_uid,is_claimed')
    .eq('user_id',userId).eq('is_claimed',true).in('tank_id',tankIds);
  if (error) throw error;
  return Object.fromEntries(tankIds.map(id => [String(id),(data || []).filter(d => String(d.user_id) === String(userId)
    && d.is_claimed === true && String(d.tank_id) === String(id) && isSensorDevice(d) && d.device_uid)]));
}
export async function fetchMonitoringRows(userId, tankIds, { sensorLimit = 1, scanLimit = 1, start, end,
  version = monitoringRequestVersion(), db = supabase } = {}) {
  if (!userId) return { sensors:[],scans:[],bindings:{},version };
  const ids = [...new Set(tankIds.filter(Boolean).map(String))], bindings = await fetchSensorBindings(userId,ids,db);
  const result = await Promise.all(ids.map(async tankId => {
    const binding = bindings[tankId]?.length === 1 ? bindings[tankId][0] : null;
    const query = (table, limit) => {
      let q = db.from(table).select('*').eq('user_id',userId).eq('tank_id',tankId);
      if (table === 'sensor_readings') q = q.eq('device_uid',binding.device_uid);
      if (start) q = q.gte('created_at',start);
      if (end) q = q.lt('created_at',end);
      return q.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit);
    };
    const [sensor,scan] = await Promise.all([binding ? query('sensor_readings',sensorLimit) : {data:[]},query('ammonia_readings',scanLimit)]);
    if (sensor.error || scan.error) throw sensor.error || scan.error;
    const owned = row => row && String(row.user_id) === String(userId) && String(row.tank_id) === tankId && parseTimestamp(row.created_at);
    const array = value => Array.isArray(value) ? value : value ? [value] : [];
    return { sensors:array(sensor.data).filter(row => owned(row) && row.device_uid === binding?.device_uid
      && (!row.iot_device_id || !binding.id || String(row.iot_device_id) === String(binding.id))).sort(compareMonitoringRows).map(normalizeSensorReading),
    scans:array(scan.data).filter(owned).sort(compareMonitoringRows).map(normalizeAmmoniaScan) };
  }));
  return { sensors:result.flatMap(r=>r.sensors),scans:result.flatMap(r=>r.scans),bindings,version };
}
export function fetchLatestMonitoringRows(userId,tankIds,options) {
  return fetchMonitoringRows(userId,tankIds,options);
}

export async function fetchPairedTankIds(userId, tankIds) {
  if (!tankIds.length) return new Set();
  const { data, error } = await supabase.from('iot_devices').select('tank_id, device_type, device_uid')
    .eq('user_id', userId).eq('is_claimed', true).in('tank_id', tankIds);
  if (error) throw error;
  return new Set((data || []).filter(row => !/cam|camera/i.test(`${row.device_type || ''} ${row.device_uid || ''}`))
    .map(row => String(row.tank_id)));
}

