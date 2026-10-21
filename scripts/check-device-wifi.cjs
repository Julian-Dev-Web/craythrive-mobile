/* global __dirname */
// Offline WiFi provisioning regressions: no real device or Supabase writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

function loadWifi(extraGlobals = {}) {
  const cache = new Map();
  function load(filename) {
    const absolute = path.resolve(__dirname, '..', filename);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const code = babel.transformSync(fs.readFileSync(absolute, 'utf8'), {
      configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code;
    vm.runInNewContext(code, {
      exports, URL, AbortController, setTimeout, clearTimeout, performance,
      ...extraGlobals,
      require: name => load(path.resolve(path.dirname(absolute), `${name}.js`)),
    }, { filename: absolute });
    return exports;
  }
  return { ...load('src/utils/deviceUrls.js'), ...load('src/utils/deviceWifi.js') };
}

const SENSOR = 'CRAYTHRIVE-SENSOR-001';
const ACTUATOR = 'CRAYTHRIVE-ACTUATOR-001';
const epoch = Date.parse('2026-10-17T04:00:00Z');
const iso = delta => new Date(epoch + delta).toISOString();
const device = { device_uid: SENSOR, device_type: 'sensor_hub', is_claimed: true,
  local_ip: '192.168.1.99', wifi_config_url: 'http://192.168.1.98/wifi', last_seen: iso(-5000) };
const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

function database(getRow, getClock) {
  const queries = [];
  const db = {
    queries,
    from: table => {
      const query = { table };
      queries.push(query);
      const chain = {
        select: fields => { query.fields = fields; return chain; },
        eq: (field, value) => { query.field = field; query.value = value; return chain; },
        abortSignal: signal => { query.signal = signal; return chain; },
        maybeSingle: async () => ({ data: getRow(), error: null }),
      };
      return chain;
    },
    rpc: name => {
      assert.equal(name, 'craythrive_server_time');
      return { abortSignal: async () => ({ data: getClock(), error: null }) };
    },
  };
  return db;
}

async function main() {
  const wifi = loadWifi();
  assert.deepEqual(Array.from(wifi.resolveEsp32BaseUrls(device)), ['http://192.168.1.98', 'http://192.168.1.99', 'http://192.168.4.1']);
  assert.deepEqual(Array.from(wifi.resolveEsp32BaseUrls({ local_ip: '192.168.4.1', wifi_config_url: 'http://192.168.4.1/save' })), ['http://192.168.4.1']);
  assert.deepEqual(Array.from(wifi.resolveEsp32BaseUrls({ wifi_config_url: 'https://evil.example/wifi', local_ip: '10.1.1.1' })), ['http://10.1.1.1', 'http://192.168.4.1']);
  assert.equal(wifi.getSetupHotspot(device), 'CrayThrive-Sensor-Setup');
  assert.equal(wifi.getSetupHotspot({ device_uid: ACTUATOR }), 'CrayThrive-Actuator-Setup');
  assert.equal(wifi.getDeviceOnlineLabel({ ...device, connection_status: 'online', last_seen: iso(-121000) }, iso(0)), 'Reconnecting / Stale');
  assert.equal(wifi.getDeviceOnlineLabel(device, iso(0), { setup_mode: true }), 'Setup Mode');
  assert.equal(wifi.isDeviceRecent({ last_seen: iso(6000) }, iso(0)), false);
  assert.equal(wifi.isDeviceRecent(device, null), false);
  console.log('PASS candidate order, private destinations, hotspot identity and heartbeat recency');

  const gets = [];
  const target = await wifi.findEsp32Wifi(device, async (url, options) => {
    gets.push(url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET');
    if (gets.length === 1) throw new Error('stale address');
    if (gets.length === 2) return response({ device_uid: ACTUATOR });
    return response({ device_uid: SENSOR, setup_mode: true, password: 'must-not-be-stored', rssi: -57, backup_ssid_1: 'Hotspot-A' });
  });
  assert.equal(gets.length, 3);
  assert.equal(target.baseUrl, 'http://192.168.4.1');
  assert.equal(target.status.password, undefined);
  assert.equal(target.status.backup_ssid_1, 'Hotspot-A');
  await assert.rejects(wifi.findEsp32Wifi(device, async () => response({ device_uid: ACTUATOR })), { code: 'identity' });
  await assert.rejects(wifi.findEsp32Wifi(device, async () => response({}, 404)), { code: 'firmware' });
  await assert.rejects(wifi.findEsp32Wifi(device, async () => { throw new Error('No LAN'); }), { code: 'unreachable' });
  console.log('PASS stale address fallback, wrong-device rejection, firmware and LAN errors, password redaction');

  const posts = [];
  const fetchPost = async (url, options) => { posts.push({ url, options }); return response({}); };
  for (const action of ['save', 'reconnect', 'forget']) {
    await wifi.postEsp32Wifi(target, action, { ssid: 'Hotspot & B', password: 'p&= +%' }, fetchPost);
  }
  assert.deepEqual(posts.map(p => p.url), ['save', 'reconnect', 'forget'].map(action => `http://192.168.4.1/api/wifi/${action}`));
  for (const { options } of posts) {
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  }
  const form = new URLSearchParams(posts[0].options.body);
  assert.equal(form.get('ssid'), 'Hotspot & B');
  assert.equal(form.get('password'), 'p&= +%');
  let sent = 0;
  await assert.rejects(wifi.postEsp32Wifi(target, 'save', {}, async () => { sent++; throw new Error('reboot'); }), { code: 'uncertain' });
  assert.equal(sent, 1, 'Never replay a command automatically after a dropped reply');
  await assert.rejects(wifi.postEsp32Wifi({ ...target, baseUrl: 'http://evil.example' }, 'save', {}, fetchPost), { code: 'identity' });
  await assert.rejects(wifi.postEsp32Wifi(target, 'save', {}, async () => response({}, 400)), { code: 'rejected' });
  await assert.rejects(wifi.withWifiTimeout(() => new Promise(() => {}), undefined, 5), { code: 'timeout' });
  console.log('PASS form encoding, all WiFi routes, redirect rejection, timeouts and ambiguous reboot replies');

  const heartbeat = row => ({ device: row, serverTime: iso(30000) });
  assert.equal(wifi.hasFreshWifiHeartbeat(heartbeat(device), SENSOR, device, 30000), false);
  assert.equal(wifi.hasFreshWifiHeartbeat(heartbeat({ ...device, last_seen: iso(15000) }), SENSOR, device, 30000), true, 'Same DHCP address is valid only alongside a new heartbeat');
  assert.equal(wifi.hasFreshWifiHeartbeat(heartbeat({ ...device, device_uid: ACTUATOR, last_seen: iso(15000) }), SENSOR, device, 30000), false);
  assert.equal(wifi.hasFreshWifiHeartbeat(heartbeat({ ...device, last_seen: iso(15000), local_ip: '', wifi_config_url: '' }), SENSOR, device, 30000), false);
  assert.equal(wifi.hasFreshWifiHeartbeat(heartbeat({ ...device, last_seen: iso(-1000) }), SENSOR, device, 30000), false, 'Recent heartbeat from before the command is insufficient');
  console.log('PASS fresh exact-device heartbeat and refreshed-address evidence; old IP alone never proves reconnection');

  // Virtual elapsed time keeps the 45-second deadline tests fast, while promises
  // and AbortSignals exercise the real request/poll implementation.
  let tick = 0;
  const simulated = loadWifi({
    setTimeout: (fn, ms) => setTimeout(() => { tick += ms; fn(); }, 0), clearTimeout,
  });
  let db = database(() => ({ ...device, last_seen: tick >= 6000 ? iso(tick) : device.last_seen }), () => iso(tick));
  let result = await simulated.waitForWifiHeartbeat({ db, deviceUid: SENSOR, baseline: device, now: () => tick, commandStartedAt: 0 });
  assert.equal(result.device.device_uid, SENSOR);
  assert.equal(tick, 6000);
  assert.ok(db.queries.every(query => query.table === 'iot_devices' && query.field === 'device_uid' && query.value === SENSOR && query.signal));
  tick = 0;
  db = database(() => device, () => iso(tick));
  result = await simulated.waitForWifiHeartbeat({ db, deviceUid: SENSOR, baseline: device, now: () => tick });
  assert.equal(result.timedOut, true);
  assert.equal(result.cloudUnavailable, false);
  assert.equal(tick, 45000);
  tick = 0;
  db = database(() => { throw new Error('cloud offline'); }, () => iso(tick));
  result = await simulated.waitForWifiHeartbeat({ db, deviceUid: SENSOR, baseline: device, now: () => tick });
  assert.equal(result.cloudUnavailable, true);
  assert.equal(tick, 45000);
  tick = 0;
  db = database(() => device, () => iso(tick));
  const controller = new AbortController();
  const pending = simulated.waitForWifiHeartbeat({ db, deviceUid: SENSOR, baseline: device, signal: controller.signal, now: () => tick });
  controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  assert.equal(db.queries.length, 0);
  const hungDb = { from: () => ({ select() { return this; }, eq() { return this; }, abortSignal() { return this; }, maybeSingle: () => new Promise(() => {}) }), rpc: () => ({ abortSignal: () => new Promise(() => {}) }) };
  const requestController = new AbortController();
  const hungRequest = wifi.readWifiDeviceSnapshot(hungDb, SENSOR, requestController.signal);
  requestController.abort();
  await assert.rejects(hungRequest, { code: 'cancelled' });
  console.log('PASS 3-second polling, 45-second limit, cloud outages, unmount cancellation and in-flight request abort');

  const { harness, deferred } = require('./check-mobile-ui.cjs');
  const heartbeatGate = deferred();
  const screenPosts = [];
  let screenWait;
  const ui = harness({ overrides: { deviceWifi: {
    ...wifi,
    readWifiDeviceSnapshot: async () => ({ device, serverTime: iso(0) }),
    findEsp32Wifi: async () => target,
    postEsp32Wifi: async (selected, action, values) => { screenPosts.push({ selected, action, values }); },
    waitForWifiHeartbeat: args => { screenWait = args; return heartbeatGate.promise; },
  } } });
  const screenFile = 'src/screens/main/DeviceWifiSetupScreen.js';
  const props = { device, tank: { id: 'tank', tank_name: 'Farm' }, onBack() {} };
  const button = (app, label) => app.elements.find(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === label);
  ui.render(screenFile, props);
  ui.flushEffects();
  await Promise.resolve();
  ui.render();
  ui.elements.find(node => node.type === 'TextInput' && node.props.placeholder === 'Enter Wi-Fi name').props.onChangeText('Hotspot B');
  ui.elements.find(node => node.type === 'TextInput' && node.props.secureTextEntry).props.onChangeText('private-test-only');
  ui.render();
  const saveButton = button(ui, 'Save & Switch WiFi');
  const firstTap = saveButton.props.onPress();
  const secondTap = saveButton.props.onPress();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  ui.render();
  assert.equal(screenPosts.length, 1);
  assert.equal(screenPosts[0].action, 'save');
  assert.equal(screenPosts[0].values.ssid, 'Hotspot B');
  assert.equal(screenWait.deviceUid, SENSOR);
  assert.ok(ui.texts.some(text => text.includes('Waiting for ESP32 to reconnect')));
  assert.ok(!ui.texts.some(text => text.includes('confirmed by a fresh cloud heartbeat')));
  assert.equal(ui.elements.find(node => node.type === 'TextInput' && node.props.secureTextEntry).props.value, '');
  heartbeatGate.resolve({ device: { ...device, last_seen: iso(10000) }, serverTime: iso(10000) });
  await Promise.all([firstTap, secondTap]);
  ui.render();
  assert.ok(ui.texts.some(text => text.includes('confirmed by a fresh cloud heartbeat')));
  await button(ui, 'Check WiFi Status').props.onPress();
  ui.render();
  assert.ok(ui.texts.includes('Setup Mode'));
  assert.ok(ui.texts.includes('-57 dBm'));
  button(ui, 'Saved Networks & Device Details').props.onPress();
  ui.render();
  assert.ok(ui.texts.includes('Hotspot-A'));
  assert.ok(!ui.texts.includes('must-not-be-stored'));
  button(ui, 'Forget WiFi / Setup Mode').props.onPress();
  ui.render();
  assert.equal(ui.elements.filter(node => node.type === 'Modal').at(-1).props.visible, true);
  assert.equal(screenPosts.length, 1, 'Opening confirmation sends no command');
  button(ui, 'Cancel').props.onPress();
  ui.render();
  assert.equal(ui.elements.filter(node => node.type === 'Modal').at(-1).props.visible, false);
  assert.equal(screenPosts.length, 1);
  button(ui, 'Forget WiFi / Setup Mode').props.onPress();
  ui.render();
  await button(ui, 'Forget WiFi').props.onPress();
  ui.render();
  assert.equal(screenPosts.length, 2);
  assert.equal(screenPosts[1].action, 'forget');
  assert.ok(ui.texts.some(text => text.includes('device is still paired to this tank')));
  assert.equal(ui.calls.filter(([table, op]) => table === 'iot_devices' && op === 'update').length, 0);
  ui.unmount();

  const offlineUi = harness({ overrides: { deviceWifi: {
    ...wifi,
    readWifiDeviceSnapshot: async () => ({ device, serverTime: iso(0) }),
    findEsp32Wifi: async () => { throw Object.assign(new Error('Join the device setup hotspot.'), { code: 'unreachable' }); },
    postEsp32Wifi: async () => assert.fail('Unreachable devices must never receive a WiFi command'),
  } } });
  offlineUi.render(screenFile, props);
  offlineUi.flushEffects();
  await button(offlineUi, 'Reconnect Saved WiFi').props.onPress();
  offlineUi.render();
  assert.ok(offlineUi.texts.includes('Join the device setup hotspot.'));
  assert.ok(!offlineUi.texts.some(text => text.includes('Reconnect requested')));
  offlineUi.unmount();

  const cancelGate = deferred();
  let waitingSignal;
  const leavingUi = harness({ overrides: { deviceWifi: {
    ...wifi,
    readWifiDeviceSnapshot: async () => ({ device, serverTime: iso(0) }),
    findEsp32Wifi: async () => target,
    postEsp32Wifi: async () => {},
    waitForWifiHeartbeat: ({ signal }) => {
      waitingSignal = signal;
      signal.addEventListener('abort', () => cancelGate.reject(Object.assign(new Error('cancelled'), { code: 'cancelled' })), { once: true });
      return cancelGate.promise;
    },
  } } });
  leavingUi.render(screenFile, props);
  leavingUi.flushEffects();
  const reconnecting = button(leavingUi, 'Reconnect Saved WiFi').props.onPress();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.ok(waitingSignal && !waitingSignal.aborted);
  leavingUi.unmount();
  await reconnecting;
  assert.equal(waitingSignal.aborted, true);
  console.log('PASS real WiFi screen: rapid taps, acceptance vs heartbeat success, password clearing, Forget confirmation, offline reconnect and unmount cleanup');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
