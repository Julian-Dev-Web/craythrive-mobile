// src/utils/thresholdSettings.js

import { classifyParameter, PARAMETER_BOUNDS, sourceReadingProblem } from './classificationPolicy';
import { getServerNow } from './serverClock';
import { supabase } from "../lib/supabase";
import { parseTimestamp, formatPhilippineDate, formatPhilippineTime } from './philippineTime';

import { DEFAULT_THRESHOLDS, normalizeThresholds, toNumber, fetchEffectiveThresholds, fetchEffectiveThresholdsForTanks } from './thresholdResolution';
export { DEFAULT_THRESHOLDS, normalizeThresholds, toNumber, THRESHOLD_TABLE, TANK_THRESHOLD_TABLE } from './thresholdResolution';

export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user?.id) {
    return null;
  }

  return data.user.id;
}

export async function fetchThresholdSettings(userId, tankId = null) {
  return fetchEffectiveThresholds(supabase, userId, tankId);
}
export async function fetchTankThresholdSettings(userId, tankIds) {
  return fetchEffectiveThresholdsForTanks(supabase, userId, tankIds);
}
export async function fetchCurrentUserThresholdSettings(tankId = null) {
  return fetchThresholdSettings(await getCurrentUserId(), tankId);
}
export async function applyTankThresholdPatch({ tankId, patch, scope = 'single_tank', source = 'manual' }) {
  if (!tankId) throw new Error('Select a tank before applying thresholds.');
  if (!['single_tank', 'all_tanks'].includes(scope) || !['manual', 'ai_recommendation'].includes(source)) throw new Error('Invalid threshold operation.');
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Please sign in before applying thresholds.');
  const { data, error } = await supabase.rpc('apply_tank_thresholds', {
    p_tank_id: tankId, p_patch: patch, p_scope: scope, p_source: source,
  });
  if (error) throw error;
  // Never report success using an optimistic client merge. Read persisted values.
  const thresholds = await fetchThresholdSettings(userId, tankId);
  return { success: true, thresholds, affected: data?.affected, changed: data?.changed };
}

export async function configureClassification({ tankId, patch, scope = 'single_tank' }) {
  if (!tankId || !['single_tank', 'account_defaults'].includes(scope)) throw new Error('Select an owned tank and configuration scope.');
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Sign in before configuring classifications.');
  const { error } = await supabase.rpc('configure_tank_classification', { p_tank_id: tankId, p_patch: patch, p_scope: scope });
  if (error) throw new Error(['PGRST202', '42883'].includes(error.code)
    ? 'Classification saving is pending the reviewed database update. Nothing was saved.' : error.message || 'Could not save classification settings.');
  return fetchThresholdSettings(userId, tankId);
}

export function firstReadingNumber(...values) {
  for (const value of values) { const number = toNumber(value); if (number !== null) return number; }
  return null;
}
function canonicalNumber(reading, key, aliases) {
  // An explicit canonical null/invalid value must not revive a legacy alias.
  if (reading && Object.prototype.hasOwnProperty.call(reading, key)) return toNumber(reading[key]);
  return firstReadingNumber(...aliases.map(name => reading?.[name]));
}
export function getReadingTemperature(reading) { return canonicalNumber(reading, 'temperature_c', ['temperature','temp_c','temp']); }
export function getReadingPh(reading) { return canonicalNumber(reading, 'ph_value', ['ph','pH','phLevel']); }
export function getReadingTurbidity(reading) {
  // Legacy turbidity/turbidity_v are voltage aliases in this project. ADC/NTU raw values are not volts.
  return canonicalNumber(reading, 'turbidity_voltage', ['turbidity_v','turbidity']);
}
export function getReadingWaterDepth(reading) { return canonicalNumber(reading, 'water_depth_cm', ['water_level']); }
export function getReadingAmmonia(reading) {
  if (reading?.reading_type === 'water') return null;
  const value = canonicalNumber(reading, 'ammonia_level', ['ammonia','ammonia_mg_l','ammonia_ppm','value']);
  return value !== null && value >= 0 ? value : null;
}

export function cleanStatus(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function isNoReadingStatus(status) {
  const value = cleanStatus(status);

  return (
    value.includes("NO READING") ||
    value.includes("NO DATA") ||
    value.includes("N/A") ||
    value.includes("UNKNOWN")
  );
}

export function isBadStatus(status) {
  const value = cleanStatus(status);

  if (!value) return false;

  return (
    value.includes("UNSAFE") ||
    value.includes("CRITICAL") ||
    value.includes("DANGER") ||
    value.includes("WARNING") ||
    value.includes("LOW") ||
    value.includes("HIGH") ||
    value.includes("WARM") ||
    value.includes("COLD") ||
    value.includes("DIRTY") ||
    value.includes("ACIDIC") ||
    value.includes("ALKALINE") ||
    value.includes("TOXIC")
  );
}

export function isSafeStatus(status) {
  const value = cleanStatus(status);

  if (!value) return false;

  // Important:
  // UNSAFE contains SAFE, so bad statuses must be checked first.
  if (isBadStatus(value)) return false;

  return (
    value.includes("SAFE") ||
    value.includes("IDEAL") ||
    value.includes("CLEAR") ||
    value.includes("NORMAL") ||
    value.includes("GOOD") ||
    value.includes("ACCEPTABLE") ||
    value.includes("STABLE") ||
    value === "OK"
  );
}

export function isTemperatureSafe(reading, thresholds = DEFAULT_THRESHOLDS) { return evaluateMonitoring(reading, thresholds).metrics.temperature.severity === 'normal'; }
export function isPhSafe(reading, thresholds = DEFAULT_THRESHOLDS) { return evaluateMonitoring(reading, thresholds).metrics.ph.severity === 'normal'; }
export function isTurbiditySafe(reading, thresholds = DEFAULT_THRESHOLDS) { return evaluateMonitoring(reading, thresholds).metrics.turbidity.severity === 'normal'; }
export function isWaterSafe(reading, thresholds = DEFAULT_THRESHOLDS) { return evaluateMonitoring(reading, thresholds).metrics.water.severity === 'normal'; }
export function isAmmoniaSafe(reading, thresholds = DEFAULT_THRESHOLDS) { return evaluateMonitoring(reading, thresholds).metrics.ammonia.severity === 'normal'; }
export function getOverallThresholdStatus(reading, thresholds = DEFAULT_THRESHOLDS) { return evaluateMonitoring(reading, thresholds); }

export const SEVERITY_UI = {
  normal: { label: 'Normal', tone: 'success', icon: 'checkmark-circle-outline' },
  warning: { label: 'Warning', tone: 'warning', icon: 'warning-outline' },
  critical: { label: 'Critical', tone: 'danger', icon: 'alert-circle-outline' },
  missing: { label: 'No Reading', tone: 'neutral', icon: 'help-circle-outline' },
  configuration: { label: 'Requires configuration', tone: 'warning', icon: 'settings-outline' },
  stale: { label: 'Stale', tone: 'neutral', icon: 'time-outline' },
  invalid: { label: 'Invalid reading', tone: 'neutral', icon: 'help-circle-outline' },
  unverified: { label: 'Recency unverified', tone: 'neutral', icon: 'time-outline' },
  partial: { label: 'Incomplete data', tone: 'neutral', icon: 'help-circle-outline' },
  unpaired: { label: 'Unpaired', tone: 'neutral', icon: 'link-outline' },
};

export function formatReadingValue(value, unit = '') {
  const number = toNumber(value);
  return number === null ? '--' : `${Number(number.toFixed(2))}${unit ? ` ${unit}` : ''}`;
}

export function formatAmmoniaTimestamp(timestamp) {
  const date = parseTimestamp(timestamp);
  if (!date || !Number.isFinite(date.getTime())) return 'Scan timestamp unavailable';
  return `Latest scan: ${formatPhilippineDate(date, { year: 'numeric' })} \u2022 ${formatPhilippineTime(date)} PhST`;
}

export function evaluateMonitoring(reading, thresholds, { paired = true, serverTime = getServerNow(), historical = false } = {}) {
  const t = normalizeThresholds(thresholds), now = parseTimestamp(serverTime)?.getTime();
  const safeRangeLabels = {
    temperature: `Safe Range: ${t.temperatureMin}\u2013${t.temperatureMax} \u00b0C`,
    ph: `Safe Range: ${t.phMin}\u2013${t.phMax}`,
    water: t.waterLevelMax == null ? `Safe Limit: \u2265 ${t.waterLevelMin} cm` : `Safe Range: ${t.waterLevelMin}\u2013${t.waterLevelMax} cm`,
    turbidity: `Safe Limit: \u2265 ${t.turbidityMax} V`, ammonia: `Safe Limit: \u2264 ${t.ammoniaMax} ppm`,
  };
  const values = { temperature: getReadingTemperature(reading), ph: getReadingPh(reading),
    water: getReadingWaterDepth(reading), turbidity: getReadingTurbidity(reading), ammonia: getReadingAmmonia(reading) };
  const titles = { temperature: 'Temperature', ph: 'pH', water: 'Water Depth', turbidity: 'Water Clarity', ammonia: 'Ammonia' };
  const units = { temperature: '\u00b0C', ph: '', water: 'cm', turbidity: 'V', ammonia: 'ppm' }, metrics = {};
  for (const [key, value] of Object.entries(values)) {
    const computed = classifyParameter(key, value, t), unit = units[key];
    const timestamp = parseTimestamp(key === 'ammonia' ? reading?.ammonia_created_at || (reading?.reading_type === 'ammonia' ? reading.created_at : null)
      : reading?.sensor_created_at || reading?.created_at);
    const ageLimit = t[`${key}MaxAgeSeconds`], age = timestamp && now !== undefined ? (now - timestamp.getTime()) / 1000 : null;
    let severity = computed.severity, reason = computed.reason || `${safeRangeLabels[key]}.`;
    const [low, high, criticalLow, criticalHigh] = PARAMETER_BOUNDS[key];
    if (computed.direction) reason = `${computed.direction === 'low' ? 'Below safe minimum' : 'Above safe maximum'}: ${t[computed.direction === 'low' ? low : high]}${unit ? ` ${unit}` : ''}. ${computed.reason || (severity === 'critical' ? `Reached Critical boundary: ${computed.boundary}${unit ? ` ${unit}` : ''}.` : 'Outside the safe range; Critical boundary has not been reached.')}`;
    const problem = sourceReadingProblem(reading, key);
    if (value === null) { severity = 'missing'; reason = 'Waiting for a valid numeric reading.'; }
    else if (key !== 'ammonia' && !paired) { severity = 'unpaired'; reason = 'Device unpaired. This is a last saved value.'; }
    else if (problem || computed.severity === 'invalid') { severity = problem || 'invalid'; reason = severity === 'stale' ? 'Source reports stale or last-good data. Obtain a fresh reading.' : 'Source reports an invalid measurement. Verify the sensor or repeat the test.'; }
    else if (!historical && (!timestamp || age !== null && age < 0)) { severity = 'invalid'; reason = 'The reading timestamp cannot be verified. Obtain a new reading.'; }
    else if (!historical && ageLimit != null && (age === null || age > ageLimit)) { severity = age === null ? 'unverified' : 'stale'; reason = age === null ? 'Server time is unavailable; reading recency cannot be verified.' : 'The saved reading exceeds its configured maximum age.'; }
    else if (!historical && ageLimit == null) {
      if (severity === 'normal') severity = 'unverified';
      reason += ' No reading-age policy is configured; verify the current tank condition.';
    }
    const boundaries = [criticalLow && t[criticalLow] != null ? `\u2264 ${t[criticalLow]}${unit ? ` ${unit}` : ''}` : null,
      criticalHigh && t[criticalHigh] != null ? `\u2265 ${t[criticalHigh]}${unit ? ` ${unit}` : ''}` : null].filter(Boolean);
    const required = [low && criticalLow, high && t[high] != null && criticalHigh].filter(Boolean);
    const missing = required.filter(field => t[field] == null), ui = SEVERITY_UI[severity];
    metrics[key] = { key, title: titles[key], value, unit, severity, evaluatedSeverity: computed.severity,
      direction: computed.direction, ...ui, safeRangeLabel: safeRangeLabels[key],
      criticalRangeLabel: `Critical Limit: ${boundaries.length ? boundaries.join(' or ') : 'Requires configuration'}${boundaries.length && missing.length ? ' · Other boundary not configured' : ''}`,
      displayValue: formatReadingValue(value, unit), reason, timestamp: timestamp?.toISOString() || null,
      recencyVerified: historical || ageLimit != null && age !== null && age >= 0 && age <= ageLimit,
      context: key === 'ammonia' ? 'Manual / event-based scan' : 'Latest saved reading' };
    if (key === 'ammonia') {
      const scan = metrics[key];
      scan.sourceLabel = reading?.ammonia_source || 'Saved test / scan';
      scan.scanTimestampLabel = value === null && !reading?.has_ammonia_scan ? null : formatAmmoniaTimestamp(scan.timestamp);
      if (value === null) { scan.label = reading?.has_ammonia_scan ? 'No Reading' : 'No Scan'; scan.displayValue = scan.label;
        scan.reason = reading?.has_ammonia_scan ? 'The saved scan has no valid numeric result.' : 'No ammonia scan has been saved for this tank.'; }
      else { scan.reason = `Latest saved manual scan. ${scan.reason}`; if (!historical) scan.label = `${scan.label} · saved scan`; }
    } else if (!historical && !metrics[key].recencyVerified && ['warning', 'critical'].includes(severity)) metrics[key].label += ' at saved reading';
  }
  const all = Object.values(metrics), available = all.filter(metric => metric.value !== null);
  const aggregate = list => list.some(m => m.severity === 'critical') ? 'critical' : list.some(m => m.severity === 'configuration') ? 'configuration'
    : list.some(m => m.severity === 'warning') ? 'warning' : !list.some(m => m.value !== null) ? 'missing'
      : list.some(m => m.severity === 'unpaired') ? 'unpaired' : list.every(m => m.severity === 'normal') ? 'normal' : 'partial';
  const severity = aggregate(all), sensorSeverity = aggregate(all.filter(m => m.key !== 'ammonia')), ui = SEVERITY_UI[severity];
  const sensorCondition = sensorSeverity === 'missing' ? 'No Data' : SEVERITY_UI[sensorSeverity].label, scan = metrics.ammonia;
  const message = `Overall sensor condition: ${sensorCondition}. Ammonia: ${scan.label}${scan.value === null ? '' : ` (${scan.displayValue})`}.${scan.scanTimestampLabel ? ` ${scan.scanTimestampLabel}.` : ''}`;
  return { metrics, thresholds: t, severity, label: severity === 'missing' ? 'No Data' : ui.label,
    status: severity === 'missing' ? 'No Data' : ui.label, tone: ui.tone, type: ui.tone, icon: ui.icon,
    score: paired && all.every(m => ['normal', 'warning', 'critical'].includes(m.severity)) ? Math.round(all.filter(m => m.severity === 'normal').length / 5 * 100) : null,
    availableMetrics: available.length, totalMetrics: 5, message, sensorCondition,
    suggestion: available.length ? 'Review the readings and inspect the tank before taking action.' : 'Refresh after a reading is saved, or perform an ammonia test.' };
}
