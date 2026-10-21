/* global __dirname */
// Offline render/interaction checks. No live accounts, hardware commands, or APK build.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { ESLint } = require('eslint');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const quiet = { log() {}, warn() {}, error() {} };
const sourceCache = new Map();
function source(file) {
  if (!sourceCache.has(file)) sourceCache.set(file, fs.readFileSync(file, 'utf8'));
  return sourceCache.get(file);
}
function list(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? list(path.join(dir, entry.name)) : /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
function ast(file) { return parser.parse(source(file), { sourceType: 'module', plugins: ['jsx', 'typescript'] }); }
function compile(file) {
  return babel.transformSync(source(file), { filename: file, configFile: false, babelrc: false,
    plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'] }).code;
}
function flatten(style) {
  return Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness({ mode = 'light', width = 320, seed = {}, overrides = {} } = {}) {
  const cache = new Map(), names = new WeakMap(), frames = new Map(), listeners = [], calls = [];
  let current, palette;
  const pendingEffects = [], keyboardListeners = [];
  const authUser = { id: 'user', email: 'farmer@example.com' };
  const supabase = {
    async rpc(name) { assert.equal(name, 'craythrive_server_time'); return { data: new Date().toISOString() }; },
    auth: {
      async getUser() { return { data: { user: authUser } }; },
      async getSession() { return { data: { session: { user: authUser } } }; },
      async signInWithPassword(payload) { calls.push(['login', payload]); return { data: { user: authUser } }; },
      async updateUser(payload) { calls.push(['updateUser', payload]); return { data: { user: authUser } }; },
      async signOut() { return { error: null }; },
    },
    from(table) {
      const ops = [];
      const query = new Proxy({}, { get(object, name) {
        if (name === 'then') {
          const operation = ops.find(([op]) => ['insert', 'update', 'upsert'].includes(op));
          if (operation) calls.push([table, ...operation]);
          const data = table === 'profiles' ? { id: 'user', username: 'Farmer' }
            : table === 'tanks' && operation ? { id: 'new-tank', ...operation[1] }
              : table === 'ammonia_readings' && operation ? { id: 'saved-scan', created_at: '2026-10-17T04:00:00Z', ...operation[1] } : null;
          const result = Promise.resolve({ data, error: null });
          return result.then.bind(result);
        }
        return (...args) => { ops.push([name, ...args]); return query; };
      } });
      return query;
    },
    channel() { return { on() { return this; }, subscribe() {} }; }, removeChannel() {},
  };
  function slot(init) {
    assert.ok(current, 'hooks run inside a component');
    const index = current.cursor++;
    if (!(index in current.slots)) current.slots[index] = init();
    return current.slots[index];
  }
  function same(a, b) { return a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])); }
  const react = {
    useState(initial) {
      const frame = current, name = frame.stateNames[frame.stateCursor++];
      const stored = slot(() => ({ value: Object.hasOwn(frame.seed, name) ? frame.seed[name]
        : typeof initial === 'function' ? initial() : initial }));
      return [stored.value, next => { stored.value = typeof next === 'function' ? next(stored.value) : next; }];
    },
    useRef(initial) { return slot(() => ({ current: initial })); },
    useMemo(fn, deps) { const stored = slot(() => ({}));
      if (!same(stored.deps, deps)) { stored.value = fn(); stored.deps = deps; } return stored.value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const stored = slot(() => ({}));
      if (!same(stored.deps, deps)) { stored.deps = deps; pendingEffects.push(() => { stored.cleanup?.(); stored.cleanup = fn(); }); } },
  };
  react.createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
  const rn = new Proxy({
    StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} },
    Platform: { OS: 'android' }, useWindowDimensions: () => ({ width, height: 640 }),
    BackHandler: { addEventListener(name, callback) {
      const listener = { callback, alive: true }; listeners.push(listener);
      return { remove: () => { listener.alive = false; } };
    } },
    Keyboard: { isVisible: () => false, addListener(name, callback) {
      const listener = { name, callback, alive: true }; keyboardListeners.push(listener);
      return { remove: () => { listener.alive = false; } };
    } },
    Alert: { alert: overrides.alert || (() => {}) },
    Linking: { canOpenURL: async () => true, openURL: async () => {} },
    Animated: {
      Value: class Value { constructor(value) { this.value = value; } interpolate({ outputRange }) { return outputRange[this.value ? outputRange.length - 1 : 0]; } },
      View: 'AnimatedView', spring: () => ({ start() {} }), timing: () => ({ start() {} }),
      parallel: () => ({ start() {}, stop() {} }), sequence: () => ({ start() {}, stop() {} }),
    },
    Easing: { out: x => x, cubic: x => x, inOut: x => x, quad: x => x },
    Dimensions: { get: () => ({ width, height: 640 }) },
  }, { get: (object, key) => object[key] || key });
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    vm.runInNewContext(compile(file), { exports, URL, AbortController, performance, console: quiet, setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
      setInterval: overrides.setInterval || (() => 1), clearInterval: overrides.clearInterval || (() => {}), fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
      require(specifier) {
        if (specifier === 'react') return { __esModule: true, default: react, ...react };
        if (specifier === '@supabase/supabase-js') return require(specifier);
        if (specifier === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };
        if (specifier === 'react-native') return overrides.appState ? { ...rn, AppState: overrides.appState } : rn;
        if (specifier === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView',
          useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) };
        if (specifier === '@expo/vector-icons') return { Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' };
        if (specifier === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
        if (specifier === 'expo/fetch') return { fetch: overrides.esp32Fetch || (async () => ({ ok: true })) };
        if (specifier === 'expo-notifications') return { setNotificationHandler() {} };
        if (specifier === 'react-native-svg') return new Proxy({ __esModule: true, default: 'Svg' }, { get: (o, k) => o[k] || k });
        if (specifier === 'expo-camera') return { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, async () => {}] };
        if (specifier === 'base-64') return { decode: text => Buffer.from(text, 'base64').toString('binary') };
        if (specifier === 'expo-file-system/legacy') return { readAsStringAsync: async () => '' };
        if (specifier === 'expo-image-picker') return { requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
          launchImageLibraryAsync: async () => ({ canceled: true }) };
        if (specifier.includes('ThemeContext')) return { useAppTheme: () => ({ colors: palette[mode === 'dark' ? 'DARK_COLORS' : 'LIGHT_COLORS'], isDark: mode === 'dark' }) };
        if (specifier.endsWith('/supabase')) return { supabase: overrides.supabase || supabase };
        if (specifier.endsWith('/deviceWifi') && overrides.deviceWifi) return overrides.deviceWifi;
        if (specifier.endsWith('/useTankRecommendationData') && overrides.recommendationData) return {
          __esModule: true, default: overrides.recommendationData };
        if (specifier.endsWith('/useTankActivity') && overrides.activityData) return { __esModule: true, default: overrides.activityData };
        if (specifier.includes('services/aiGuideService')) return { requestCraythriveAi: async () => ({}),
          buildAiTankContext: overrides.buildAiContext || (async () => ({})),
          askCrayThriveAi: overrides.askAi || (async () => ({ answer: 'Review your saved tank readings.' })),
          getAiFailureMessage: overrides.aiFailureMessage || (() => 'CrayThrive AI is temporarily unavailable. Please try again.'),
          applyAiThresholdSuggestion: overrides.apply || (async () => ({})) };
        if (/\.(png|jpg)$/.test(specifier)) return 1;
        if (specifier.startsWith('.')) {
          const target = path.resolve(path.dirname(file), specifier);
          const resolved = [target, target + '.js', target + '.ts'].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
          if (resolved && resolved.endsWith('.js')) return load(resolved);
        }
        return {};
      },
    }, { filename: file });
    const tree = ast(file);
    for (const node of tree.program.body) {
      const declaration = node.type === 'ExportDefaultDeclaration' ? node.declaration : node;
      if (declaration.type !== 'FunctionDeclaration') continue;
      const stateNames = declaration.body.body.filter(n => n.type === 'VariableDeclaration')
        .flatMap(n => n.declarations).filter(n => n.init?.callee?.name === 'useState' && n.id.type === 'ArrayPattern')
        .map(n => n.id.elements[0]?.name);
      const fn = node.type === 'ExportDefaultDeclaration' ? exports.default : exports[declaration.id?.name];
      if (typeof fn === 'function') names.set(fn, stateNames);
    }
    if (file.includes(path.sep + 'hooks' + path.sep) && typeof exports.default === 'function') {
      const hook = exports.default, stateNames = names.get(hook) || [];
      exports.default = (...args) => {
        const frame = current, previousNames = frame.stateNames, previousCursor = frame.stateCursor;
        frame.stateNames = stateNames; frame.stateCursor = 0;
        try { return hook(...args); } finally { frame.stateNames = previousNames; frame.stateCursor = previousCursor; }
      };
      names.set(exports.default, stateNames);
    }
    return exports;
  }
  palette = load('src/constants/theme.js');
  let rootFn, props, resolvedTree;
  const elements = [], texts = [];
  function invoke(fn, input, key) {
    if (!frames.has(key)) frames.set(key, { slots: [], stateNames: names.get(fn) || [], seed: key === 'root' ? seed : {} });
    const before = current;
    current = frames.get(key); current.cursor = 0; current.stateCursor = 0;
    const result = fn(input); current = before;
    return result;
  }
  function walk(node, key) {
    if (node == null || typeof node === 'boolean') return null;
    if (Array.isArray(node)) return node.map((child, i) => walk(child, `${key}/${i}`));
    if (typeof node !== 'object') { texts.push(String(node)); return node; }
    if (typeof node.type === 'function') return walk(invoke(node.type, node.props || {}, key), key + '/child');
    elements.push(node);
    return { ...node, props: { ...node.props, children: walk(node.props?.children, key + '/children') } };
  }
  function render(file, input = {}) { if (file) { rootFn = load(file).default; props = input; }
    elements.length = 0; texts.length = 0; resolvedTree = walk(invoke(rootFn, props, 'root'), 'tree'); return elements; }
  function flushEffects() { while (pendingEffects.length) pendingEffects.shift()(); }
  return { load, render, elements, texts, calls, palette, react, supabase, get tree() { return resolvedTree; },
    flushEffects, back() { flushEffects(); return listeners.filter(x => x.alive).at(-1)?.callback(); },
    keyboard(visible) { flushEffects(); keyboardListeners.filter(x => x.alive && x.name === (visible ? 'keyboardDidShow' : 'keyboardDidHide')).forEach(x => x.callback()); },
    unmount() { for (const frame of frames.values()) for (const stored of frame.slots) stored.cleanup?.(); },
    setRoot(fn, input = {}) { rootFn = fn; props = input; },
  };
}
async function main() {
  const files = [...list('src'), ...list('app')];
  const preset = require.resolve('babel-preset-expo', { paths: [path.dirname(require.resolve('expo/package.json'))] });
  const ion = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
  const material = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
  for (const file of files) {
    const tree = ast(file);
    for (const node of tree.program.body.filter(n => n.type === 'ImportDeclaration')) {
      const name = node.source.value;
      if (name.startsWith('.') || name.startsWith('@/')) {
        const target = name.startsWith('@/') ? path.resolve(root, name.slice(2)) : path.resolve(path.dirname(file), name);
        assert.ok([target, target + '.js', target + '.ts', target + '.tsx', path.join(target, 'index.js')].some(fs.existsSync), `${file}: ${name}`);
      } else {
        const resolved = ['', '.ts', '.tsx', '/index.ts'].some(suffix => {
          try { require.resolve(name + suffix); return true; } catch { return false; }
        });
        assert.ok(resolved, `${file}: missing package ${name}`);
      }
    }
    traverse(tree, { JSXOpeningElement(p) {
      const component = p.node.name.name, glyphs = component === 'Ionicons' ? ion : component === 'MaterialCommunityIcons' ? material : null;
      if (!glyphs) return;
      const name = p.node.attributes.find(n => n.name?.name === 'name');
      if (name?.value?.type === 'StringLiteral') assert.ok(glyphs[name.value.value], `${file}: invalid ${name.value.value}`);
      else if (name?.value?.type === 'JSXExpressionContainer') {
        function checkValue(n) {
          if (n.type === 'StringLiteral') assert.ok(glyphs[n.value], `${file}: invalid icon ${n.value}`);
          else if (n.type === 'ConditionalExpression') { checkValue(n.consequent); checkValue(n.alternate); }
          else if (n.type === 'LogicalExpression') { checkValue(n.left); checkValue(n.right); }
        }
        checkValue(name.value.expression);
      }
    } });
    babel.transformSync(source(file), { filename: path.resolve(file), configFile: false, babelrc: false,
      presets: [[preset, { platform: 'android' }]], caller: { name: 'metro', platform: 'android', supportsStaticESM: true } });
  }
  console.log(`PASS syntax/imports, installed icon names and Expo Android transforms (${files.length} files)`);
  const screens = list('src/screens');
  for (const mode of ['dark', 'light']) for (const file of screens) {
    const env = harness({ mode, seed: { loading: false, isLoadingThresholds: false, profileLoaded: true, email: 'farmer@example.com' } });
    env.render(file, { onBack() {}, onSuccess() {}, onFinish() {}, tank: { id: 'tank', tank_name: 'A very long farmer tank name' } });
    assert.ok(env.elements.length, `${file} renders in ${mode}`);
  }
  console.log(`PASS all ${screens.length} screens render in light/dark mode without hook or undefined-variable failures`);
  for (const width of [320, 360, 412, 600]) for (const mode of ['light', 'dark']) {
    const env = harness({ width, mode }); env.render('src/components/ui/BottomNav.js', { activeTab: 'settings' });
    const pills = env.elements.filter(n => n.type === 'AnimatedView' && flatten(n.props.style).height === 52);
    const totalWidth = pills.reduce((sum, n) => sum + flatten(n.props.style).width, 0);
    assert.ok(totalWidth + 28 + 22.6 <= width + 0.01);
    assert.ok(pills.every(n => flatten(n.props.style).width >= 44));
    assert.ok(env.elements.some(n => flatten(n.props.style).bottom === 32));
  }
  console.log('PASS 320/360/412/600 dp navigation fits five targets and clears the Android bottom inset');
  const keyboard = harness(); keyboard.render('src/components/ui/BottomNav.js', { activeTab: 'home' });
  keyboard.keyboard(true); keyboard.render(); assert.equal(keyboard.elements.length, 0);
  keyboard.keyboard(false); keyboard.render(); assert.ok(keyboard.elements.some(n => n.type === 'AnimatedView'));
  const chatKeyboard = harness({ seed: { loading: false, tanks: [{ id: 'tank', tank_name: 'Farm' }], selectedTankId: 'tank' } });
  chatKeyboard.render('src/screens/main/AiGuideScreen.js'); chatKeyboard.keyboard(true); chatKeyboard.render();
  assert.ok(chatKeyboard.elements.some(n => n.type === 'TextInput' && n.props.placeholder?.includes('Ask about')));
  assert.ok(chatKeyboard.elements.some(n => flatten(n.props.style).paddingBottom === 8));
  assert.ok(!chatKeyboard.texts.includes('AI & Guide'));
  console.log('PASS keyboard hides overlapping tabs and frees space for the AI composer');
  const image = harness(); image.render('src/components/ui/ResilientImage.js', { source: { uri: 'https://example.com/broken.jpg' }, style: { width: 200, height: 120 } });
  image.elements.find(n => n.type === 'Image').props.onError({}); image.render();
  assert.ok(image.elements.some(n => n.type === 'Ionicons' && n.props.name === 'image-outline'));
  assert.ok(!image.elements.some(n => n.type === 'Image'));
  image.render('src/components/ui/ResilientImage.js', { source: { uri: 'https://example.com/replacement.jpg' }, style: { width: 200, height: 120 } });
  assert.equal(image.elements.find(n => n.type === 'Image').props.resizeMode, 'cover');
  console.log('PASS failed remote image keeps dimensions, shows a placeholder and permits a new URI');
  const callbacks = { back: 0 };
  for (const file of ['AddTankScreen', 'TankDetailsScreen', 'DeviceWifiSetupScreen', 'AmmoniaReaderScreen',
    'GuideLessonDetailsScreen', 'settings/EditProfileScreen', 'settings/SecurityScreen', 'settings/DefaultThresholdsScreen', 'settings/AboutCrayThriveScreen']) {
    const env = harness({ seed: { loading: false } });
    env.render(`src/screens/main/${file}.js`, { onBack: () => callbacks.back++, tank: { id: 'tank' } });
    const before = callbacks.back; assert.equal(env.back(), true); assert.equal(callbacks.back, before + 1);
    env.unmount();
  }
  const blocked = harness({ seed: { loading: true } }); blocked.render('src/screens/main/AddTankScreen.js', { onBack: () => callbacks.back++ });
  const before = callbacks.back; assert.equal(blocked.back(), true); assert.equal(callbacks.back, before);
  console.log('PASS nested Android Back destinations and busy form Back interception');
  const shared = harness(); const gate = deferred(); let actions = 0, run;
  shared.setRoot(() => { run = shared.load('src/hooks/useSingleFlight.js').default(async () => { actions++; return gate.promise; }); return null; });
  shared.render(); const first = run(), second = run(); assert.equal(first, second);
  await Promise.resolve(); assert.equal(actions, 1); gate.resolve('saved'); await first;
  shared.render(); await run(); assert.equal(actions, 2);
  console.log('PASS mutation/refresh lock is synchronous, coalesces duplicates and releases after completion');
  const add = harness({ seed: { tankName: 'Farmer Tank', tankType: 'juvenile', juvenileCount: '12' } });
  add.render('src/screens/main/AddTankScreen.js');
  const submit = add.elements.find(n => n.type === 'TouchableOpacity' && n.props.accessibilityLabel?.includes('Create'));
  assert.ok(submit, 'create tank button');
  await Promise.all([submit.props.onPress(), submit.props.onPress()]);
  assert.equal(add.calls.filter(([table, op]) => table === 'tanks' && op === 'insert').length, 1);
  assert.equal(add.calls.find(([table]) => table === 'tanks')[2].has_paired_device, false);
  const login = harness({ seed: { email: 'farmer@example.com', password: 'Test1234' } }); login.render('src/screens/auth/LoginScreen.js');
  const signIn = login.elements.find(n => n.type === 'TouchableOpacity' && flatten(n.props.style).backgroundColor === login.palette.LIGHT_COLORS.accent2);
  await Promise.all([signIn.props.onPress(), signIn.props.onPress()]); assert.equal(login.calls.filter(([op]) => op === 'login').length, 1);
  console.log('PASS real Add Tank and Login rapid taps produce one mocked mutation/auth request');
  const app = harness(); app.render('src/components/ui/AppButton.js', { title: 'A long action label for a narrow phone', loading: true });
  const button = app.elements.find(n => n.type === 'TouchableOpacity'); assert.equal(button.props.disabled, true);
  assert.equal(button.props.accessibilityState.busy, true); assert.equal(flatten(button.props.style).minHeight, 56);
  const dashboard = harness({ seed: { loading: false, tanks: [{ id: 'tank', tank_name: 'Very long farm tank', tank_type: 'juvenile', has_paired_device: false }] } });
  dashboard.render('src/screens/main/DashboardScreen.js');
  for (const title of ['Temperature', 'pH', 'Water Clarity', 'Water Depth']) assert.ok(dashboard.texts.includes(title));
  assert.ok(dashboard.texts.filter(text => text === 'No Reading').length >= 4);
  const water = harness({ seed: { isLoadingThresholds: false } }); water.render('src/screens/main/settings/DefaultThresholdsScreen.js');
  assert.ok(water.texts.some(text => /^≥ .+ cm$/.test(text))); assert.ok(!water.texts.some(text => /4\.5.*6\.2 cm/.test(text)));
  console.log('PASS loading button state, all four missing-data dashboard metrics and honest minimum-depth threshold');
  let applies = 0;
  const applyGate = deferred();
  const ai = harness({ seed: { loading: false, selectedTankId: 'tank', tanks: [{ id: 'tank', tank_name: 'Farm' }],
    chatByTank: { tank: [{ id: 'suggestion', role: 'assistant', action: 'suggest_threshold_change', text: 'Review threshold',
      thresholdSuggestion: { parameter: 'temperature', suggested_min: 22, suggested_max: 29 } }] } },
    overrides: { alert(title, message, buttons) { buttons?.find(item => item.text?.includes('Apply'))?.onPress?.(); },
      apply: async () => { applies++; return applyGate.promise; } } });
  ai.render('src/screens/main/AiGuideScreen.js');
  const apply = ai.elements.find(n => n.type === 'TouchableOpacity' && n.props.onPress && flatten(n.props.style).backgroundColor === ai.palette.LIGHT_COLORS.accent
    && ai.elements.indexOf(n) > ai.elements.findIndex(x => x.type === 'Text' && x.props.children?.includes?.('AI suggested adjustment')));
  assert.ok(apply, 'AI Apply Threshold action');
  const apply1 = apply.props.onPress(), apply2 = apply.props.onPress();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(applies, 1); applyGate.resolve({}); await Promise.all([apply1, apply2]);
  await apply.props.onPress(); assert.equal(applies, 1); // stale button callback also cannot apply a saved suggestion twice
  console.log('PASS AI confirmation/save lock and already-applied suggestion guard');
  const lint = await new ESLint().lintFiles(['src', 'app', 'scripts/check-mobile-ui.cjs']);
  const problems = lint.reduce((sum, result) => sum + result.errorCount + result.warningCount, 0);
  if (problems) console.log(await (await new ESLint().loadFormatter('stylish')).format(lint));
  assert.equal(problems, 0);
  console.log('PASS complete mobile ESLint: 0 errors, 0 warnings');
  console.log('Mobile UI checks passed. Native phone layout and live delivery still require device testing.');
}
module.exports = { harness, flatten, deferred };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
