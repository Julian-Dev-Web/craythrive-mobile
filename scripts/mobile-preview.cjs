/* global __dirname */
// Read-only visual fixtures rendered with React Native Web. This is not an Android renderer.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Web = require('react-native-web');
const { harness, flatten } = require('./check-mobile-ui.cjs');
const root = path.resolve(__dirname, '..');
const glyphs = {
  Ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'),
  MaterialCommunityIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'),
};
const assetRoot = path.dirname(require.resolve('@expo/vector-icons/package.json'));
const fonts = Object.keys(glyphs).map(name => `@font-face{font-family:${name};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(assetRoot, 'build/vendor/react-native-vector-icons/Fonts', `${name}.ttf`)).toString('base64')})}`).join('\n');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []);
}
const cases = files(path.join(root, 'src/screens')).map(file => ({
  id: path.basename(file, '.js'), file: path.relative(root, file).replaceAll('\\', '/'),
}));

function fixture(id) {
  const at = new Date().toISOString();
  const thresholds = { temperatureMin: 20, temperatureMax: 30, phMin: 6.5, phMax: 8.5,
    waterLevelMin: 4.5, turbidityMax: 2.5, ammoniaMax: 0.25 };
  const sensor = { id: 'sensor-reading', tank_id: 'tank', user_id: 'user', device_uid: 'CRAYTHRIVE-SENSOR-001',
    temperature_c: 27, ph_value: 7.2, water_depth_cm: 5.2, turbidity_voltage: 3, created_at: at };
  const scan = { id: 'scan', tank_id: 'tank', user_id: 'user', ammonia_level: 0.1, created_at: at };
  const device = { device_uid: 'CRAYTHRIVE-SENSOR-001', device_type: 'sensor_hub', is_claimed: true,
    user_id: 'user', tank_id: 'tank', pairing_code: 'SENSOR001', local_ip: '192.168.1.101', last_seen: at };
  const tank = { id: 'tank', user_id: 'user', tank_name: 'North Farm — Long Tank Name', tank_type: 'juvenile',
    juvenile_count: 15, has_paired_device: true, latest_sensor: sensor, latest_ammonia: scan,
    monitoring_thresholds: thresholds, sensor_readings: [sensor], alerts: [], control_logs: [], reading_history: [], weekly_scores: [] };
  const listing = { id: 'listing', seller_id: 'seller', title: 'Healthy juvenile crayfish for your farm',
    category: 'crayfish', stage: 'juvenile', price: 150, quantity: 15, unit: 'piece', status: 'active',
    description: 'Sample listing for layout checks. Pickup available after confirmation.', location: 'Malolos, Bulacan' };
  const seed = { loading: false, isLoadingThresholds: false, profileLoaded: true, email: 'farmer@example.com',
    profileName: 'Farmer', username: 'Farmer', userId: 'user', userEmail: 'farmer@example.com',
    currentUser: { id: 'user' }, currentUserId: 'user', tanks: [tank], selectedTankId: 'tank',
    devices: [device, { ...device, device_uid: 'CRAYTHRIVE-ACTUATOR-001', device_type: 'actuator_hub' }],
    thresholds, latestSensorReading: sensor, latestAmmoniaReading: scan,
    listings: [listing], listing, selectedDevice: device, monitoringPaired: true,
    thread: { id: 'thread', buyer_id: 'user', seller_id: 'seller', status: 'active' },
    messages: [{ id: 'message', sender_id: 'seller', receiver_id: 'user', body: 'Hello! These juveniles are available. When would you like to pick them up?', message: 'Hello! These juveniles are available. When would you like to pick them up?', created_at: at }],
    seller: { user_id: 'seller', store_name: 'Farm Store', seller_mobile: '09123456789', pickup_municipality: 'Malolos', pickup_barangay: 'Atlag' },
    activeMode: id === 'AmmoniaReaderScreen' ? 'manual' : 'ask',
  };
  const props = { tank, device, listing, onBack() {}, onSuccess() {}, onFinish() {}, onLogout() {},
    chatDetails: { currentUserId: 'user', otherUserId: 'seller', listing, threadId: 'thread' } };
  if (id === 'AddTankScreen') Object.assign(seed, { tankName: 'New nursery tank', tankType: 'Juvenile', juvenileCount: '15' });
  if (id === 'AmmoniaReaderScreen') Object.assign(seed, { manualValue: '0.1', result: { shouldSave: true, ammoniaLevel: 0.1, status: 'SAFE' } });
  if (id === 'AiGuideScreen') seed.chatByTank = { tank: [{ id: 'answer', role: 'assistant', action: 'recommendation_only',
    text: 'Review the latest saved readings and check your crayfish before feeding. Confirm any missing reading-age or Critical-limit settings before relying on the status.' }] };
  return { seed, props, sensor, scan, tank, thresholds, at };
}

function webTree(node, scale = 1, key = 'root') {
  if (node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) return node.map((child, index) => webTree(child, scale, `${key}-${index}`));
  if (typeof node !== 'object') return node;
  const { children, ...original } = node.props || {};
  const type = node.type;
  if (['StatusBar', 'RefreshControl'].includes(type)) return null;
  if (type === 'Modal' && !original.visible) return null;
  const nextChildren = webTree(children, scale, `${key}-child`);
  if (!type || type === 'Fragment') return React.createElement(React.Fragment, { key }, nextChildren);
  if (glyphs[type]) return React.createElement('span', { key, 'aria-hidden': true,
    style: { fontFamily: type, fontSize: original.size || 20, color: original.color, flexShrink: 0, lineHeight: 1 } },
  String.fromCodePoint(glyphs[type][original.name] || 0x25cf));
  if (['Svg', 'Path', 'Circle', 'Rect', 'G', 'Ellipse', 'Line', 'Polygon', 'Polyline', 'Defs', 'LinearGradientSvg', 'Stop'].includes(type)) {
    const svgProps = Object.fromEntries(Object.entries(original).filter(([name, value]) => name !== 'style' && typeof value !== 'function'));
    return React.createElement(type === 'Svg' ? 'svg' : type[0].toLowerCase() + type.slice(1), { ...svgProps, key }, nextChildren);
  }
  let style = flatten(original.style);
  if (style.fontSize) style.fontSize *= scale;
  if (style.lineHeight) style.lineHeight *= scale;
  const props = { key, style, testID: original.testID, accessibilityRole: original.accessibilityRole,
    accessibilityLabel: original.accessibilityLabel, accessibilityState: original.accessibilityState };
  if (original.contentContainerStyle) props.contentContainerStyle = flatten(original.contentContainerStyle);
  if (type === 'SafeAreaView') props.style = [{ paddingTop: 24, paddingBottom: 24 }, style];
  if (type === 'LinearGradient') props.style = [style, { backgroundImage: `linear-gradient(160deg,${original.colors?.join(',') || '#fff,#fff'})` }];
  if (type === 'Modal') props.style = { position: 'absolute', inset: 0, zIndex: 50 };
  if (type === 'Text') {
    props.numberOfLines = original.numberOfLines;
    props.selectable = original.selectable;
  }
  if (type === 'TextInput') Object.assign(props, { value: original.value || '', placeholder: original.placeholder,
    secureTextEntry: original.secureTextEntry, multiline: original.multiline, editable: original.editable, onChangeText() {} });
  if (type === 'Switch') Object.assign(props, { value: original.value, disabled: original.disabled, onValueChange() {} });
  if (type === 'Image') Object.assign(props, { source: typeof original.source === 'number'
    ? { uri: '/logo.png' } : original.source, resizeMode: original.resizeMode });
  if (type === 'ActivityIndicator') props.color = original.color;
  if (type === 'TouchableOpacity') Object.assign(props, { onPress() {}, disabled: original.disabled });
  const Component = ['KeyboardAvoidingView', 'SafeAreaView', 'AnimatedView', 'LinearGradient', 'Modal', 'CameraView'].includes(type)
    ? Web.View : Web[type] || Web.View;
  return React.createElement(Component, props, nextChildren);
}

async function page({ id, width = 360, height = 800, mode = 'light', scale = 1 }) {
  const item = cases.find(row => row.id === id);
  if (!item) throw new Error('Unknown visual fixture');
  const data = fixture(id);
  const env = harness({ mode, width, seed: data.seed, overrides: { recommendationData: () => ({ tankId: 'tank',
    loading: false, dataAvailable: true, sensor: data.sensor, scan: data.scan, thresholds: data.thresholds,
    paired: true, serverTime: data.at }) } });
  const combine = env.load('src/utils/sensorMonitoring.js').combineMonitoringReadings;
  data.seed.latestReading = combine(data.sensor, data.scan);
  data.tank.latest_reading = data.seed.latestReading;
  await env.load('src/utils/serverClock.js').fetchServerTime();
  env.render(item.file, data.props);
  const tree = env.tree;
  let nav = null;
  const tab = { DashboardScreen: 'home', MarketplaceScreen: 'market', AiGuideScreen: 'aiGuide', ReportsScreen: 'reports', SettingsScreen: 'settings' }[id];
  if (tab) {
    const navEnv = harness({ mode, width });
    navEnv.render('src/components/ui/BottomNav.js', { activeTab: tab }); nav = navEnv.tree;
  }
  const content = renderToStaticMarkup(React.createElement(Web.View, { style: { flex: 1 } }, webTree(tree, scale), webTree(nav, scale, 'nav')));
  const sheet = Web.StyleSheet.getSheet();
  env.unmount();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${id} — ${mode}</title><style>${sheet.textContent}\n${fonts}\nhtml,body,#app{margin:0;width:100%;height:100%;}#app{display:flex;flex-direction:column;overflow:hidden;}body{font-family:Arial,sans-serif;background:${mode === 'dark' ? '#061826' : '#FBF9F1'};}*{box-sizing:border-box;}::-webkit-scrollbar{width:0;height:0;}</style></head><body><div id="app" data-screen="${id}" data-width="${width}" data-height="${height}">${content}</div></body></html>`;
}

module.exports = { cases, page };
