/* global __dirname */
// Offline acceptance checks: no live values, threshold writes or hardware actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { harness } = require('./check-mobile-ui.cjs');
const { environment } = require('./check-sensor-monitoring.cjs');
const thresholdClient = require('./threshold-test-client.cjs');
process.chdir(path.resolve(__dirname, '..'));
const rules = harness().load('src/utils/thresholdSettings.js');
const reading = { temperature_c: 27, temperature: 27, ph_value: 7, ph: 7,
  water_depth_cm: 3.5, turbidity_voltage: 3.1, ammonia: 0.15,
  has_ammonia_scan: true, ammonia_created_at: '2026-10-11T12:00:00Z', created_at: '2026-10-11T12:01:00Z' };
const values = { temperatureMin: 21.5, temperatureMax: 29, phMin: 6.8, phMax: 8.1,
  waterLevelMin: 2, turbidityMax: 2.7, ammoniaMax: 0.3 };
const expected = ['Safe Range: 21.5–29 °C', 'Safe Range: 6.8–8.1', 'Safe Limit: ≥ 2 cm',
  'Safe Limit: ≥ 2.7 V', 'Safe Limit: ≤ 0.3 ppm'];
const settle = async () => { for (let index = 0; index < 80; index++) await Promise.resolve(); };

function refreshHarness(client) {
  const effects = [], callbacks = [], channels = [], timers = [], removed = [], cleared = [];
  let appListener, listenerRemoved = false;
  client.channel = name => {
    const channel = { name, events: [], on(event, filter, fn) { channel.events.push({ filter, fn }); return channel; }, subscribe() {} };
    channels.push(channel); return channel;
  };
  client.removeChannel = channel => removed.push(channel);
  const resolver = harness().load('src/utils/thresholdResolution.js');
  const exports = {};
  const compiled = babel.transformSync(fs.readFileSync('src/hooks/useThresholdRefresh.js', 'utf8'), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(compiled, { exports, console: { log() {} },
    setInterval(fn, delay) { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearInterval(timer) { cleared.push(timer); }, require(name) {
      if (name === 'react') return { useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) };
      if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener(event, fn) {
        appListener = fn; return { remove() { listenerRemoved = true; } };
      } } };
      if (name.endsWith('/supabase')) return { supabase: client };
      return { fetchTankThresholdSettings: (user, ids) => resolver.fetchEffectiveThresholdsForTanks(client, user, ids) };
    } });
  exports.default(['tank-A', 'tank-B', 'tank-C'], value => callbacks.push(value));
  const cleanups = effects.map(fn => fn());
  return { callbacks, channels, timers, removed, cleared,
    appState: next => appListener(next), cleanup() { cleanups.forEach(fn => fn?.()); },
    get listenerRemoved() { return listenerRemoved; } };
}

async function main() {
  const before = JSON.stringify(reading), configured = JSON.stringify(values);
  const evaluated = rules.evaluateMonitoring(reading, values);
  assert.deepEqual(Object.values(evaluated.metrics).map(metric => metric.safeRangeLabel).sort(), [...expected].sort());
  assert.equal(evaluated.metrics.water.label, 'Recency unverified');
  assert.equal(evaluated.metrics.turbidity.unit, 'V');
  assert.equal(rules.evaluateMonitoring({ ...reading, turbidity_voltage: 2.6 }, values).metrics.turbidity.label, 'Requires configuration');
  assert.equal(rules.evaluateMonitoring({ ...reading, ammonia: 0.4 }, values).metrics.ammonia.label, 'Requires configuration · saved scan');
  assert.equal(rules.evaluateMonitoring({ ...reading, water_depth_cm: 0.1 }, values).metrics.water.label, 'Requires configuration');
  assert.equal(JSON.stringify(reading), before); assert.equal(JSON.stringify(values), configured);
  assert.equal(rules.evaluateMonitoring(reading, { ...values, waterLevelMax: 4 }).metrics.water.safeRangeLabel,
    'Safe Range: 2–4 cm', 'Explicit configured water maxima are now supported');

  for (const mode of ['light', 'dark']) {
    for (const compact of [true, false]) {
      const app = harness({ mode, width: 320 });
      for (const metric of Object.values(evaluated.metrics)) {
        app.render('src/components/tank/SensorReadingCard.js', { metric, compact, colors: app.palette[mode === 'dark' ? 'DARK_COLORS' : 'LIGHT_COLORS'] });
        assert.ok(app.texts.includes(metric.safeRangeLabel));
        assert.ok(app.texts.includes(metric.displayValue));
        assert.ok(app.texts.includes(metric.label));
      }
    }
  }
  const missing = rules.evaluateMonitoring(null, values);
  const zero = rules.evaluateMonitoring({ temperature_c: 0, ph_value: 0, water_depth_cm: 0, turbidity_voltage: 0, ammonia: 0 }, values);
  assert.ok(Object.values(zero.metrics).every(metric => metric.value === 0 && metric.severity !== 'missing' && metric.safeRangeLabel));
  for (const metric of Object.values(missing.metrics)) {
    assert.equal(metric.severity, 'missing'); assert.equal(metric.tone, 'neutral');
    const app = harness();
    app.render('src/components/tank/SensorReadingCard.js', { metric, colors: app.palette.LIGHT_COLORS });
    assert.ok(app.texts.includes(metric.key === 'ammonia' ? 'No Scan' : 'No Reading'));
    assert.ok(!app.texts.includes('Normal')); assert.ok(app.texts.includes(metric.safeRangeLabel));
  }
  const tank = { id: 'tank-A', tank_name: 'Tank A', monitoring_thresholds: values,
    latest_reading: reading, latest_sensor: reading, has_paired_device: true,
    sensor_readings: [reading], alerts: [], control_logs: [], reading_history: [], weekly_scores: [] };
  for (const name of ['DashboardScreen', 'TankDetailsScreen', 'ReportsScreen', 'AiGuideScreen']) {
    const app = harness({ seed: { loading: false, tanks: [tank], selectedTankId: tank.id,
      latestReading: reading, latestSensorReading: reading, thresholds: values, activeMode: 'check', devices: [{ id: 'sensor' }] } });
    app.render(`src/screens/main/${name}.js`, { tank });
    for (const label of expected) assert.ok(app.texts.includes(label), `${name}: ${label}`);
  }
  const ai = harness({ seed: { loading: false, tanks: [tank], selectedTankId: tank.id, activeMode: 'ask' } });
  ai.render('src/screens/main/AiGuideScreen.js');
  for (const label of [expected[0], expected[1], expected[4]]) assert.ok(ai.texts.includes(label), `AI context: ${label}`);
  const scanner = harness({ seed: { thresholds: values, result: { status: 'Normal', ammoniaLevel: 0.15 }, activeMode: 'manual' } });
  scanner.render('src/screens/main/AmmoniaReaderScreen.js', { tank });
  assert.ok(scanner.texts.includes(expected[4]), 'Ammonia result card includes selected-tank limit');
  console.log('PASS five dynamic bounds, real Dashboard/Tank Details/Reports/AI cards, manual result, light/dark compact cards and neutral missing readings');

  // Execute actual screen refresh callbacks, not just the shared hook fixture.
  for (const name of ['DashboardScreen', 'ReportsScreen', 'AiGuideScreen', 'TankDetailsScreen']) {
    const data = { server_time: '2026-10-11T13:02:55Z',
      tanks: ['tank-A', 'tank-B', 'tank-C'].map(id => ({ id, user_id: 'user', tank_name: id })),
      tank_threshold_settings: [
        { tank_id: 'tank-A', user_id: 'user', water_level_min: 2 },
        { tank_id: 'tank-B', user_id: 'user', water_level_min: 3 },
      ], threshold_settings: [{ user_id: 'user', water_level_min: 4.5 }],
      sensor_readings: ['tank-A', 'tank-B', 'tank-C'].map(tank_id => ({ ...reading, tank_id, user_id: 'user' })),
    };
    const env = environment(data), screen = env.load(`src/screens/main/${name}.js`).default;
    env.render(screen, { tank: data.tanks[0] });
    env.effects.find(fn => /loadDashboard|loadReports|loadGuideData|loadTankDetails/.test(fn.toString()))();
    await settle();
    env.render(screen, { tank: data.tanks[0] });
    const cleanup = env.effects.find(fn => fn.toString().includes('JSON.parse(idsKey)'))();
    await settle();
    data.tank_threshold_settings[0].water_level_min = 2.8;
    data.threshold_settings[0].water_level_min = 4.2;
    await env.intervals.find(timer => timer.delay === 60000).fn(); await settle();
    if (name === 'TankDetailsScreen') {
      assert.ok(env.state.some(value => value?.waterLevelMin === 2.8));
    } else {
      const refreshed = env.state.find(value => Array.isArray(value) && value[0]?.monitoring_thresholds);
      assert.equal(refreshed[0].monitoring_thresholds.waterLevelMin, 2.8, name);
      assert.equal(refreshed[1].monitoring_thresholds.waterLevelMin, 3, name);
      assert.equal(refreshed[2].monitoring_thresholds.waterLevelMin, 4.2, name);
      if (name === 'ReportsScreen') {
        assert.equal(refreshed[0].weekly_scores.length, 7);
        assert.equal(refreshed[0].weekly_scores[6].dayKey, '2026-10-11');
      }
    }
    cleanup();
  }
  console.log('PASS actual screen refresh state updates selected-tank limits, preserves other overrides and refreshes inherited account limits/report period');

  const errors = {};
  const fixture = thresholdClient({ tanks: ['tank-A', 'tank-B', 'tank-C'], errors,
    legacy: { user_id: 'user', water_level_min: 4.5 }, rows: [
      { user_id: 'user', tank_id: 'tank-A', thresholds: { ...values, waterLevelMin: 2 } },
      { user_id: 'user', tank_id: 'tank-B', thresholds: { ...values, waterLevelMin: 3 } },
    ] });
  const live = refreshHarness(fixture.db);
  await settle();
  const limit = (id, index = live.callbacks.length - 1) => rules.evaluateMonitoring(reading, live.callbacks[index][id]).metrics.water.safeRangeLabel;
  assert.equal(limit('tank-A'), 'Safe Limit: ≥ 2 cm'); assert.equal(limit('tank-B'), 'Safe Limit: ≥ 3 cm');
  assert.equal(limit('tank-C'), 'Safe Limit: ≥ 4.5 cm');
  assert.equal(live.timers[0].delay, 60000);
  assert.deepEqual(live.channels[0].events.map(event => event.filter.table), ['tank_threshold_settings', 'threshold_settings']);
  assert.ok(live.channels[0].events.every(event => event.filter.filter === 'user_id=eq.user'));
  fixture.state.rows.get('tank-A').thresholds.waterLevelMin = 2.5;
  await live.channels[0].events[0].fn(); await settle();
  assert.equal(limit('tank-A'), 'Safe Limit: ≥ 2.5 cm'); assert.equal(limit('tank-B'), 'Safe Limit: ≥ 3 cm');
  fixture.state.legacy.water_level_min = 4;
  await live.channels[0].events[1].fn(); await settle();
  assert.equal(limit('tank-C'), 'Safe Limit: ≥ 4 cm'); assert.equal(limit('tank-B'), 'Safe Limit: ≥ 3 cm');
  fixture.state.rows.get('tank-A').thresholds.waterLevelMin = 2.7;
  await live.timers[0].fn(); await settle();
  assert.equal(limit('tank-A'), 'Safe Limit: ≥ 2.7 cm', 'Fallback polling works without realtime delivery');
  const count = fixture.state.queries.length;
  live.appState('background'); await live.timers[0].fn();
  assert.equal(fixture.state.queries.length, count, 'No threshold polling in background');
  fixture.state.rows.get('tank-B').thresholds.waterLevelMin = 3.2;
  live.appState('active'); await settle(); assert.equal(limit('tank-B'), 'Safe Limit: ≥ 3.2 cm');
  const lastGood = live.callbacks.length;
  errors.tank_threshold_settings = new Error('Offline');
  await live.timers[0].fn(); await settle(); assert.equal(live.callbacks.length, lastGood, 'Failed read preserves last successful values');
  delete errors.tank_threshold_settings;
  live.cleanup(); const queriesAtCleanup = fixture.state.queries.length;
  await live.timers[0].fn(); await live.channels[0].events[0].fn();
  assert.equal(fixture.state.queries.length, queriesAtCleanup);
  assert.equal(live.removed.length, 1); assert.equal(live.cleared.length, 1); assert.equal(live.listenerRemoved, true);
  assert.equal(fixture.state.writes.length, 0, 'Range refresh never applies thresholds or sends commands');
  console.log('PASS actual refresh hook: per-tank isolation, account inheritance, realtime, 60-second fallback, foreground refresh, read failure and cleanup; zero mutations');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
