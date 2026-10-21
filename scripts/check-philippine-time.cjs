/* global __dirname */
// Actual utilities/screens under different process timezones and a falsified clock.
// No hardware, real notifications, billable provider requests or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const { harness } = require('./check-mobile-ui.cjs');
const { environment } = require('./check-sensor-monitoring.cjs');
process.chdir(path.resolve(__dirname, '..'));
const fixedNow = '2026-10-11T13:02:55.000Z';
const readingTime = '2026-10-11T12:00:00Z';
const time = harness().load('src/utils/philippineTime.js');
function compile(file) {
  return babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
}
function clockHarness({ error = null, result = fixedNow } = {}) {
  let wrongEpoch = Date.parse('2040-01-01T12:00:00Z'), tick = 100;
  const db = { async rpc(name) { assert.equal(name, 'craythrive_server_time'); return { data: result, error }; } };
  class WrongDate extends Date {
    constructor(...args) { super(...(args.length ? args : [wrongEpoch])); }
    static now() { return wrongEpoch; }
  }
  const exports = {};
  vm.runInNewContext(compile('src/utils/serverClock.js'), { exports, Date: WrongDate,
    performance: { now: () => tick }, require: name => name.endsWith('/supabase') ? { supabase: db } : time });
  return { clock: exports, advance: () => { wrongEpoch = Date.parse('2000-01-01T00:00:00Z'); tick += 60000; } };
}
async function main() {
  assert.equal(time.PHILIPPINE_TIME_ZONE, 'Asia/Manila');
  assert.equal(time.formatPhilippineTime(readingTime).replace(/\s+/g, ' '), '8:00 PM');
  const storedAlert = `Ammonia scan: 0.10 ppm. Scan timestamp: ${readingTime}.`;
  assert.equal(time.formatPhilippineAlertMessage(storedAlert),
    'Ammonia scan: 0.10 ppm. Scan timestamp: Oct 11, 2026, 8:00 PM PhST.');
  assert.equal(time.formatPhilippineAlertMessage('Pump completed.'), 'Pump completed.');
  assert.equal(storedAlert.endsWith(`${readingTime}.`), true, 'Saved scan identity remains unchanged');
  assert.equal(time.manilaDateKey('2026-10-10T16:00:00Z'), '2026-10-11');
  const range = time.manilaDayRange('2026-10-11');
  assert.equal(range.start, '2026-10-10T16:00:00.000Z');
  assert.equal(range.end, '2026-10-11T16:00:00.000Z');
  const inDay = value => Date.parse(value) >= Date.parse(range.start) && Date.parse(value) < Date.parse(range.end);
  assert.equal(inDay('2026-10-10T15:59:59.999Z'), false);
  assert.equal(inDay('2026-10-10T16:00:00Z'), true);
  assert.equal(inDay('2026-10-11T15:59:59.999Z'), true);
  assert.equal(inDay('2026-10-11T16:00:00Z'), false);
  assert.equal(time.shiftManilaDate('2026-01-01', -1), '2025-12-31');
  assert.equal(time.shiftManilaDate('2028-02-28', 1), '2028-02-29');
  for (const value of ['2026-02-30', '2026-13-01', 'not-a-date']) assert.throws(() => time.manilaDayRange(value));
  for (const value of [null, '', '2026-10-11', '2026-10-11 12:00:00', 'not-a-date']) assert.equal(time.parseTimestamp(value), null);
  assert.equal(time.parseTimestamp('2026-10-11 12:00:00+00').toISOString(), '2026-10-11T12:00:00.000Z');
  assert.equal(time.parseTimestamp(new Date(readingTime)).toISOString(), '2026-10-11T12:00:00.000Z');

  const local = clockHarness();
  assert.equal(local.clock.getServerNow(), null, 'Unsynchronized clock does not fall back to the device');
  assert.equal(await local.clock.fetchServerTime(), fixedNow);
  local.advance();
  assert.equal(local.clock.getServerNow().toISOString(), '2026-10-11T13:03:55.000Z');
  assert.equal(time.manilaDateKey(local.clock.getServerNow()), '2026-10-11');
  await assert.rejects(clockHarness({ error: new Error('offline') }).clock.fetchServerTime(), /offline/);
  await assert.rejects(clockHarness({ result: '2026-10-11 12:00:00' }).clock.fetchServerTime(), /verify server time/);

  // Real screen helper functions must agree on the same record, not just utilities.
  for (const [file, name] of [
    ['components/ui/NotificationBell', 'formatDateTime'], ['screens/main/ReportsScreen', 'formatDateTime'],
    ['screens/main/TankDetailsScreen', 'formatDateTime'], ['screens/main/AiGuideScreen', 'formatShortDate'],
    ['screens/main/MarketplaceChatScreen', 'formatMessageTime'], ['screens/main/DashboardScreen', 'formatRelativeTime'],
  ]) {
    const helper = environment().load(`src/${file}.js`, `\nexport { ${name} };`)[name];
    assert.match(helper(readingTime), /8:00\s*PM/, file);
  }
  const chat = environment().load('src/screens/main/MarketplaceChatScreen.js', '\nexport { buildMessageTimeline };');
  const chatMessages = [{ id: 'late', created_at: '2026-10-11T01:00:00+08:00' },
    { id: 'early', created_at: '2026-10-10T15:59:59Z' }, { id: 'midnight', created_at: '2026-10-10T16:00:00Z' }];
  const chatBefore = JSON.stringify(chatMessages);
  const timeline = chat.buildMessageTimeline(chatMessages);
  assert.equal(timeline.filter(item => item.type === 'message').map(item => item.message.id).join(','), 'early,midnight,late');
  assert.equal(timeline.filter(item => item.type === 'date').map(item => item.key).join(','), 'date-2026-10-10,date-2026-10-11');
  assert.equal(JSON.stringify(chatMessages), chatBefore);

  const sensor = { id: 'at-midnight', user_id: 'user', tank_id: 'tank', device_uid:'sensor-tank', created_at: range.start,
    temperature_c: 26, ph_value: 7, turbidity_voltage: 3, water_depth_cm: 5 };
  const fixture = { server_time: fixedNow, tanks: [{ id: 'tank', user_id: 'user' }], sensor_readings: [sensor],
    iot_devices:[{user_id:'user',tank_id:'tank',is_claimed:true,device_type:'sensor_hub',device_uid:'sensor-tank'}],
    alerts: [{ id: 'older', tank_id: 'tank', created_at: '2026-10-10T16:00:00Z' },
      { id: 'newer', tank_id: 'tank', created_at: '2026-10-11T12:00:00Z' },
      { id: 'tomorrow', tank_id: 'tank', created_at: range.end }],
    control_logs: [{ id: 'activity', tank_id: 'tank', created_at: range.start }] };
  const reportsEnv = environment(fixture);
  const reports = reportsEnv.load('src/screens/main/ReportsScreen.js', '\nexport { buildWeeklyScores };');
  reportsEnv.render(reports.default);
  reportsEnv.effects.find(fn => /loadReports/.test(fn.toString()))();
  for (let tick = 0; tick < 100; tick++) await Promise.resolve();
  const tank = reportsEnv.state.find(value => Array.isArray(value) && value[0]?.weekly_scores)?.[0];
  assert.ok(tank, 'Report loads using verified server time');
  assert.equal(tank.weekly_scores.at(-1).dayKey, '2026-10-11');
  assert.equal(tank.weekly_scores.at(-1).hasData, true, '00:00 Philippine reading belongs to the selected Philippine day');
  assert.equal(tank.alerts.map(row => row.id).join(','), 'newer,older', 'Reports retain descending authoritative alert order');
  for (const query of reportsEnv.queries.filter(query => query.operations.some(([op]) => op === 'gte'))) {
    assert.ok(query.operations.some(([op, key, value]) => op === 'gte' && key === 'created_at' && value === '2026-10-04T16:00:00.000Z'));
    assert.ok(query.operations.some(([op, key, value]) => op === 'lt' && key === 'created_at' && value === range.end));
  }
  assert.equal(reports.buildWeeklyScores([sensor], {}, null).length, 0, 'No invented today without server reference');
  const monitor = reportsEnv.load('src/utils/sensorMonitoring.js');
  const original = JSON.stringify(sensor);
  const history = monitor.buildMonitoringHistory([sensor, { ...sensor, id: 'later', created_at: readingTime }],
    [{ id: 'scan', created_at: '2026-10-11T01:00:00+08:00', ammonia_level: 0.1 }]);
  assert.equal(history.map(event => event.reading.id).join(','), 'later,scan,at-midnight');
  assert.equal(JSON.stringify(sensor), original);

  const mutations = [], operations = [], reconciliations = [];
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    rpc: async (name, args) => { if (name === 'reconcile_tank_classification') { reconciliations.push(args); return {data:{policy:'configured-v1'}}; }
      assert.equal(name, 'craythrive_server_time'); return { data: fixedNow }; },
    from(table) { let payload; const ops = [];
      const query = new Proxy({}, { get(object, name) {
        if (name === 'then') return resolve => { operations.push({ table, ops }); if (payload) mutations.push({ table, payload }); return Promise.resolve({ data: [], error: null }).then(resolve); };
        return (...args) => { ops.push([name, ...args]); if (['insert', 'update'].includes(name)) payload = args[0]; return query; };
      } }); return query;
    } };
  const app = harness({ overrides: { supabase: db } });
  await app.load('src/utils/ammoniaReadings.js').saveAmmoniaReading({ tankId: 'tank', result: {
    shouldSave: true, ammoniaLevel: 0.1, status: 'Normal', measuredAt: '2040-01-01T00:00:00Z' } });
  assert.equal(Object.hasOwn(mutations[0].payload, 'created_at'), false, 'Device scan time never overrides database creation time');
  const rules = app.load('src/utils/sensorAlertRules.js');
  await rules.syncSensorAlertsForReading({ userId: 'user', tankId: 'tank', reading: { ...sensor, water_depth_cm: 0.6 } });
  assert.equal(reconciliations.length,1);assert.equal(reconciliations[0].p_tank_id,'tank');
  assert.ok(!mutations.some(item => item.table === 'alerts'),'Condition alert timestamps/cooldowns/resolution stay in the server transaction');
  const chatSource = fs.readFileSync('src/screens/main/MarketplaceChatScreen.js', 'utf8');
  const readReceipt = parser.parse(chatSource, { sourceType: 'module', plugins: ['jsx'] }).program.body
    .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'markReceivedMessagesAsRead');
  const receiptSandbox = { supabase: db, fetchServerTime: app.load('src/utils/serverClock.js').fetchServerTime, console: { log() {} } };
  vm.runInNewContext(chatSource.slice(readReceipt.start, readReceipt.end), receiptSandbox);
  await receiptSandbox.markReceivedMessagesAsRead('thread', 'user');
  assert.ok(mutations.some(item => item.table === 'marketplace_chat_messages' && item.payload.read_at === fixedNow),
    'Actual chat read receipt uses database time');

  if (process.argv.includes('--timezone-case')) {
    console.log(JSON.stringify({ zone: process.env.TZ, time: time.formatPhilippineTime(readingTime), range }));
    return;
  }
  console.log('PASS Philippine display, explicit-offset parsing, day boundaries, leap/calendar handling and immutable chronology');
  console.log('PASS real screen formatters, chat date separators, report filters/grouping, alert ordering and separate scan history');
  console.log('PASS wrong device clock cannot set server-time anchor, alert cooldown/resolution or ammonia creation timestamp');
  for (const zone of ['Asia/Manila', 'America/New_York', 'Asia/Tokyo', 'Europe/London', 'UTC']) {
    const child = spawnSync(process.execPath, [__filename, '--timezone-case'], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr || child.stdout);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.time, '8:00 PM'); assert.equal(result.range.start, range.start); assert.equal(result.range.end, range.end);
    console.log('PASS alternate device timezone: ' + zone);
  }
  console.log('Philippine timezone checks passed. Actual React/Vite web and physical phone verification are separate.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
