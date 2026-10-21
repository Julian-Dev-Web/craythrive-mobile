import { analyzeTankReading } from './tankRules';
import { isCrayThriveQuestionInScope, normalizeForScope } from './aiScope';
import { combineMonitoringReadings } from './sensorMonitoring';

// A fallback is an explicitly labelled explanation of existing rules. It never
// generates a threshold suggestion or executes a hardware action.
export function buildAiRuleFallback(question, context, failureCode, history = []) {
  if (!['AI_PROVIDER_UNAVAILABLE', 'AI_TIMEOUT', 'AI_NETWORK_ERROR', 'AI_UNAVAILABLE', 'AI_RATE_LIMIT'].includes(failureCode) ||
      !context?.tank?.id || !context.rule_based_result || !context.thresholds ||
      !isCrayThriveQuestionInScope(question, context, history)) return null;
  const prompt = normalizeForScope(question);
  if (/\b(compare|previous|threshold|history|last week)\b/.test(prompt)) return null;
  if (!/\b(condition|status|safe|attention|watch|bantayan|feed|feeding|pakain|magpakain|gawin|unahin|muna|first|bakit|why|aayusin|explain|action|readings?)\b/.test(prompt)) return null;
  const paired = context.rule_based_result.sensor_condition !== 'Unpaired' && context.rule_based_result.status !== 'Unpaired';
  const sensor = Object.prototype.hasOwnProperty.call(context, 'latest_sensor') ? context.latest_sensor : context.latest_reading;
  const current = combineMonitoringReadings(sensor, context.latest_ammonia);
  const result = analyzeTankReading(current, Boolean(current), context.thresholds, { paired });
  const readings = Object.values(result.metrics).filter(metric => metric.value !== null)
    .map(metric => `${metric.title}: ${metric.displayValue} (${metric.label})${metric.key === 'ammonia' ? `; manual scan, ${metric.scanTimestampLabel}` : ''}`).join('; ');
  const issues = result.issues.map(issue => issue.message).join(' ');
  return { scope: 'allowed', category: 'craythrive', action: 'recommendation_only',
    answer: `AI is temporarily unavailable. Rule-based fallback from CrayThrive's current tank rules: ${result.title}. ${result.message} ${readings}. ${issues} ${result.suggestion}`.trim(),
    reason: 'Computed from the attached latest saved readings and current thresholds; this is not an AI-generated answer.',
    source: 'rule_based', fallback: true, fallback_code: failureCode,
    threshold_suggestion: null, suggestion_id: null, suggestion_saved: false };
}
