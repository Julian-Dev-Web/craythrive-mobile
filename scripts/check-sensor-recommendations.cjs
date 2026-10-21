/* global __dirname */
// Offline checks; no real accounts, AI provider calls, writes or hardware actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./check-mobile-ui.cjs');
const { environment } = require('./check-sensor-monitoring.cjs');
process.chdir(path.resolve(__dirname, '..'));
const app = harness();
const { buildSensorRecommendations: build } = app.load('src/utils/sensorRecommendations.js');
const { DEFAULT_THRESHOLDS, evaluateMonitoring } = app.load('src/utils/thresholdSettings.js');
// Synthetic configured Critical limits, never application defaults.
const thresholds = { ...DEFAULT_THRESHOLDS, temperatureCriticalMin: 18, temperatureCriticalMax: 34,
  phCriticalMin: 6, phCriticalMax: 9, waterCriticalMin: 2, turbidityCriticalMinV: 1.5, ammoniaCriticalMax: 0.5 };
const tank = { id: 'A', tank_name: 'Breeder A' };
const sensor = { device_uid:'sensor-A', id: 'reading-A', tank_id: 'A', created_at: '2026-10-11T12:00:00Z',
  temperature_c: 27, ph_value: 7, water_depth_cm: 5, turbidity_voltage: 3 };
const scan = { id: 'scan-A', tank_id: 'A', created_at: '2026-10-11T11:58:00Z', ammonia_level: 0.15 };
const input = { tank, sensor, scan, thresholds, paired: true, serverTime: '2026-10-11T12:01:00Z' };
// Explicit test configuration only; no freshness defaults are shipped in the app.
const ages = { temperature: 120, ph: 120, water: 120, turbidity: 120, ammonia: 300 };
const item = (report, key) => report.items.find(row => row.key === key);
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

async function main() {
  const before = JSON.stringify(input);
  let result = build({ ...input, maxAgeSeconds: ages });
  assert.equal(result.items.length, 5);
  assert.ok(result.items.every(row => row.severity === 'normal' && row.tankName === tank.tank_name && row.reason && row.action && row.safeRange));
  assert.equal(result.attentionCount, 0); assert.match(result.emptyMessage, /No current recommendations/);
  assert.match(item(result, 'temperature').timestampLabel, /8:00\s*PM/);
  assert.equal(item(result, 'ammonia').timestamp, scan.created_at.replace('Z', '.000Z'));
  assert.equal(item(result, 'temperature').timestamp, sensor.created_at.replace('Z', '.000Z'));
  assert.equal(JSON.stringify(input), before, 'Do not mutate measurements/configuration');

  result = build(input);
  assert.ok(result.items.every(row => row.severity === 'unverified'), 'No invented freshness window or false current Normal');
  assert.match(item(result, 'ammonia').reason, /manual scan/);
  result = build({ ...input, sensor: { ...sensor, temperature_c: 30.1, ph_value: 4 }, maxAgeSeconds: ages });
  assert.equal(item(result, 'temperature').severity, 'warning');
  assert.match(item(result, 'temperature').reason, /safe maximum.*30/i);
  assert.equal(item(result, 'ph').severity, 'critical'); assert.equal(result.items[0].key, 'ph');
  assert.match(item(result, 'ph').reason, /Critical boundary: 6/);
  assert.match(item(result, 'ph').action, /immediately/);
  const changed = build({ ...input, thresholds: { ...thresholds, temperatureMax: 26 }, maxAgeSeconds: ages });
  assert.equal(item(changed, 'temperature').severity, 'warning');
  assert.match(item(changed, 'temperature').safeRange, /26/);
  assert.equal(item(build({ ...input, maxAgeSeconds: ages }), 'temperature').severity, 'normal');
  for (const [key, field, value, boundary] of [
    ['temperature', 'temperature_c', 19.9, 'safe minimum: 20'],
    ['water', 'water_depth_cm', 4.4, 'safe minimum: 4.5'],
    ['ph', 'ph_value', 6.4, 'safe minimum: 6.5'],
    ['turbidity', 'turbidity_voltage', 2.4, 'safe minimum: 2.5 V'],
  ]) {
    const warning = item(build({ ...input, sensor: { ...sensor, [field]: value }, maxAgeSeconds: ages }), key);
    assert.equal(warning.severity, 'warning'); assert.ok(warning.reason.includes(boundary));
  }
  const ammoniaWarning = item(build({ ...input, scan: { ...scan, ammonia_level: 0.3 }, maxAgeSeconds: ages }), 'ammonia');
  assert.equal(ammoniaWarning.severity, 'warning'); assert.match(ammoniaWarning.safeRange, /0.25 ppm/);
  const secondTank = build({ ...input, tank: { id: 'B', tank_name: 'Tank B' },
    sensor: { ...sensor, tank_id: 'B' }, scan: { ...scan, tank_id: 'B' }, maxAgeSeconds: ages });
  assert.equal(item(secondTank, 'temperature').severity, 'normal');
  assert.equal(secondTank.tankName, 'Tank B');

  for (const [key, extra] of [['water', { water_status: 'SENSOR_STALE' }],
    ['water', { raw_payload: { water_state: { fresh: false, last_good_used: true } } }],
    ['ph', { raw_payload: { analog_state: { ph_fresh: false } } }],
    ['temperature', { raw_payload: { sensor_health: { temperature: { health: 'ERROR' } } } }],
    ['ph', { ph_status: 'SENSOR_ERROR' }], ['turbidity', { turbidity_status: 'UNKNOWN' }]]) {
    const value = item(build({ ...input, sensor: { ...sensor, ...extra }, maxAgeSeconds: ages }), key);
    assert.notEqual(value.severity, 'normal'); assert.equal(value.tone, 'neutral');
    assert.match(value.action, /new|valid/i);
  }
  const stale = build({ ...input, serverTime: '2026-10-12T12:01:00Z', maxAgeSeconds: ages });
  assert.ok(stale.items.every(row => row.severity === 'stale'));
  assert.ok(build({ ...input, serverTime: null, maxAgeSeconds: ages }).items.every(row => row.severity === 'unverified'));
  assert.ok(build({ ...input, sensor: null, scan: null }).items.every(row => row.severity === 'missing'));
  assert.ok(build({ ...input, thresholds: null }).items.every(row => row.severity === 'unavailable'));
  assert.ok(build({ ...input, dataAvailable: false }).items.every(row => row.severity === 'unavailable'));
  assert.ok(build({ ...input, sensor: { ...sensor, tank_id: 'B' } }).items.every(row => row.severity === 'unavailable' && row.value === null));
  assert.equal(item(build({ ...input, sensor: { ...sensor, temperature_c: 'broken' } }), 'temperature').severity, 'missing');
  assert.equal(item(build({ ...input, paired: false }), 'water').severity, 'unpaired');
  assert.equal(item(build({ ...input, scan: { ...scan, status: 'INVALID' } }), 'ammonia').severity, 'invalid');
  assert.equal(item(build({ ...input, sensor: { ...sensor, water_depth_cm: -1 } }), 'water').severity, 'invalid');
  assert.equal(item(build({ ...input, sensor: { ...sensor, created_at: '2026-10-11 20:00:00' } }), 'water').severity, 'invalid');
  assert.equal(evaluateMonitoring({ ...sensor, temperature_c: 34 }, thresholds, { historical: true }).metrics.temperature.severity, 'critical');
  assert.equal(item(build({ ...input, thresholds: DEFAULT_THRESHOLDS, sensor: { ...sensor, temperature_c: 34 }, maxAgeSeconds: ages }), 'temperature').severity, 'configuration');
  console.log('PASS five parameters, configured safe/critical bounds, severity sorting, exact source timestamps and invalid/stale/missing/unconfigured guards');

  const states = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/London', 'Asia/Manila'];
  const originalTZ = process.env.TZ;
  const snapshots = states.map(zone => { process.env.TZ = zone; return JSON.stringify(build(input)); });
  if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
  assert.equal(new Set(snapshots).size, 1);

  const fixture = { server_time: input.serverTime, sensor_readings: [{ ...sensor, user_id: 'user' }],
    ammonia_readings: [{ ...scan, user_id: 'user' }], tank_threshold_settings: [{ tank_id: 'A', user_id: 'user', thresholds }],
    iot_devices: [{ tank_id: 'A', user_id: 'user', is_claimed: true, device_type: 'sensor', device_uid:'sensor-A' }] };
  const env = environment(fixture), hook = env.load('src/hooks/useTankRecommendationData.js').default;
  env.render(hook, 'A'); const cleanup = env.effects[0](); await settle();
  assert.equal(env.state[0].dataAvailable, true); assert.equal(env.state[0].snapshot.sensors[0].id, sensor.id);
  assert.equal(env.state[0].snapshot.thresholds.A.temperatureMax, thresholds.temperatureMax);
  fixture.tank_threshold_settings[0].thresholds = { ...thresholds, temperatureMax: 26 };
  await env.intervals[0].fn(); await settle();
  assert.equal(env.state[0].snapshot.thresholds.A.temperatureMax, 26);
  fixture.errors = { sensor_readings: new Error('offline') };
  await env.intervals[0].fn(); await settle();
  assert.equal(env.state[0].dataAvailable, false); assert.match(env.state[0].error, /connected/);
  for (const query of env.queries.filter(row => ['sensor_readings', 'ammonia_readings', 'tank_threshold_settings'].includes(row.table))) {
    assert.ok(query.operations.some(([op, field, value]) => op === 'eq' && field === 'user_id' && value === 'user'));
    assert.ok(query.operations.some(([op, field, value]) => (op === 'eq' || op === 'in') && field === 'tank_id' && (value === 'A' || value.includes('A'))));
  }
  const switched = env.render(hook, 'B');
  assert.equal(switched.dataAvailable, false); assert.equal(switched.sensor, null);
  cleanup(); assert.equal(env.removed.length, 1); assert.equal(env.cleared.length, 1);
  console.log('PASS Manila timezone matrix, read-only scoped Supabase loads, threshold refresh, network failure, tank switch and cleanup');

  for (const mode of ['light', 'dark']) {
    let opened;
    const ui = harness({ mode, width: 320, overrides: { recommendationData: () => ({ tankId: 'A', loading: false, dataAvailable: true,
      sensor, scan, thresholds, paired: true, serverTime: input.serverTime }) } });
    ui.render('src/components/tank/TankRecommendations.js', { tank, colors: ui.palette[mode === 'dark' ? 'DARK_COLORS' : 'LIGHT_COLORS'], onOpenAiGuide: next => { opened = next; } });
    assert.ok(ui.texts.includes('Recommendations')); assert.ok(ui.texts.some(value => value.includes('Safe Limit:')));
    const buttons = ui.elements.filter(node => node.props.accessibilityRole === 'button');
    assert.ok(buttons.every(node => node.props.style.minHeight >= 44));
    buttons.find(node => node.props.accessibilityLabel === `Open AI Guide for ${tank.tank_name}`).props.onPress();
    assert.equal(opened.id, tank.id);
  }
  const panelSource = fs.readFileSync('src/components/tank/TankRecommendations.js', 'utf8');
  assert.ok(!/applyAiThresholdSuggestion|syncSensorAlerts|device_commands|\.insert\(|\.update\(/.test(panelSource));
  console.log('PASS accessible light/dark recommendations and selected-tank AI Guide entry; no action/Apply or write path');

  let currentData = { tankId: 'A', loading: false, dataAvailable: true, sensor, scan, thresholds,
    paired: true, serverTime: input.serverTime, refresh() {} };
  let aiCalls = 0, complete;
  const ai = harness({ overrides: { recommendationData: () => currentData,
    buildAiContext: async ({ tank: selected }) => { assert.equal(selected.id, 'A'); return { tank: { id: selected.id } }; },
    askAi: async ({ question }) => { aiCalls++; assert.ok(question.length <= 2000); assert.match(question, /status unchanged/);
      return new Promise(resolve => { complete = resolve; }); } } });
  ai.render('src/components/tank/TankRecommendations.js', { tank, colors: ai.palette.LIGHT_COLORS }); ai.flushEffects(); ai.render();
  const explain = () => ai.elements.find(node => node.props.accessibilityLabel === 'Explain recommendations with AI Guide');
  assert.equal(aiCalls, 0, 'AI is opt-in');
  const pending = explain().props.onPress(); const repeated = explain().props.onPress(); await settle();
  assert.equal(aiCalls, 1, 'Repeated taps do not duplicate provider requests');
  const beforeAnswer = [...ai.texts];
  complete({ answer: 'Inspect the tank manually.', action: 'suggest_fill', threshold_suggestion: { parameter: 'ph', min: 1 } });
  await pending; await repeated; ai.render();
  assert.ok(ai.texts.includes('Inspect the tank manually.'));
  assert.ok(beforeAnswer.filter(value => value.includes('Recency unverified') || value.includes('Safe Limit:')).every(value => ai.texts.includes(value)));
  assert.equal(ai.calls.length, 0, 'AI explanation cannot call a write or Apply');

  const obsolete = explain().props.onPress(); await settle();
  currentData = { ...currentData, thresholds: { ...thresholds, temperatureMax: 26 } };
  ai.render(); ai.flushEffects(); ai.render();
  complete({ answer: 'Obsolete explanation' }); await obsolete; ai.render();
  assert.ok(!ai.texts.includes('Obsolete explanation')); assert.ok(!ai.texts.includes('Inspect the tank manually.'));
  assert.ok(ai.texts.includes('Warning at saved reading'));
  ai.unmount();
  const failingAi = harness({ overrides: { recommendationData: () => currentData,
    askAi: async () => { throw new Error('offline'); } } });
  failingAi.render('src/components/tank/TankRecommendations.js', { tank, colors: failingAi.palette.LIGHT_COLORS });
  failingAi.flushEffects(); failingAi.render();
  await failingAi.elements.find(node => node.props.accessibilityLabel === 'Explain recommendations with AI Guide').props.onPress();
  failingAi.render(); assert.ok(failingAi.texts.some(value => value.includes('temporarily unavailable')));
  assert.ok(failingAi.texts.includes('Warning at saved reading'));
  const guide = harness({ seed: { loading: false, tanks: [
    { id: 'A', tank_name: 'Tank A', latest_sensor: sensor, latest_reading: sensor, monitoring_thresholds: thresholds },
    { id: 'B', tank_name: 'Tank B', latest_sensor: { ...sensor, tank_id: 'B' },
      latest_reading: { ...sensor, tank_id: 'B' }, monitoring_thresholds: thresholds },
  ] } });
  guide.render('src/screens/main/AiGuideScreen.js', { initialTankId: 'B' });
  assert.ok(guide.texts.includes('Tank B'), 'AI Guide opens the requested tank');
  console.log('PASS opt-in AI explanation, single-flight requests, unchanged deterministic output, ignored actions/Apply, stale-answer rejection and provider failure');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
