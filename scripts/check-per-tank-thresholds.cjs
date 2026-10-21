/* global __dirname */
// Offline client/Edge checks. Live RLS/RPC validation uses rollback-only SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./check-mobile-ui.cjs');
const thresholdClient = require('./threshold-test-client.cjs');
const { edge } = require('./check-ai-guide.cjs');
const { context } = require('./check-ai-conversations.cjs');
const { environment, walk } = require('./check-sensor-monitoring.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
  assert.equal(fs.readFileSync(path.join(root, 'src/utils/thresholdResolution.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'supabase/functions/_shared/thresholdResolution.js'), 'utf8').replace("'./classificationPolicy.js'", "'./classificationPolicy'"));
  const fixture = thresholdClient({ tanks: ['tank-A', 'tank-B', 'tank-C'],
    legacy: { user_id: 'user', thresholds: { waterLevelMin: 4.5 } },
    rows: [{ user_id: 'user', tank_id: 'tank-A', thresholds: { waterLevelMin: 4 } },
      { user_id: 'user', tank_id: 'tank-B', thresholds: { waterLevelMin: 4.2, phMin: 7.1 } }],
  });
  const app = harness({ overrides: { supabase: fixture.db } });
  const rules = app.load('src/utils/thresholdSettings.js');
  const service = app.load('src/services/aiGuideService.js');
  assert.equal((await rules.fetchThresholdSettings('user', 'tank-A')).waterLevelMin, 4);
  assert.equal((await rules.fetchThresholdSettings('user', 'tank-B')).waterLevelMin, 4.2);
  assert.equal((await rules.fetchThresholdSettings('user', 'tank-C')).waterLevelMin, 4.5);
  const batch = await rules.fetchTankThresholdSettings('user', ['tank-A', 'tank-B', 'tank-C']);
  assert.deepEqual(Object.fromEntries(Object.entries(batch).map(([id, value]) => [id, value.waterLevelMin])),
    { 'tank-A': 4, 'tank-B': 4.2, 'tank-C': 4.5 });
  const empty = harness({ overrides: { supabase: thresholdClient().db } }).load('src/utils/thresholdSettings.js');
  assert.equal((await empty.fetchThresholdSettings('user', 'tank-1')).waterLevelMin, 4.5);
  assert.equal(rules.normalizeThresholds({ thresholds: {}, water_level_min: '3.7' }).waterLevelMin, 3.7);
  const legacyBefore = JSON.stringify(fixture.state.legacy);
  const tankBefore = JSON.stringify(fixture.state.rows.get('tank-B'));
  const proposal = { parameter: 'water_level', suggested_value: 3.5 };
  const accepted = await service.applyAiThresholdSuggestion({ tankId: 'tank-A', suggestion: proposal });
  assert.equal(accepted.thresholds.waterLevelMin, 3.5);
  assert.deepEqual(fixture.state.writes[0], { p_tank_id: 'tank-A', p_patch: { water_level_min: 3.5 },
    p_scope: 'single_tank', p_source: 'ai_recommendation' });
  assert.equal(JSON.stringify(fixture.state.legacy), legacyBefore);
  assert.equal(JSON.stringify(fixture.state.rows.get('tank-B')), tankBefore);
  // A second client reloads the same canonical persisted value; this does not
  // substitute for testing the user's actual React/Vite web frontend.
  const secondClient = harness({ overrides: { supabase: fixture.db } }).load('src/utils/thresholdSettings.js');
  assert.equal((await secondClient.fetchThresholdSettings('user', 'tank-A')).waterLevelMin, 3.5);
  await secondClient.applyTankThresholdPatch({ tankId: 'tank-A', patch: { water_level_min: 3.7 } });
  assert.equal((await rules.fetchThresholdSettings('user', 'tank-A')).waterLevelMin, 3.7);
  await rules.applyTankThresholdPatch({ tankId: 'tank-A', patch: { water_level_min: 4 }, scope: 'all_tanks' });
  for (const id of ['tank-A', 'tank-B', 'tank-C']) assert.equal((await rules.fetchThresholdSettings('user', id)).waterLevelMin, 4);
  assert.equal(rules.normalizeThresholds(fixture.state.legacy).waterLevelMin, 4);
  assert.equal((await rules.fetchThresholdSettings('user', 'tank-B')).phMin, 7.1, 'Apply All preserves unrelated per-tank fields');
  const writes = fixture.state.writes.length;
  await assert.rejects(service.applyAiThresholdSuggestion({ suggestion: proposal }), /Select a tank/);
  assert.equal(fixture.state.writes.length, writes);
  await assert.rejects(rules.applyTankThresholdPatch({ tankId: 'foreign', patch: { water_level_min: 3.5 } }), /ownership/);
  const failed = thresholdClient({ legacy: fixture.state.legacy, errors: { tank_threshold_settings: new Error('canonical read failed') } });
  await assert.rejects(harness({ overrides: { supabase: failed.db } }).load('src/utils/thresholdSettings.js')
    .fetchThresholdSettings('user', 'tank-A'), /canonical read failed/);
  assert.ok(!failed.state.queries.some(query => query.table === 'threshold_settings'), 'failed reads never masquerade as absent rows');
  for (const query of fixture.state.queries.filter(query => query.table === 'tank_threshold_settings')) {
    assert.ok(query.filters.some(([op, key, value]) => op === 'eq' && key === 'user_id' && value === 'user'));
    assert.ok(query.filters.some(([, key]) => key === 'tank_id'));
  }
  console.log('PASS canonical/legacy/default resolution, partial JSON/column consistency, single-tank isolation, independent reload, Apply All patch/mirror, missing tank and failed reads');

  const screensData = { tanks: ['tank-A', 'tank-B'].map(id => ({ id, user_id: 'user', tank_name: id })),
    tank_threshold_settings: [
      { user_id: 'user', tank_id: 'tank-A', water_level_min: 3.5 },
      { user_id: 'user', tank_id: 'tank-B', water_level_min: 4.2 },
    ], threshold_settings: [{ user_id: 'user', water_level_min: 9 }],
    sensor_readings: ['tank-A', 'tank-B'].map(tank_id => ({ tank_id, user_id: 'user', water_depth_cm: 3.6, created_at: new Date().toISOString() })),
  };
  for (const name of ['DashboardScreen', 'ReportsScreen', 'AiGuideScreen']) {
    const screenEnv = environment(screensData);
    const screen = screenEnv.load(`src/screens/main/${name}.js`).default;
    screenEnv.render(screen);
    screenEnv.effects.find(fn => /loadDashboard|loadReports|loadGuideData/.test(fn.toString()))();
    for (let tick = 0; tick < 100; tick++) await Promise.resolve();
    const loadedTanks = screenEnv.state.find(value => Array.isArray(value) && value[0]?.monitoring_thresholds);
    assert.ok(loadedTanks, `${name} loaded per-tank thresholds`);
    assert.equal(loadedTanks.find(tank => tank.id === 'tank-A').monitoring_thresholds.waterLevelMin, 3.5);
    assert.equal(loadedTanks.find(tank => tank.id === 'tank-B').monitoring_thresholds.waterLevelMin, 4.2);
    assert.ok(screenEnv.queries.some(query => query.table === 'threshold_settings'), `${name} reads account policy inheritance while preserving per-tank safe values`);
  }
  const tankEnv = environment(screensData);
  const tankScreen = tankEnv.load('src/screens/main/TankDetailsScreen.js').default;
  tankEnv.render(tankScreen, { tank: screensData.tanks[1] });
  tankEnv.effects.find(fn => /loadTankDetails/.test(fn.toString()))();
  for (let tick = 0; tick < 100; tick++) await Promise.resolve();
  assert.ok(tankEnv.state.some(value => value?.waterLevelMin === 4.2), 'Tank Details resolves its selected tank');
  const tankContext = await environment(screensData).load('src/services/aiGuideService.js').buildAiTankContext({ tank: screensData.tanks[1] });
  assert.equal(tankContext.thresholds.waterLevelMin, 4.2);
  console.log('PASS actual Dashboard, Reports, AI Guide and Tank Details loaders plus AI context keep Tank A/B thresholds separate');

  const settingsEnv = environment(screensData);
  const settingsScreen = settingsEnv.load('src/screens/main/settings/DefaultThresholdsScreen.js').default;
  settingsEnv.render(settingsScreen);
  settingsEnv.effects.find(fn => /loadThresholds/.test(fn.toString()))();
  for (let tick = 0; tick < 100; tick++) await Promise.resolve();
  let settingsTree = settingsEnv.render(settingsScreen);
  let selectB;
  walk(settingsTree, node => { if (node.type === 'TouchableOpacity' && node.props.children?.props?.children === 'tank-B') selectB = node.props.onPress; });
  assert.equal(typeof selectB, 'function'); selectB();
  settingsTree = settingsEnv.render(settingsScreen);
  let waterCard;
  walk(settingsTree, node => { if (node.props?.item?.id === 'water') waterCard = node.props.item; });
  assert.match(waterCard.value, /4\.2 cm/);
  screensData.tank_threshold_settings[1].water_level_min = 3.7;
  await settingsEnv.effects.find(fn => /loadThresholds/.test(fn.toString()))();
  for (let tick = 0; tick < 100; tick++) await Promise.resolve();
  settingsTree = settingsEnv.render(settingsScreen);
  walk(settingsTree, node => { if (node.props?.item?.id === 'water') waterCard = node.props.item; });
  assert.match(waterCard.value, /3\.7 cm/, 'Settings refresh uses persisted selected-tank values');
  screensData.tank_threshold_settings[1].water_level_min = 4.2;
  console.log('PASS mobile threshold settings tank selector and refresh display independent persisted values');

  for (const confirm of [false, true]) {
    const data = thresholdClient({ tanks: ['tank-A'], rows: [{ user_id: 'user', tank_id: 'tank-A', thresholds: { waterLevelMin: 4 } }] });
    const actualService = harness({ overrides: { supabase: data.db } }).load('src/services/aiGuideService.js');
    const view = harness({ seed: { loading: false, selectedTankId: 'tank-A', tanks: [{ id: 'tank-A', tank_name: 'Tank A' }],
      chatByTank: { 'tank-A': [{ id: 'proposal', role: 'assistant', action: 'suggest_threshold_change', text: 'Preview only.', thresholdSuggestion: proposal }] } },
    overrides: { apply: actualService.applyAiThresholdSuggestion, alert(title, message, buttons) {
      if (buttons) { assert.match(message, /only Tank A/); buttons.find(button => button.text === (confirm ? 'Apply' : 'Cancel')).onPress(); }
    } } });
    view.render('src/screens/main/AiGuideScreen.js');
    const button = view.elements.find(node => node.type === 'TouchableOpacity' && JSON.stringify(node.props.children).includes('"Apply Threshold"'));
    assert.ok(button); assert.equal(data.state.writes.length, 0, 'A recommendation alone performs no write');
    await button.props.onPress(); view.render();
    assert.equal(data.state.writes.length, confirm ? 1 : 0);
    if (confirm) {
      assert.equal(data.state.rows.get('tank-A').thresholds.waterLevelMin, 3.5);
      await button.props.onPress(); assert.equal(data.state.writes.length, 1, 'Repeated Apply is guarded');
    }
  }
  console.log('PASS real AI card requires explicit selected-tank confirmation; Cancel/no click writes nothing; accepted Apply uses RPC once');

  let confirmApply;
  const switchedData = thresholdClient({ tanks: ['tank-A', 'tank-B'] });
  const switchedService = harness({ overrides: { supabase: switchedData.db } }).load('src/services/aiGuideService.js');
  const switched = harness({ seed: { loading: false, selectedTankId: 'tank-A',
    tanks: [{ id: 'tank-A', tank_name: 'Tank A' }, { id: 'tank-B', tank_name: 'Tank B' }],
    chatByTank: { 'tank-A': [{ id: 'proposal', role: 'assistant', action: 'suggest_threshold_change', thresholdSuggestion: proposal }] } },
  overrides: { apply: switchedService.applyAiThresholdSuggestion, alert(title, message, buttons) {
    if (buttons) confirmApply = buttons.find(button => button.text === 'Apply').onPress;
  } } });
  switched.render('src/screens/main/AiGuideScreen.js');
  const pendingApply = switched.elements.find(node => node.type === 'TouchableOpacity'
    && JSON.stringify(node.props.children).includes('"Apply Threshold"')).props.onPress();
  await Promise.resolve();
  assert.equal(typeof confirmApply, 'function', 'Apply confirmation is open before switching tanks');
  const selector = switched.elements.find(node => node.type === 'TouchableOpacity'
    && JSON.stringify(node.props.children).includes('"Tank B"'));
  assert.ok(selector, 'Tank B selector is available');
  selector.props.onPress(); switched.render(); confirmApply(); await pendingApply;
  assert.equal(switchedData.state.writes.length, 0, 'Changing tanks during confirmation aborts Apply');
  console.log('PASS switching tanks during an open Apply confirmation cannot save a stale proposal');

  const server = edge({ thresholds: { waterLevelMin: 3.7 } });
  const result = await server.request({ question: 'Review my current thresholds.', context: { ...context,
    thresholds: { ...context.thresholds, waterLevelMin: 99 }, rule_based_result: { status: 'Normal' },
    latest_ammonia: { value: 0.1, created_at: '2026-10-01T12:00:00Z', condition: 'Normal' },
    recent_ammonia_readings: [{ value: 0.1, created_at: '2026-10-01T12:00:00Z', condition: 'Normal' }] } });
  assert.equal(result.status, 200);
  const raw = server.sent().messages[1].content;
  const sent = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  assert.equal(sent.thresholds.waterLevelMin, 3.7, 'Server uses saved canonical thresholds even for an outdated APK context');
  assert.equal(sent.rule_based_result, null, 'An outdated APK cannot supply conditions evaluated against different thresholds');
  assert.equal(sent.latest_ammonia.condition, undefined);
  assert.equal(sent.latest_ammonia.value, 0.1);
  assert.equal(sent.latest_ammonia.created_at, '2026-10-01T12:00:00Z');
  assert.equal(sent.recent_ammonia_readings[0].condition, undefined);
  const denied = edge({ thresholdError: new Error('read failure') });
  assert.equal((await denied.request()).status, 503); assert.equal(denied.calls(), 0);
  console.log('PASS server AI context resolves canonical thresholds independently; read failure never sends misleading thresholds to provider');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
