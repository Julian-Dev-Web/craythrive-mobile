// Notifications are evaluated under one owner-checked database transaction.
// Never create or resolve condition alerts from a phone's clock/cached values.
import { supabase } from '../lib/supabase';
import { evaluateMonitoring } from './thresholdSettings';
import { normalizeSensorReading } from './sensorMonitoring';

export function buildSensorAlerts(reading, thresholds) {
  return Object.values(evaluateMonitoring(normalizeSensorReading(reading), thresholds).metrics)
    .filter(metric => ['warning', 'critical', 'configuration'].includes(metric.severity))
    .map(metric => ({ title: `${metric.title}: ${metric.label}`, message: `${metric.displayValue}. ${metric.reason}`,
      severity: metric.severity === 'critical' ? 'critical' : 'warning', parameter: metric.key }));
}
async function reconcile({ userId, tankId }) {
  if (!userId || !tankId) return;
  const { error } = await supabase.rpc('reconcile_tank_classification', { p_tank_id: tankId });
  if (error) {
    // Old server producers stay in place until the reviewed SQL is applied.
    // No fallback client insert: it would recreate conflicting duplicate alerts.
    console.log('CLASSIFICATION ALERT RECONCILIATION UNAVAILABLE:');
  }
}
export const syncSensorAlertsForReading = reconcile;
export const syncAmmoniaAlertsForScan = reconcile;