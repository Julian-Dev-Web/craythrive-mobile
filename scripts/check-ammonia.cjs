/* global __dirname */
// Actual mobile/Edge code with isolated fixtures. No live DB writes or APK build.
const assert = require('node:assert/strict');
const path = require('path');
const { environment, walk } = require('./check-sensor-monitoring.cjs');
const { harness } = require('./check-mobile-ui.cjs');
const { edge } = require('./check-ai-guide.cjs');
process.chdir(path.resolve(__dirname, '..'));

const sensorTime = new Date().toISOString();
const scanTime = '2020-01-02T06:15:00Z';
const sensor = { device_uid:'esp32', id: 'water-1', tank_id: 'tank', user_id: 'user', created_at: sensorTime,
  temperature_c: 26, ph_value: 7.2, turbidity_voltage: 3, water_depth_cm: 5,
  ammonia: 1, ammonia_level: 1, ammonia_status: 'CRITICAL', ammonia_created_at: sensorTime };
const scan = { id: 'scan-1', tank_id: 'tank', user_id: 'user', created_at: scanTime, ammonia_level: 0.1 };
const baseTank = { id: 'tank', user_id: 'user', tank_name: 'Audit Tank', has_paired_device: true };
const fixture = { tanks: [baseTank], profiles: [{ id: 'user', username: 'Farmer' }],
  sensor_readings: [sensor], ammonia_readings: [scan],
  iot_devices: [{ tank_id: 'tank', user_id: 'user', device_type: 'sensor', device_uid: 'esp32', is_claimed: true }] };

function sentContext(server) {
  const content = server.sent().messages.find(message => message.role === 'user').content;
  return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
}

async function main() {
  const env = environment(fixture);
  const monitor = env.load('src/utils/sensorMonitoring.js');
  const thresholds = env.load('src/utils/thresholdSettings.js').DEFAULT_THRESHOLDS;
  const before = JSON.stringify({ sensor, scan });
  const current = monitor.combineMonitoringReadings(sensor, scan);
  assert.equal(current.ammonia, 0.1, 'sensor uploads cannot override an older authoritative scan');
  assert.equal(current.created_at, sensorTime);
  assert.equal(current.ammonia_created_at, scanTime);
  assert.equal(JSON.stringify({ sensor, scan }), before, 'no input mutation/backfill');
  const water = monitor.normalizeSensorReading(sensor);
  assert.ok(!/ammonia/i.test(JSON.stringify(water)), 'all legacy ammonia aliases removed from water event');
  const missing = monitor.evaluateMonitoring(monitor.combineMonitoringReadings(sensor, null), thresholds);
  assert.equal(missing.sensorCondition, 'Incomplete data');
  assert.equal(missing.metrics.ammonia.value, null);
  assert.equal(missing.metrics.ammonia.displayValue, 'No Scan');
  assert.equal(missing.metrics.ammonia.tone, 'neutral');
  assert.match(missing.message, /Overall sensor condition: Incomplete data\. Ammonia: No Scan/);
  const zero = monitor.evaluateMonitoring(monitor.combineMonitoringReadings(sensor, { ...scan, ammonia_level: 0 }));
  assert.equal(zero.metrics.ammonia.displayValue, '0 ppm');
  assert.equal(zero.metrics.ammonia.severity, 'unverified');
  const invalid = monitor.evaluateMonitoring(monitor.combineMonitoringReadings(sensor, { ...scan, ammonia_level: -1 }));
  assert.equal(invalid.metrics.ammonia.value, null);
  assert.equal(invalid.metrics.ammonia.displayValue, 'No Reading');
  assert.match(invalid.metrics.ammonia.scanTimestampLabel, /2020/);
  const criticalScan = { ...scan, ammonia_level: 1 };
  const critical = monitor.evaluateMonitoring(monitor.combineMonitoringReadings(sensor, criticalScan), thresholds, { paired: false });
  assert.equal(critical.severity, 'configuration');
  assert.equal(critical.metrics.ammonia.severity, 'configuration');
  assert.match(critical.message, /Latest scan:.*2020/);
  assert.equal(monitor.combineMonitoringReadings(null, scan).created_at, null, 'scan cannot fabricate a water timestamp');
  console.log('PASS authoritative older/zero scan, separate timestamps, immutable records, missing/invalid scan, unconfigured Critical/age never implies current Normal');

  const history = monitor.buildMonitoringHistory([sensor, { ...sensor, id: 'water-2', created_at: '2020-01-02T06:10:00Z' },
    { ...sensor, id: 'water-3', created_at: '2020-01-02T06:20:00Z' }], [scan]);
  assert.equal(history.length, 4);
  assert.equal(history.filter(event => event.type === 'ammonia').length, 1);
  assert.equal(history[2].type, 'ammonia');
  assert.ok(history.filter(event => event.type === 'water').every(event => !/ammonia/i.test(JSON.stringify(event.reading))));
  const reports = env.load('src/screens/main/ReportsScreen.js', '\nexport { ReadingHistoryEvent, buildWeeklyScores };');
  for (const event of history) {
    const texts = [];
    walk(reports.ReadingHistoryEvent({ event, thresholds, colors: { muted: 'grey' } }), node => {
      if (node.type === 'Text') texts.push(node.props.children);
    });
    const content = JSON.stringify(texts);
    if (event.type === 'water') assert.doesNotMatch(content, /ammonia|ppm/i);
    else { assert.match(content, /Ammonia Reading/); assert.match(content, /0.1 ppm/); }
  }
  assert.notEqual(reports.buildWeeklyScores([sensor], thresholds, sensorTime).at(-1).score, 100, 'unverified recency cannot manufacture a Normal trend');
  assert.ok(reports.buildWeeklyScores([], thresholds, sensorTime).every(day => !day.hasData), 'no fabricated daily sensor samples');
  console.log('PASS chronological separate history events, water rows without ammonia, one scan and sensor-only daily trend');

  const ai = await env.load('src/services/aiGuideService.js').buildAiTankContext({ tank: baseTank });
  assert.equal(ai.latest_sensor.created_at, sensorTime);
  assert.ok(!/ammonia/i.test(JSON.stringify(ai.latest_sensor)));
  assert.ok(!/ammonia/i.test(JSON.stringify(ai.recent_sensor_readings)));
  assert.equal(ai.latest_ammonia.value, 0.1);
  assert.equal(ai.latest_ammonia.timestamp, scanTime);
  assert.match(ai.latest_ammonia.condition, /Recency unverified/);
  assert.equal(ai.ammonia_instruction, monitor.AMMONIA_CONTEXT_INSTRUCTION);
  assert.equal(ai.recent_ammonia_readings.length, 1);
  const noScanEnv = environment({ ...fixture, ammonia_readings: [] });
  const noScanAi = await noScanEnv.load('src/services/aiGuideService.js').buildAiTankContext({ tank: { ...baseTank, latest_ammonia: scan } });
  assert.equal(noScanAi.latest_ammonia, null, 'successful empty query cannot reuse stale cached scan');
  assert.match(noScanAi.rule_based_result.message, /Ammonia: No Scan/);
  const failed = environment({ ...fixture, errors: { ammonia_readings: new Error('scan fetch failed') } });
  await assert.rejects(failed.load('src/services/aiGuideService.js').buildAiTankContext({ tank: baseTank }), /scan fetch failed/);
  const fallback = env.load('src/utils/aiFallback.js').buildAiRuleFallback('What should I do first?', ai, 'AI_TIMEOUT');
  assert.match(fallback.answer, /manual scan, Latest scan:.*2020/);
  const missingFallback = env.load('src/utils/aiFallback.js').buildAiRuleFallback('What should I do first?', noScanAi, 'AI_TIMEOUT');
  assert.match(missingFallback.answer, /Ammonia: No Scan/);
  const criticalUnpairedAi = await environment({ ...fixture, iot_devices: [], ammonia_readings: [criticalScan] })
    .load('src/services/aiGuideService.js').buildAiTankContext({ tank: baseTank });
  const criticalUnpairedFallback = env.load('src/utils/aiFallback.js').buildAiRuleFallback('What should I do first?', criticalUnpairedAi, 'AI_TIMEOUT');
  assert.match(criticalUnpairedFallback.answer, /Overall sensor condition: No Data/);
  assert.match(criticalUnpairedFallback.answer, /Ammonia: Requires configuration/);
  console.log('PASS AI latest_sensor/latest_ammonia and recent histories separated, exact scan instruction, cached scan cannot mask absence/error, timestamp-aware fallback');

  const server = edge();
  assert.equal((await server.request({ question: 'Compare the latest and previous readings.', context: ai })).status, 200);
  const providerContext = sentContext(server);
  assert.equal(providerContext.latest_ammonia.timestamp, scanTime);
  assert.match(providerContext.latest_ammonia.condition, /Recency unverified/);
  assert.ok(!/ammonia/i.test(JSON.stringify(providerContext.latest_sensor)));
  assert.ok(!/ammonia/i.test(JSON.stringify(providerContext.recent_sensor_readings)));
  assert.equal(providerContext.ammonia_instruction, monitor.AMMONIA_CONTEXT_INSTRUCTION);
  assert.match(server.sent().messages[0].content, /No latest_ammonia means "No Scan"/);
  const legacy = edge();
  await legacy.request({ question: 'Is my tank safe?', context: { system: 'CrayThrive', tank: baseTank,
    latest_reading: sensor, recent_sensor_readings: [sensor], recent_ammonia_readings: [] } });
  const legacyContext = sentContext(legacy);
  assert.equal(legacyContext.latest_ammonia, null);
  assert.ok(!/ammonia/i.test(JSON.stringify(legacyContext.latest_reading)));
  assert.ok(!/ammonia/i.test(JSON.stringify(legacyContext.recent_sensor_readings)));
  const explicitAbsence = edge();
  await explicitAbsence.request({ question: 'Is my tank safe?', context: { ...ai,
    latest_sensor: null, latest_reading: sensor, latest_ammonia: null, recent_ammonia_readings: [ai.latest_ammonia] } });
  assert.equal(sentContext(explicitAbsence).latest_sensor, null);
  assert.equal(sentContext(explicitAbsence).latest_ammonia, null);
  console.log('PASS real Edge provider payload preserves separate scan context and strips embedded ammonia from legacy sensor/history payloads');

  for (const mode of ['light', 'dark']) for (const activeMode of ['ask', 'check']) {
    const app = harness({ mode, width: 320, seed: { loading: false, tanks: [{ ...baseTank,
      latest_reading: current, latest_sensor: water, latest_ammonia: scan, monitoring_thresholds: thresholds }], selectedTankId: 'tank', activeMode } });
    app.render('src/screens/main/AiGuideScreen.js');
    assert.ok(app.texts.some(text => text.includes('Latest scan:') && text.includes('2020')), `AI ${mode}/${activeMode}: own scan time visible`);
  }
  for (const mode of ['light', 'dark']) for (const savedScan of [null, criticalScan]) {
    const combined = monitor.combineMonitoringReadings(sensor, savedScan);
    const tank = { ...baseTank, latest_reading: combined, latest_sensor: water, latest_ammonia: savedScan,
      monitoring_thresholds: thresholds, reading_history: history, weekly_scores: [] };
    for (const name of ['DashboardScreen', 'TankDetailsScreen', 'ReportsScreen']) {
      const app = harness({ mode, width: 320, seed: { loading: false, tanks: [tank], selectedTankId: 'tank',
        latestReading: combined, latestSensorReading: water, latestAmmoniaReading: savedScan,
        devices: fixture.iot_devices, thresholds } });
      app.render(`src/screens/main/${name}.js`, name === 'TankDetailsScreen' ? { tank } : {});
      if (!savedScan) assert.ok(app.texts.some(text => text.includes('No Scan')), `${name}/${mode}: explicit No Scan`);
      else {
        assert.ok(app.texts.some(text => text.includes('Requires configuration')), `${name}/${mode}: unconfigured Critical limit`);
        assert.ok(app.texts.some(text => text.includes('Latest scan:') && text.includes('2020')), `${name}/${mode}: own scan timestamp`);
      }
    }
  }
  const customCurrent = monitor.combineMonitoringReadings(sensor, { ...scan, ammonia_level: 0.5 });
  const customThresholds = { ...thresholds, ammoniaMax: 0.75 };
  const customUi = harness({ seed: { loading: false, tanks: [{ ...baseTank, latest_reading: customCurrent,
    latest_sensor: water, latest_ammonia: { ...scan, ammonia_level: 0.5 }, monitoring_thresholds: customThresholds }], selectedTankId: 'tank' } });
  customUi.render('src/screens/main/AiGuideScreen.js');
  assert.ok(customUi.texts.some(text => text.includes('Recency unverified')),
    'A saved safe scan still requires a reading-age policy before claiming current Normal');
  console.log('PASS actual Dashboard/Tank Details/Reports/AI Ask+Check render No Scan and own old/Critical timestamp in both themes at 320px');

  const calls = [];
  const alertEnv = harness({ overrides: { supabase: { from() { throw new Error('No phone-generated alerts'); },
    async rpc(name, args) { calls.push({name,args}); return {data:null,error:null}; } } } });
  const alerts = alertEnv.load('src/utils/sensorAlertRules.js');
  assert.equal(alerts.buildSensorAlerts(sensor, thresholds).length, 0, 'embedded ammonia cannot create a continuous sensor alert');
  await alerts.syncAmmoniaAlertsForScan({ userId: 'user', tankId: 'tank', scan: criticalScan, thresholds });
  await alerts.syncAmmoniaAlertsForScan({ userId: 'user', tankId: 'tank', scan: criticalScan, thresholds });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.name === 'reconcile_tank_classification' && call.args.p_tank_id === 'tank'));
  console.log('PASS scan alert reconciliation is owner-scoped and server-owned; no client inserts or invented timestamps');
  const savedRow = { ...scan, id: 'saved-scan', created_at: sensorTime }, writes = [];
  const saver = harness({ overrides: { supabase: { auth: { async getUser() { return { data: {user: {id:'user'}} }; } },
    from(table) { assert.equal(table,'ammonia_readings'); return {
      insert(payload) { writes.push(payload); return this; }, select(fields) { assert.match(fields,/created_at/); return this; },
      async single() { return {data:savedRow,error:null}; }
    }; } } } });
  assert.equal(await saver.load('src/utils/ammoniaReadings.js').saveAmmoniaReading({tankId:'tank',result:{shouldSave:true,ammoniaLevel:0.1,status:'SAFE'}}),savedRow);
  assert.equal(writes[0].tank_id,'tank'); assert.ok(!Object.hasOwn(writes[0],'created_at'),'database owns scan creation time');
  for (const mode of ['light','dark']) {
    const preview = harness({mode,seed:{activeMode:'manual',result:{status:'SAFE',shouldSave:true,ammoniaLevel:0.1},thresholds}});
    preview.render('src/screens/main/AmmoniaReaderScreen.js',{tank:baseTank});
    assert.ok(preview.texts.some(text=>text.includes('Unsaved preview')),'unsaved result cannot pretend to be a current stored scan');
  }
  console.log('PASS save returns database timestamp; no phone timestamp in insert; unsaved scan preview labelled in both themes');
  console.log('Ammonia audit checks passed. No live database actions or APK build.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
