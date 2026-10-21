// Portable presentation/notification policy. Never write these labels into
// firmware directional statuses or use them to authorize actuator commands.
export const OPTIONAL_POLICY_FIELDS = {
  waterLevelMax: ['Water safe maximum', 'cm'],
  temperatureCriticalMin: ['Temperature Critical at or below', '°C'],
  temperatureCriticalMax: ['Temperature Critical at or above', '°C'],
  phCriticalMin: ['pH Critical at or below', ''],
  phCriticalMax: ['pH Critical at or above', ''],
  waterCriticalMin: ['Water Critical at or below', 'cm'],
  waterCriticalMax: ['Water Critical at or above', 'cm'],
  turbidityCriticalMinV: ['Clarity Critical at or below', 'V'],
  ammoniaCriticalMax: ['Ammonia Critical at or above', 'ppm'],
  temperatureMaxAgeSeconds: ['Temperature maximum reading age', 'seconds'],
  phMaxAgeSeconds: ['pH maximum reading age', 'seconds'],
  waterMaxAgeSeconds: ['Water maximum reading age', 'seconds'],
  turbidityMaxAgeSeconds: ['Clarity maximum reading age', 'seconds'],
  ammoniaMaxAgeSeconds: ['Manual ammonia maximum result age', 'seconds'],
};
export const PARAMETER_BOUNDS = {
  temperature: ['temperatureMin', 'temperatureMax', 'temperatureCriticalMin', 'temperatureCriticalMax'],
  ph: ['phMin', 'phMax', 'phCriticalMin', 'phCriticalMax'],
  water: ['waterLevelMin', 'waterLevelMax', 'waterCriticalMin', 'waterCriticalMax'],
  turbidity: ['turbidityMax', null, 'turbidityCriticalMinV', null],
  ammonia: [null, 'ammoniaMax', null, 'ammoniaCriticalMax'],
};
const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
export function validateClassificationSettings(t) {
  const errors = [];
  for (const [key, [label]] of Object.entries(OPTIONAL_POLICY_FIELDS)) {
    if (t[key] == null) continue;
    const value = numeric(t[key]);
    if (value === null || /MaxAgeSeconds$/.test(key) && value <= 0) errors.push(`${label} must be a finite${/MaxAgeSeconds$/.test(key) ? ' positive' : ''} number.`);
  }
  for (const [parameter, [low, high, criticalLow, criticalHigh]] of Object.entries(PARAMETER_BOUNDS)) {
    if (low && high && t[low] != null && t[high] != null && t[low] >= t[high]) errors.push(`${parameter}: safe minimum must be below safe maximum.`);
    if (criticalLow && t[criticalLow] != null && t[criticalLow] >= t[low]) errors.push(`${parameter}: lower Critical boundary must be below the safe minimum.`);
    if (criticalHigh && t[criticalHigh] != null && (!high || t[high] == null || t[criticalHigh] <= t[high])) errors.push(`${parameter}: upper Critical boundary requires a safe maximum and must be above it.`);
  }
  return errors;
}
export function sourceReadingProblem(row, parameter) {
  const status = parameter === 'water' ? row?.water_status : parameter === 'ammonia' ? row?.ammonia_status || row?.status : row?.[`${parameter}_status`];
  const statusText = String(status || '').replace(/[_-]/g, ' ').toUpperCase();
  if (/STALE/.test(statusText)) return 'stale';
  if (/ERROR|INVALID|UNKNOWN|WAITING|NO DATA|NO READING|N\/A/.test(statusText)) return 'invalid';
  const payload = row?.raw_payload || {}, health = payload.health || {};
  const analog = payload.analog_state || health.analog || {}, water = payload.water_state || health.water || {};
  const sourceHealth = payload.sensor_health?.[parameter === 'water' ? 'water_level' : parameter]?.health;
  if (/ERROR|INVALID|UNKNOWN/.test(String(sourceHealth || '').toUpperCase())) return 'invalid';
  if (parameter === 'water' && (water.fresh === false || water.last_good_used === true)) return 'stale';
  if (['ph', 'turbidity'].includes(parameter) && (analog[`${parameter}_fresh`] === false || analog[`${parameter}_last_good_used`] === true)) return 'stale';
  return null;
}
export function classifyParameter(parameter, value, t) {
  if (numeric(value) === null) return { severity: 'missing', direction: null };
  if (['water', 'turbidity', 'ammonia'].includes(parameter) && value < 0) return { severity: 'invalid', direction: null };
  if (validateClassificationSettings(t).length) return { severity: 'configuration', direction: null, reason: 'Effective threshold settings conflict. Review configuration before relying on classification.' };
  const [low, high, criticalLow, criticalHigh] = PARAMETER_BOUNDS[parameter];
  const direction = low && t[low] != null && value < t[low] ? 'low' : high && t[high] != null && value > t[high] ? 'high' : null;
  if (!direction) return { severity: 'normal', direction: null };
  const boundary = direction === 'low' ? t[criticalLow] : t[criticalHigh];
  if (boundary == null) return { severity: 'configuration', direction, reason: 'Outside safe range — Critical limit not configured. Verify the tank; severity cannot be fully established.' };
  const critical = direction === 'low' ? value <= boundary : value >= boundary;
  return { severity: critical ? 'critical' : 'warning', direction, boundary };
}
