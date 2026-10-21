/* global __dirname */
// Offline regression checks: no hardware writes, live database actions or APK build.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const { ESLint } = require('eslint');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const screens = ['DashboardScreen', 'TankDetailsScreen', 'ReportsScreen', 'AiGuideScreen', 'AmmoniaReaderScreen'];
const files = ['src/utils/thresholdSettings.js', 'src/utils/sensorMonitoring.js', 'src/utils/tankRules.js',
  'src/utils/sensorAlertRules.js', 'src/components/tank/SensorReadingCard.js', 'src/components/ui/NotificationBell.js', 'src/services/aiGuideService.js',
  ...screens.map(name => `src/screens/main/${name}.js`)];
const quiet = { log() {}, error() {}, warn() {} };
const colors = { success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', muted: '#64748b',
  surface: '#fff', surfaceSoft: '#eee', border: '#ccc', textStrong: '#111' };
function compile(file, suffix = '') {
  return babel.transformSync(fs.readFileSync(file, 'utf8') + suffix, { filename: file, configFile: false, babelrc: false,
    plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'] }).code;
}
function environment(fixture = {}) {
  const cache = new Map();
  const queries = [];
  const channels = [], removed = [], intervals = [], cleared = [];
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }),
    getSession: async () => ({ data: { session: { user: { id: 'user' } } } }) },
    async rpc(name) { assert.equal(name, 'craythrive_server_time'); return { data: fixture.server_time || new Date().toISOString(), error: fixture.errors?.server_time }; }, from(table) {
    const operations = [];
    const query = new Proxy({}, { get(object, key) {
      if (key === 'then') { const result = resolve(); return result.then.bind(result); }
      return (...args) => { operations.push([key, ...args]); return query; };
    } });
    function resolve() {
      queries.push({ table, operations });
      assert.ok(!operations.some(([op]) => ['insert', 'update', 'delete', 'upsert'].includes(op)), 'read-only fixture');
      let rows = [...(fixture[table] || [])];
      for (const [op, key, value] of operations) {
        if (op === 'eq') rows = rows.filter(row => row[key] === value);
        if (op === 'in') rows = rows.filter(row => value.includes(row[key]));
        if (op === 'gte') rows = rows.filter(row => row[key] >= value);
        if (op === 'lt') rows = rows.filter(row => row[key] < value);
        if (op === 'order') rows.sort((a, b) => (String(a[key] || '').localeCompare(String(b[key] || ''))) * (value.ascending ? 1 : -1));
        if (op === 'limit') rows = rows.slice(0, key);
      }
      const single = operations.some(([op]) => ['maybeSingle', 'single'].includes(op));
      return Promise.resolve({ data: single ? rows[0] || null : rows, error: fixture.errors?.[table] || null });
    }
    return query;
  }, channel(name) { const channel = { name, on() { return channel; }, subscribe() {} }; channels.push(channel); return channel; },
  removeChannel(channel) { removed.push(channel); } };
  const state = [], effects = [], refs = [];
  let cursor = 0, refCursor = 0;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useMemo: fn => fn(), useCallback: fn => fn,
    useRef: value => { const index = refCursor++; if (!(index in refs)) refs[index] = { current: value }; return refs[index]; },
    useEffect: fn => { effects.push(fn); } };
  function load(file, suffix = '') {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    vm.runInNewContext(compile(file, suffix), { exports, URL, AbortController, performance, console: quiet, setTimeout: fn => { fn(); }, clearTimeout() {},
      setInterval: (fn, delay) => { const timer = { fn, delay }; intervals.push(timer); return timer; }, clearInterval: timer => { cleared.push(timer); },
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
        if (name === 'react-native') return { StyleSheet: { create: x => x }, Platform: { OS: 'android' },
          Keyboard: { isVisible: () => false, addListener: () => ({ remove() {} }) },
          View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', RefreshControl: 'RefreshControl' };
        if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' };
        if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) };
        if (name.includes('lib/supabase')) return { supabase };
        if (name.includes('ThemeContext')) return { useAppTheme: () => ({ colors, isDark: false }) };
        if (name.includes('sensorAlertRules') && !file.endsWith('sensorAlertRules.js')) return { syncSensorAlertsForReading: async () => {}, syncAmmoniaAlertsForScan: async () => {} };
        if (name.startsWith('.')) {
          const target = path.resolve(path.dirname(file), name) + '.js';
          if (target.includes(path.sep + 'utils' + path.sep) || target.includes(path.sep + 'hooks' + path.sep) || target.includes('SensorReadingCard') || target.includes(path.sep + 'constants' + path.sep)) return load(target);
          return { default: name };
        }
        return {};
      },
    }, { filename: file });
    return exports;
  }
  return { load, queries, state, effects, channels, removed, intervals, cleared,
    render(screen, props = {}) { cursor = 0; refCursor = 0; effects.length = 0; return screen(props); } };
}
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(x => walk(x, fn)); else walk(child, fn);
}
async function main() {
  const preset = require.resolve('babel-preset-expo', { paths: [path.dirname(require.resolve('expo/package.json'))] });
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
    for (const node of ast.program.body.filter(x => x.type === 'ImportDeclaration')) {
      const name = node.source.value;
      if (!name.startsWith('.')) require.resolve(name);
      else { const target = path.resolve(path.dirname(file), name); assert.ok([target, target + '.js', target + '.ts'].some(fs.existsSync), name); }
    }
    babel.transformSync(source, { filename: path.resolve(file), configFile: false, babelrc: false,
      presets: [[preset, { platform: 'android' }]], caller: { name: 'metro', platform: 'android', supportsStaticESM: true } });
  }
  console.log(`PASS syntax, imports and Expo Android transformations (${files.length} files)`);
  const env = environment();
  const rules = env.load('src/utils/thresholdSettings.js');
  const monitor = env.load('src/utils/sensorMonitoring.js');
  // Explicit synthetic configuration for regression fixtures, not defaults.
  const thresholds = { ...rules.DEFAULT_THRESHOLDS, user_id: 'user', waterLevelMin: 4.5, phMin: 6.5,
    temperatureCriticalMin: 18, temperatureCriticalMax: 34, phCriticalMin: 6, phCriticalMax: 9,
    waterCriticalMin: 1, turbidityCriticalMinV: 1.5, ammoniaCriticalMax: 0.5,
    ...Object.fromEntries(['temperature','ph','water','turbidity','ammonia'].map(key => [`${key}MaxAgeSeconds`,120])) };
  const now = '2026-10-11T13:02:55Z';
  const reading = { temperature_c: 26, temperature: 99, ph_value: 4.8, ph: 7.5, turbidity_voltage: 3,
    raw_turbidity_value: 3200, water_depth_cm: 0.6, water_distance_cm: 12, created_at: now,
    temperature_status: 'CRITICAL_HOT', ph_status: 'SAFE_IDEAL', water_status: 'SAFE', turbidity_status: 'CRITICAL_DIRTY' };
  const evaluated = rules.evaluateMonitoring(reading, thresholds, { serverTime: now });
  assert.equal(evaluated.metrics.water.value, 0.6); assert.equal(evaluated.metrics.water.label, 'Critical');
  assert.equal(evaluated.metrics.ph.value, 4.8); assert.equal(evaluated.metrics.ph.label, 'Critical');
  assert.equal(evaluated.metrics.temperature.value, 26); assert.equal(evaluated.metrics.temperature.label, 'Normal');
  assert.equal(evaluated.metrics.turbidity.label, 'Normal'); assert.equal(evaluated.label, 'Critical');
  assert.equal(monitor.monitoringColor(evaluated.metrics.water.tone, colors), colors.danger);
  assert.equal(monitor.monitoringColor(evaluated.metrics.temperature.tone, colors), colors.success);
  console.log('PASS canonical numeric values use configured boundaries; raw firmware severity does not override evaluated condition');
  for (const value of [null, undefined, '', '   ', NaN, Infinity, 'Low pH', false, {}, []]) {
    const missing = rules.evaluateMonitoring({ temperature_c: value, ph_value: value, water_depth_cm: value,
      turbidity_voltage: value, ammonia: value, water_status: 'SAFE', ph_status: 'SAFE_IDEAL' }, thresholds);
    assert.equal(missing.label, 'No Data');
    for (const metric of Object.values(missing.metrics)) { assert.equal(metric.displayValue, metric.key === 'ammonia' ? 'No Scan' : '--'); assert.equal(metric.tone, 'neutral'); }
  }
  assert.equal(rules.evaluateMonitoring({ water_distance_cm: 8, distance_cm: 9 }).metrics.water.value, null);
  assert.equal(rules.evaluateMonitoring({ raw_turbidity_value: 3000 }).metrics.turbidity.value, null);
  assert.equal(rules.getReadingPh({ ph_value: '', ph: 7.2 }), null);
  assert.equal(rules.evaluateMonitoring({ ammonia: 0 }).metrics.ammonia.value, 0);
  assert.equal(rules.evaluateMonitoring(reading, thresholds, { paired: false }).label, 'Unpaired');
  assert.ok(Object.values(rules.evaluateMonitoring(reading, thresholds, { paired: false }).metrics).every(metric => metric.tone === 'neutral'));
  const unchanged = JSON.stringify(reading);
  const updated = rules.evaluateMonitoring(reading, { ...thresholds, waterLevelMin: 0.5, waterCriticalMin: 0.1, phMin: 4.5, phCriticalMin: 4 }, { serverTime: now });
  assert.equal(updated.metrics.ph.severity, 'normal'); assert.equal(updated.metrics.water.severity, 'normal');
  assert.equal(updated.label, 'Incomplete data', 'Missing ammonia prevents an overall Normal claim');
  assert.equal(JSON.stringify(reading), unchanged);
  assert.equal(rules.evaluateMonitoring({ ...reading, temperature_c:31 },thresholds,{ serverTime:now }).metrics.temperature.severity,'warning');
  assert.equal(rules.evaluateMonitoring({ ...reading, temperature_c:31 },rules.DEFAULT_THRESHOLDS,{ serverTime:now }).metrics.temperature.severity,'configuration');
  console.log('PASS invalid/missing data, pairing, partial coverage, configuration-required state and immutable threshold reevaluation');
  const combine = monitor.combineMonitoringReadings;
  const sensor = { ...reading, device_uid:'esp32', tank_id: 'tank', user_id: 'user', created_at: '2026-10-04T06:00:00Z', ammonia: 1 };
  const scan = { tank_id: 'tank', user_id: 'user', ammonia_level: 0, status: 'SAFE', created_at: '2026-10-04T07:00:00Z' };
  assert.equal(combine(sensor, scan).ammonia, 0);
  const laterWater = combine({ ...sensor, created_at: '2026-10-04T08:00:00Z' }, scan);
  assert.equal(laterWater.ammonia, 0);
  assert.equal(laterWater.created_at, '2026-10-04T08:00:00Z');
  assert.equal(laterWater.ammonia_created_at, scan.created_at);
  assert.equal(combine(sensor, null).ammonia, null);
  const alerts = env.load('src/utils/sensorAlertRules.js').buildSensorAlerts(reading, thresholds);
  assert.equal(alerts.length, 0, 'Unverified server clock cannot emit condition notifications');
  assert.ok(alerts.every(alert => alert.severity === 'critical'));
  console.log('PASS ammonia comes only from its saved scan, including an older/zero scan; sensor and scan timestamps remain separate');
  const fixture = { profiles: [{ id: 'user', username: 'Farmer' }], tanks: [{ id: 'tank', user_id: 'user', tank_name: 'Test Tank', has_paired_device: false }],
    threshold_settings: [thresholds], sensor_readings: [{ ...sensor, created_at: '2000-01-01T06:00:00Z' }],
    ammonia_readings: [{ ...scan, created_at: '2000-01-02T06:00:00Z' }],
    iot_devices: [{ tank_id: 'tank', user_id: 'user', device_type: 'sensor', device_uid: 'esp32', is_claimed: true }] };
  const outputs = [];
  for (const name of ['DashboardScreen', 'TankDetailsScreen', 'ReportsScreen', 'AiGuideScreen']) {
    const screenEnv = environment(fixture);
    const screen = screenEnv.load(`src/screens/main/${name}.js`).default;
    const props = name === 'TankDetailsScreen' ? { tank: fixture.tanks[0] } : {};
    screenEnv.render(screen, props);
    const loadEffect = screenEnv.effects.find(fn => /loadDashboard|loadTankDetails|loadReports|loadGuideData/.test(fn.toString()));
    assert.ok(loadEffect, `${name} has a data loading effect`);
    await loadEffect();
    // Effects call async loaders without returning the promise; drain their finite mocked queries.
    for (let tick = 0; tick < 100; tick++) await Promise.resolve();
    const loaded = name === 'TankDetailsScreen' ? screenEnv.state.find(value => value?.reading_type === 'current_display')
      : screenEnv.state.find(value => Array.isArray(value) && value[0]?.latest_reading)?.[0]?.latest_reading;
    assert.ok(loaded, `${name} loads the latest saved records`);
    if (name !== 'TankDetailsScreen') {
      const loadedTank = screenEnv.state.find(value => Array.isArray(value) && value[0]?.latest_reading)?.[0];
      assert.equal(loadedTank.has_paired_device, true, `${name}: actual claimed device overrides a stale tank flag`);
    }
    outputs.push(JSON.stringify(rules.evaluateMonitoring(loaded, thresholds)));
    assert.ok(screenEnv.queries.some(q => q.table === 'threshold_settings'), `${name} fetches current thresholds`);
    assert.ok(screenEnv.queries.some(q => q.table === 'ammonia_readings'), `${name} fetches manual scans`);
    fixture.threshold_settings = [{ ...thresholds, phMin: 4.5, waterLevelMin: 0.5 }];
    screenEnv.render(screen, props);
    await screenEnv.effects.find(fn => /loadDashboard|loadTankDetails|loadReports|loadGuideData/.test(fn.toString()))();
    for (let tick = 0; tick < 100; tick++) await Promise.resolve();
    assert.ok(screenEnv.state.some(value => value?.waterLevelMin === 0.5) || screenEnv.state.some(value => Array.isArray(value) && value[0]?.monitoring_thresholds?.waterLevelMin === 0.5));
    fixture.threshold_settings = [thresholds];
  }
  assert.equal(new Set(outputs).size, 1);
  const unpairedEnv = environment({ ...fixture, tanks: [{ ...fixture.tanks[0], has_paired_device: true }], iot_devices: [] });
  unpairedEnv.render(unpairedEnv.load('src/screens/main/AiGuideScreen.js').default);
  unpairedEnv.effects.find(fn => /loadGuideData/.test(fn.toString()))();
  for (let tick = 0; tick < 100; tick++) await Promise.resolve();
  const unpairedTank = unpairedEnv.state.find(value => Array.isArray(value) && value[0]?.latest_reading)?.[0];
  assert.equal(unpairedTank.has_paired_device, false);
  assert.equal(rules.evaluateMonitoring(unpairedTank.latest_reading, thresholds, { paired: unpairedTank.has_paired_device }).label, 'Incomplete data');
  assert.equal(unpairedTank.latest_sensor,null,'An unpaired tank cannot reuse a former sensor reading');
  const aiContext = await environment(fixture).load('src/services/aiGuideService.js').buildAiTankContext({ tank: fixture.tanks[0] });
  assert.equal(aiContext.latest_reading.ph, 4.8);
  assert.equal(aiContext.latest_reading.water_level, 0.6);
  assert.notEqual(aiContext.latest_reading.evaluated_statuses.ph.status, 'Normal');
  assert.equal(aiContext.latest_reading.raw_statuses.ph, 'SAFE_IDEAL');
  assert.notEqual(aiContext.rule_based_result.status, 'Normal');
  const failedThresholds = environment({ errors: { threshold_settings: new Error('offline') } });
  await assert.rejects(() => failedThresholds.load('src/utils/thresholdSettings.js').fetchThresholdSettings('user'), /offline/);
  console.log('PASS all four screens load identical old readings outside report week, reread thresholds, and preserve pairing; AI context separates raw metadata and evaluated status; fetch failures cannot silently use defaults');
  const cardModule = env.load('src/components/tank/SensorReadingCard.js');
  for (const theme of ['light', 'dark']) for (const metric of Object.values(evaluated.metrics)) {
    const themeColors = env.load('src/constants/theme.js').getThemeColors(theme);
    const tree = cardModule.default({ metric, colors: themeColors });
    const icons = [], texts = [];
    walk(tree, node => { if (node.type === 'Ionicons') icons.push(node.props); if (node.type === 'Text') texts.push(node.props); });
    assert.ok(icons.some(icon => icon.name === metric.icon && icon.color === monitor.monitoringColor(metric.tone, themeColors)));
    assert.ok(texts.some(text => text.children.includes(metric.label) && text.style.color === monitor.monitoringColor(metric.tone, themeColors)));
  }
  console.log('PASS actual shared cards render numeric values with matching severity icon, badge text and theme color');
  const bellEnv = environment();
  bellEnv.render(bellEnv.load('src/components/ui/NotificationBell.js').default);
  const cleanup = bellEnv.effects[0]();
  for (let tick = 0; tick < 20; tick++) await Promise.resolve();
  assert.equal(bellEnv.channels.length, 1);
  assert.equal(bellEnv.intervals.length, 1);
  assert.equal(bellEnv.intervals[0].delay, 20000);
  cleanup();
  assert.equal(bellEnv.removed.length, 1);
  assert.equal(bellEnv.cleared.length, 1);
  const earlyBell = environment();
  earlyBell.render(earlyBell.load('src/components/ui/NotificationBell.js').default);
  earlyBell.effects[0]()();
  for (let tick = 0; tick < 20; tick++) await Promise.resolve();
  assert.equal(earlyBell.channels.length, 0);
  assert.equal(earlyBell.intervals.length, 0);
  console.log('PASS NotificationBell preserves realtime, polling and cleanup; early unmount cannot leak a subscription');
  for (const file of screens.map(name => `src/screens/main/${name}.js`)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /temperature_status|ph_status|turbidity_status|water_status|water_distance_cm/);
  const lint = await new ESLint().lintFiles([...files, 'scripts/check-sensor-monitoring.cjs']);
  const errors = lint.reduce((n, r) => n + r.errorCount, 0), warnings = lint.reduce((n, r) => n + r.warningCount, 0);
  if (errors || warnings) console.log(await (await new ESLint().loadFormatter('stylish')).format(lint));
  assert.equal(errors + warnings, 0);
  console.log('PASS scoped ESLint: 0 errors, 0 warnings; no stale farmer-facing raw status or distance usage');
  console.log('Sensor monitoring checks passed. No live database writes or APK build.');
}
module.exports = { environment, walk, compile };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
