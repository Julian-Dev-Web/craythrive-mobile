// Deployment-safe resolver contract: per-tank row -> legacy account row -> defaults.
import { OPTIONAL_POLICY_FIELDS } from './classificationPolicy';
export const THRESHOLD_TABLE = 'threshold_settings';
export const TANK_THRESHOLD_TABLE = 'tank_threshold_settings';
export const DEFAULT_THRESHOLDS = {
  temperatureMin: 20, temperatureMax: 30, phMin: 6.5, phMax: 8.5,
  turbidityMax: 2.5, waterLevelMin: 4.5, ammoniaMax: 0.25,
};
export const THRESHOLD_COLUMNS = {
  temperatureMin: 'temperature_min', temperatureMax: 'temperature_max',
  phMin: 'ph_min', phMax: 'ph_max', turbidityMax: 'turbidity_max',
  waterLevelMin: 'water_level_min', ammoniaMax: 'ammonia_max',
};
export function toNumber(value, fallback = null) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
export function normalizeThresholds(row) {
  if (!row) return DEFAULT_THRESHOLDS;
  const nested = row.thresholds || row.safe_thresholds || {};
  const safe = Object.fromEntries(Object.entries(THRESHOLD_COLUMNS).map(([key, column]) => [key,
    toNumber(nested[key] ?? nested[column] ?? row[key] ?? row[column], DEFAULT_THRESHOLDS[key]),
  ]));
  for (const key of Object.keys(OPTIONAL_POLICY_FIELDS)) safe[key] = toNumber(nested[key] ?? row[key]);
  if (row.policySources) safe.policySources = row.policySources;
  if (row.policyOverrides) safe.policyOverrides = row.policyOverrides;
  if (row.policyAccount) safe.policyAccount = row.policyAccount;
  return safe;
}
export function resolveThresholdRows(tankRow, legacyRow) {
  const safe = { ...normalizeThresholds(tankRow || legacyRow) }, account = normalizeThresholds(legacyRow);
  const tank = normalizeThresholds(tankRow), sources = {}, overrides = {};
  for (const key of Object.keys(OPTIONAL_POLICY_FIELDS)) {
    overrides[key] = tankRow ? tank[key] ?? null : null;
    safe[key] = tankRow && tank[key] != null ? tank[key] : account[key] ?? null;
    sources[key] = tankRow && tank[key] != null ? 'tank' : account[key] != null ? 'account' : 'unset';
  }
  return { ...safe, policySources: sources, policyOverrides: overrides,
    policyAccount: Object.fromEntries(Object.keys(OPTIONAL_POLICY_FIELDS).map(key => [key, account[key] ?? null])) };
}
export async function fetchEffectiveThresholds(db, userId, tankId = null) {
  if (!userId) return resolveThresholdRows(null, null);
  let tankRow = null;
  if (tankId) {
    const { data, error } = await db.from(TANK_THRESHOLD_TABLE).select('*')
      .eq('user_id', userId).eq('tank_id', tankId).maybeSingle();
    if (error) throw error; // A failed canonical read is not an absent row.
    tankRow = data;
  }
  const { data, error } = await db.from(THRESHOLD_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return resolveThresholdRows(tankRow, data);
}
export async function fetchEffectiveThresholdsForTanks(db, userId, tankIds) {
  const ids = [...new Set(tankIds.filter(Boolean).map(String))];
  if (!userId || !ids.length) return {};
  const { data, error } = await db.from(TANK_THRESHOLD_TABLE).select('*').eq('user_id', userId).in('tank_id', ids);
  if (error) throw error;
  const rows = new Map((data || []).map(row => [String(row.tank_id), row]));
  // Optional policy fields inherit per field, even when a tank has a safe row.
  const { data: baseline, error: baselineError } = await db.from(THRESHOLD_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (baselineError) throw baselineError;
  return Object.fromEntries(ids.map(id => [id, resolveThresholdRows(rows.get(id), baseline)]));
}
