import { evaluateMonitoring, combineMonitoringReadings } from './sensorMonitoring';
import { THRESHOLD_COLUMNS, toNumber } from './thresholdResolution';
import { validateClassificationSettings } from './classificationPolicy';
import { formatPhilippineDateTime, parseTimestamp } from './philippineTime';

export const RECOMMENDATION_POLICY_NOTE = 'Status uses saved tank thresholds. Unset Critical limits or reading-age policies require configuration. Recommendations never control equipment or change settings.';
const ORDER = { critical: 0, warning: 1, configuration: 1, missing: 2, stale: 2, invalid: 2, partial: 2, unavailable: 2, unpaired: 2, unverified: 2, normal: 3 };
const ACTIONS = {
  temperature: (value, t) => value < t.temperatureMin
    ? 'Verify with a separate thermometer. Inspect insulation and any existing heater; avoid abrupt temperature changes.'
    : 'Verify with a separate thermometer. Inspect heat sources, shade and ventilation; avoid abrupt temperature changes.',
  water: () => 'Inspect the actual depth, level sensor, leaks and water supply. Follow the approved manual water-management procedure after verification.',
  ph: () => 'Repeat the pH test with a calibrated meter. Inspect input water and accumulated waste; do not dose chemicals from a single reading.',
  turbidity: () => 'Inspect the clarity probe for deposits and confirm its voltage reading. Check suspended waste and filtration before following the approved cleaning procedure.',
  ammonia: () => 'Take a new ammonia test and verify the strip/chart or manual result. Inspect waste and filtration, then follow the approved ammonia-response procedure.',
};

// Generic follow-up may also be shown alongside a historical event. It does
// not recalculate that event with today's settings or claim to be saved advice.
export function getSensorInspectionAction(parameter, { value, thresholds, critical = false } = {}) {
  const action = parameter === 'temperature' && (!thresholds || value === undefined)
    ? 'Verify with a separate thermometer. Inspect heat sources, ventilation and insulation; avoid abrupt temperature changes.'
    : ACTIONS[parameter]?.(value, thresholds) || 'Inspect the tank and obtain a new valid reading before intervention.';
  return critical ? `Check the tank immediately and verify the measurement before safe intervention. ${action}` : action;
}

// Portable, deterministic and read-only. No invented age or critical defaults.
export function buildSensorRecommendations({ tank, sensor = null, scan = null, thresholds,
  paired = true, dataAvailable = true, serverTime = null, maxAgeSeconds = {} } = {}) {
  const tankId = tank?.id || tank?.tank_id, tankName = tank?.tank_name || tank?.name || 'Tank';
  const scoped = row => !row || (tankId && row.tank_id && String(row.tank_id) === String(tankId));
  const scopeValid = Boolean(tankId) && scoped(sensor) && scoped(scan);
  const ready = Boolean(thresholds) && Object.keys(THRESHOLD_COLUMNS).every(key => toNumber(thresholds[key]) !== null)
    && !validateClassificationSettings(thresholds).length;
  const settings = { ...thresholds };
  for (const [parameter, age] of Object.entries(maxAgeSeconds)) if (toNumber(age) !== null && age > 0) settings[`${parameter}MaxAgeSeconds`] = age;
  const evaluated = evaluateMonitoring(combineMonitoringReadings(scopeValid ? sensor : null, scopeValid ? scan : null), settings, { paired, serverTime });
  const items = Object.values(evaluated.metrics).map(metric => {
    const row = metric.key === 'ammonia' ? scan : sensor, timestamp = parseTimestamp(scopeValid ? row?.created_at : null);
    let severity = metric.severity, label = metric.label, reason = metric.reason;
    let action = severity === 'normal' ? 'Continue routine monitoring and tank observation.'
      : metric.value !== null ? getSensorInspectionAction(metric.key, { value: metric.value, thresholds: settings, critical: severity === 'critical' })
        : metric.key === 'ammonia' ? 'Take and save a new ammonia test for this tank.' : 'Inspect the sensor connection and take a new reading.';
    if (severity === 'configuration') action += ' Configure a verified Critical boundary before relying on the severity band.';
    if (['stale', 'invalid', 'unverified'].includes(severity)) action = 'Obtain a new valid reading and review the configured reading-age policy before relying on the saved result.';
    if (!scopeValid || !dataAvailable || !ready) {
      severity = 'unavailable'; label = 'Unavailable';
      reason = !scopeValid ? 'The reading cannot be matched to this tank.' : !dataAvailable
        ? 'Current data could not be refreshed. Cached values cannot establish the current condition.' : 'Effective thresholds could not be verified.';
      action = 'Refresh this tank and review its saved configuration before relying on recommendations.';
    }
    return { key: metric.key, tankId, tankName, parameter: metric.title, value: scopeValid ? metric.value : null,
      readingLabel: scopeValid && metric.value !== null ? metric.displayValue : 'No reading', unit: metric.unit,
      safeRange: ready ? metric.safeRangeLabel : 'Safe range unavailable', criticalRange: ready ? metric.criticalRangeLabel : '',
      severity, label, reason, action, timestamp: timestamp?.toISOString() || null,
      timestampLabel: timestamp ? `${formatPhilippineDateTime(timestamp)} PhST` : 'Reading timestamp unavailable',
      tone: severity === 'critical' ? 'danger' : ['warning', 'configuration'].includes(severity) ? 'warning' : severity === 'normal' ? 'success' : 'neutral',
      evaluatedSeverity: scopeValid ? metric.evaluatedSeverity : null, manual: metric.key === 'ammonia' };
  }).sort((a,b) => ORDER[a.severity] - ORDER[b.severity]);
  const attentionCount = items.filter(item => item.severity !== 'normal').length;
  return { tankId, tankName, items, attentionCount, policyNote: RECOMMENDATION_POLICY_NOTE,
    emptyMessage: attentionCount ? null : 'No current recommendations require attention. Continue routine monitoring.' };
}
