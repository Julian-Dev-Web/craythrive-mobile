import { compareTimestamps, formatPhilippineDateTime, parseTimestamp } from './philippineTime';
import { toNumber } from './thresholdResolution';
import { getSensorInspectionAction } from './sensorRecommendations';
import { formatPumpAction } from './pumpActionWording';

const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => text(value).toLowerCase().replace(/[\s-]+/g, '_');
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const pretty = value => text(value).replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const terminal = status => ['done', 'completed', 'success', 'succeeded'].includes(status);
const categories = ['sensor', 'feeding', 'water', 'ammonia', 'threshold', 'device', 'other'];
export const ACTIVITY_CATEGORIES = categories;

function parameter(value) {
  const name = text(value).toLowerCase();
  return /ammonia/.test(name) ? 'ammonia' : /temperature|\btemp\b/.test(name) ? 'temperature'
    : /\bph\b/.test(name) ? 'ph' : /turbidity|clarity/.test(name) ? 'turbidity'
      : /water|depth|level/.test(name) ? 'water' : null;
}
function category(action, source) {
  if (source === 'ammonia_readings') return 'ammonia';
  return /threshold/.test(action) ? 'threshold' : /feed/.test(action) ? 'feeding'
    : /drain|refill|pump|fill_water|add_water/.test(action) ? 'water'
      : /device|connect|disconnect|pair|unpair/.test(action) ? 'device'
        : /sensor|recover/.test(action) ? 'sensor' : 'other';
}
function recordedSeverity(value) {
  const status = key(value);
  return /critical|danger/.test(status) ? 'critical' : /warning/.test(status) ? 'warning'
    : /^(normal|safe|info)$/.test(status) ? status === 'info' ? 'info' : 'normal' : 'unknown';
}
function outcome(status) {
  return /^(pending|queued|requested)$/.test(status) ? 'Requested'
    : /^(running|started|executing|accepted)$/.test(status) ? 'Started'
      : /^(skipped|rejected|blocked|cancelled|canceled)$/.test(status) ? 'Skipped'
        : /^(failed|error|aborted)$/.test(status) ? 'Failed' : 'Unknown / Unconfirmed';
}

// Never infer execution from a notification title, requested duration, a
// synthesized mirror's "done", or merely the existence of a command row.
export function normalizeActivityEvent(source, row, tank) {
  if (!row?.id || !tank?.id || String(row.tank_id) !== String(tank.id)) return null;
  const metadata = object(row.metadata), action = key(row.action_type || row.command_type || metadata.command_type || metadata.action_type || row.type);
  const type = category(action, source), timestamp = parseTimestamp(row.created_at);
  const savedStatus = text(row.command_status || row.action_status || row.status);
  const status = key(savedStatus), reason = text(row.reason || row.result_message || row.notes || row.message);
  const hardware = ['water', 'feeding'].includes(type);
  const automatic = source === 'tank_automation_logs' || action.startsWith('auto_') || key(row.command_value) === 'auto';
  const item = { id: `${source}:${row.id}`, source, sourceId: String(row.id), tankId: tank.id,
    tankName: tank.tank_name || tank.name || 'Tank', category: type, action: pretty(action) || 'Recorded activity',
    title: pretty(action) || 'Recorded activity', outcome: outcome(status), savedStatus: savedStatus || 'Not recorded',
    severity: recordedSeverity(row.severity || metadata.severity), reason: reason || text(metadata.reason) || 'No trigger reason was recorded.',
    timestamp: timestamp?.toISOString() || null,
    timestampLabel: timestamp ? `${formatPhilippineDateTime(timestamp)} PhST` : 'Timestamp unavailable',
    timestampBasis: 'Database record time', result: 'Execution confirmation was not recorded.',
    parameter: parameter(metadata.parameter || action || row.title),
    reading: toNumber(metadata.reading_value), unit: text(metadata.unit),
    thresholdSnapshot: metadata.threshold_snapshot ?? null, triggerValue: metadata.trigger_value ?? null,
    thresholdChanges: null, classification: text(metadata.classification), readingTimestamp: parseTimestamp(metadata.reading_timestamp)?.toISOString() || null,
    recommendation: text(metadata.recommendation), recommendationSaved: Boolean(text(metadata.recommendation)),
    linkedNotifications: [], automatic, deviceTimestamp: parseTimestamp(row.executed_at)?.toISOString() || null };

  if (source === 'alerts') {
    item.title = text(row.title) || 'Recorded alert'; item.outcome = 'Recorded';
    item.parameter = parameter(metadata.parameter || row.title || row.message);
    item.category = /device|connection|disconnect|pair/.test(action) ? 'device'
      : /ammonia/.test(action) || item.parameter === 'ammonia' ? 'ammonia' : /sensor|recover/.test(action) ? 'sensor' : type;
    item.result = 'Recorded notification; it is not device execution proof.';
    if (hardware || row.command_id || metadata.control_log_id) {
      item.title = `${type === 'water' ? 'Water control' : type === 'feeding' ? 'Feeding' : 'Control'} notification`;
      item.outcome = 'Unknown / Unconfirmed';
    }
  } else if (source === 'ammonia_readings') {
    item.title = 'Ammonia test saved'; item.action = 'Scan / manual test result'; item.outcome = 'Recorded';
    item.reading = toNumber(row.ammonia_level ?? row.ammonia_mg_l); item.unit = 'ppm'; item.parameter = 'ammonia';
    item.severity = recordedSeverity(row.ammonia_status || row.status);
    item.result = 'Historical test result; not a current live sensor reading.';
    item.reason = reason || text(row.chart_label) || 'No test notes were recorded.';
  } else if (type === 'sensor') {
    item.outcome = 'Recorded'; item.result = action === 'sensor_recovery' ? 'A valid safe reading was recorded under the saved policy.' : 'Historical sensor event; saved severity and thresholds are retained.';
  } else if (type === 'threshold') {
    item.title = 'Threshold settings changed'; item.outcome = status === 'updated' ? 'Completed' : outcome(status);
    item.thresholdChanges = { before: object(metadata.old_values), after: object(metadata.new_values) };
    item.result = 'Only the recorded change is shown; current settings are not substituted.';
  } else if (hardware) {
    if (type === 'water') item.reason = formatPumpAction(row)?.message || item.reason;
    const label = type === 'feeding' ? 'Feeding' : /drain/.test(action) ? 'Drain' : 'Refill / water control';
    item.title = `${automatic ? 'Automatic ' : key(metadata.source) === 'manual' ? 'Manual ' : ''}${label} ${source === 'device_commands' ? 'command' : 'activity'}`;
    if (terminal(status)) {
      // This exact feedback is emitted by the inspected automation firmware
      // after fresh post-pump readings confirm movement in the expected direction.
      const movementConfirmed = source === 'tank_automation_logs' && type === 'water'
        && /Expected water movement confirmed\./i.test(reason)
        && !/NOT confirmed|confirmation failed|no fresh|not electronically sensed/i.test(reason);
      item.outcome = movementConfirmed ? 'Completed (device-reported)' : 'Unknown / Unconfirmed';
      item.result = movementConfirmed ? 'The device reported fresh sensor confirmation of expected water movement. This is not a direct flow measurement.'
        : 'The source reports a finished command/cycle, but physical water flow or feed delivery is not independently confirmed.';
    } else if (item.outcome === 'Skipped') item.result = 'The action was skipped or blocked. Review the recorded reason.';
    else if (item.outcome === 'Failed') item.result = 'The source recorded a failure; it does not establish successful execution.';
    else if (item.outcome === 'Requested') item.result = 'A request was saved; no execution completion is confirmed.';
    else if (item.outcome === 'Started') item.result = 'The source reports execution started; completion is not confirmed.';
  } else {
    item.outcome = terminal(status) ? 'Completed (recorded)' : item.outcome;
    item.result = 'Only the saved event is shown.';
  }
  if (!item.recommendation && ['warning', 'critical'].includes(item.severity) && item.parameter) {
    item.recommendation = getSensorInspectionAction(item.parameter, { critical: item.severity === 'critical' });
  }
  item.tone = item.outcome === 'Failed' || item.severity === 'critical' ? 'danger'
    : item.severity === 'warning' || item.outcome === 'Skipped' ? 'warning'
      : item.outcome.startsWith('Completed') ? 'success' : 'neutral';
  return item;
}

// Presentation merge only. Source IDs/explicit relationships establish identity;
// matching values/messages alone do not prove two historical events are equal.
export function buildTankActivity({ tank, userId, sources = {}, start = null, end = null, category: filter = 'all' } = {}) {
  if (!tank?.id || !userId) return [];
  const rows = source => [...new Map((Array.isArray(sources[source]) ? sources[source] : [])
    .filter(row => String(row.user_id) === String(userId) && String(row.tank_id) === String(tank.id) && row.id)
    .map(row => [String(row.id), row])).values()];
  const events = new Map(), aliases = new Map();
  const add = (source, row) => { const item = normalizeActivityEvent(source, row, tank);
    if (item) { events.set(item.id, item); aliases.set(`${source}:${row.id}`, item.id); } return item; };
  for (const row of rows('tank_automation_logs')) add('tank_automation_logs', row);
  for (const row of rows('device_commands')) {
    const autoId = /Auto log id:\s*([0-9a-f-]{36})/i.exec(text(row.result_message))?.[1];
    const existing = autoId && aliases.get(`tank_automation_logs:${autoId}`);
    if (existing) aliases.set(`device_commands:${row.id}`, existing); else add('device_commands', row);
  }
  for (const row of rows('control_logs')) {
    const related = aliases.get(`device_commands:${object(row.metadata).command_id}`);
    if (related) aliases.set(`control_logs:${row.id}`, related); else add('control_logs', row);
  }
  for (const row of rows('ammonia_readings')) add('ammonia_readings', row);
  for (const row of rows('alerts')) {
    const metadata = object(row.metadata);
    const related = aliases.get(`device_commands:${row.command_id}`) || aliases.get(`control_logs:${metadata.control_log_id}`)
      || aliases.get(`ammonia_readings:${metadata.ammonia_reading_id}`);
    if (related) {
      events.get(related).linkedNotifications.push({ id: row.id, title: text(row.title), severity: text(row.severity),
        timestamp: parseTimestamp(row.created_at)?.toISOString() || null });
      continue;
    }
    const item = add('alerts', row);
    const resolved = parseTimestamp(row.resolved_at);
    if (item && key(row.status) === 'resolved' && resolved) {
      const recovery = key(metadata.event_type) === 'sensor_recovery';
      const id = `${item.id}:resolved`;
      events.set(id, { ...item, id, title: recovery ? 'Sensor recovery recorded' : 'Alert marked resolved',
        outcome: 'Resolved (recorded)', severity: 'info', tone: 'neutral', timestamp: resolved.toISOString(),
        timestampLabel: `${formatPhilippineDateTime(resolved)} PhST`, timestampBasis: 'Recorded alert resolution time',
        reason: recovery ? item.reason : `Related alert: ${item.title}. Resolution alone does not prove sensor recovery.`,
        result: 'The saved resolution is shown without reevaluating historical readings.', recommendation: '' });
    }
  }
  const from = parseTimestamp(start)?.getTime(), until = parseTimestamp(end)?.getTime();
  return [...events.values()].filter(item => {
    const time = parseTimestamp(item.timestamp)?.getTime();
    return (filter === 'all' || item.category === filter)
      && (from === undefined || time !== undefined && time >= from)
      && (until === undefined || time !== undefined && time < until);
  }).sort((a, b) => compareTimestamps(a.timestamp, b.timestamp, true) || a.id.localeCompare(b.id));
}
