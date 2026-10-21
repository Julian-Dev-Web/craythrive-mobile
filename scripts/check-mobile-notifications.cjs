/* global __dirname */
// Offline verification only: no live database, push, deployment or APK build.
const fs = require("fs"), path = require("path"), vm = require("vm");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const { PNG } = require("pngjs");
const babel = require("@babel/core"), parser = require("@babel/parser");
const { ESLint } = require("eslint");
process.chdir(path.resolve(__dirname, ".."));
const pushFile = "src/utils/pushNotifications.js", rootFile = "app/index.tsx";
const edgeFile = "supabase/functions/send-craythrive-push/index.ts";
const quiet = { log() {}, warn() {}, error() {} };
const read = file => fs.readFileSync(file, "utf8");
function transform(source, file) {
  return babel.transformSync(source, { filename: file, configFile: false, babelrc: false,
    plugins: [...(/\.tsx?$/.test(file) ? [["@babel/plugin-transform-typescript", { isTSX: file.endsWith(".tsx") }]] : []),
      "@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"] }).code;
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function pushClient(options = {}) {
  const calls = [], storage = new Map(), listeners = {}, removed = [];
  let cleared = 0, prompts = 0;
  const userId = options.userId || "owner";
  const token = "ExpoPushToken[device]";
  const db = { async rpc(name) { assert.equal(name, 'craythrive_server_time'); return { data: '2026-10-11T13:02:55Z' }; }, auth: {
    getUser: async () => ({ data: { user: { id: userId } } }),
    getSession: async () => ({ data: { session: { user: { id: options.currentUser || userId } } } }),
  }, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const chain = { upsert(payload, config) { call.payload = payload; call.config = config; return Promise.resolve({ error: options.saveError }); },
      update(payload) { call.payload = payload; return chain; }, eq(key, value) { call.filters.push([key, value]); return chain; },
      then(resolve) { return Promise.resolve({ error: options.saveError }).then(resolve); } };
    return chain;
  } };
  const asyncStorage = { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) };
  const notifications = {
    AndroidImportance: { MAX: 5 }, setNotificationHandler() {},
    setNotificationChannelAsync: async (id, config) => { calls.push({ channel: id, config }); },
    getPermissionsAsync: async () => options.denied ? { status: "denied", canAskAgain: false } : { status: "granted" },
    requestPermissionsAsync: async () => { prompts++; return { status: "granted" }; },
    getExpoPushTokenAsync: async () => ({ data: token }),
    getLastNotificationResponseAsync: async () => options.coldResponse || null,
    clearLastNotificationResponseAsync: async () => { cleared++; },
    ...Object.fromEntries(["Received", "ResponseReceived", "PushToken"].map(kind => [kind === "PushToken" ? "addPushTokenListener" : `addNotification${kind}Listener`, callback => {
      listeners[kind] = callback; return { remove: () => removed.push(kind) };
    }])),
  };
  const exports = {};
  vm.runInNewContext(transform(read(pushFile), pushFile), { exports, console: quiet, setTimeout, clearTimeout,
    require: name => name.endsWith('/serverClock') ? require('./check-mobile-ui.cjs').harness({ overrides: { supabase: db } }).load('src/utils/serverClock.js')
      : name.includes("async-storage") ? asyncStorage : name === "expo-constants" ? { executionEnvironment: options.expoGo ? "storeClient" : "standalone", expoConfig: { extra: { eas: { projectId: "project" } } } }
      : name === "expo-device" ? { isDevice: true } : name === "expo-notifications" ? notifications : name === "react-native" ? { Platform: { OS: options.web ? "web" : "android" } } : { supabase: db },
  });
  return { exports, calls, storage, listeners, removed, cleared: () => cleared, prompts: () => prompts };
}
function rootHarness(initial) {
  const ast = parser.parse(read(rootFile), { sourceType: "module", plugins: ["jsx", "typescript"] });
  const node = ast.program.body.find(n => n.id?.name === "RootNavigator");
  const slots = [], effects = [], pending = [];
  let index = 0, dirty = true, view, authListener, current = initial;
  const session = { user: { id: "owner" } };
  const model = { deactivations: 0, alerts: 0, logoutError: false };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const sandbox = vm.createContext({ React: react, console: quiet, useAppTheme: () => ({ colors: {} }),
    AppState: { addEventListener() { return { remove() {} }; } },
    isAuthApiError: require('@supabase/supabase-js').isAuthApiError,
    isAuthSessionMissingError: require('@supabase/supabase-js').isAuthSessionMissingError,
    useState(value) { const n = index++; if (!(n in slots)) slots[n] = value; return [slots[n], next => { const result = typeof next === "function" ? next(slots[n]) : next; if (result !== slots[n]) { slots[n] = result; dirty = true; } }]; },
    useRef(value) { const n = index++; if (!(n in slots)) slots[n] = { current: value }; return slots[n]; },
    useCallback(fn, deps) { const n = index++; if (!slots[n] || !equal(slots[n].deps, deps)) slots[n] = { deps, fn }; return slots[n].fn; },
    useEffect(fn, deps) { const n = index++; if (!equal(effects[n]?.deps, deps)) { effects[n]?.cleanup?.(); effects[n] = { deps }; pending.push(() => { effects[n].cleanup = fn(); }); } },
    supabase: { auth: {
      onAuthStateChange(fn) { authListener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: current === "saved" ? session : null }, error: current === "offline" ? new Error("offline") : null }),
      signOut: async () => { if (model.logoutError) return { error: new Error("offline") }; authListener("SIGNED_OUT", null); return { error: null }; },
    } }, deactivateCurrentPushToken: async () => { model.deactivations++; },
    Alert: { alert() { model.alerts++; } },
    ...Object.fromEntries(["SplashScreen", "LandingScreen", "MainShell", "LoginScreen", "RegisterScreen", "ForgotPasswordScreen", "AppScreen", "View", "Text", "TouchableOpacity", "ActivityIndicator"].map(name => [name, name])),
  });
  for (const name of ['useAuthSession', 'useSingleFlight']) {
    const file = `src/hooks/${name}.js`, source = read(file);
    const declaration = parser.parse(source, { sourceType: 'module' }).program.body
      .find(item => item.type === 'ExportDefaultDeclaration').declaration;
    vm.runInContext(transform(source.slice(declaration.start, declaration.end), file), sandbox);
  }
  vm.runInContext(transform(read(rootFile).slice(node.start, node.end), rootFile), sandbox);
  async function settle() {
    for (let i = 0; i < 15; i++) { if (dirty) { dirty = false; index = 0; view = sandbox.RootNavigator(); while (pending.length) pending.shift()(); } await flush(); }
    return view;
  }
  return { settle, model, setResult: value => { current = value; }, emit: (event, s) => authListener(event, s), session };
}
function edge(options = {}) {
  let handler; const calls = [], messages = [];
  const secret = "x".repeat(40);
  const record = options.record === null ? null : options.record || { id: "event", user_id: "owner", title: "Temperature alert", message: "Check your tank", type: "temperature_high" };
  const db = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const chain = { select() { return chain; }, eq(k, v) { call.filters.push([k, v]); return chain; }, in(k, v) { call.filters.push([k, v]); return chain; }, limit() { return chain; },
      update(value) { call.update = value; return chain; }, maybeSingle() { return chain; },
      then(resolve) {
        const data = call.update ? null : table === "notification_preferences" ? options.preferences || [] : table === "push_tokens" ? options.devices || [{ user_id: "owner", expo_push_token: "ExpoPushToken[device]" }] : record;
        return Promise.resolve({ data, error: options.preferenceError && table === "notification_preferences" ? new Error("policy") : null }).then(resolve);
      } };
    return chain;
  } };
  vm.runInNewContext(transform(read(edgeFile), edgeFile), {
    exports: {}, Response, TextEncoder, crypto: webcrypto, AbortController, console: quiet, setTimeout, clearTimeout,
    Deno: { serve(fn) { handler = fn; }, env: { get: name => name === "PUSH_WEBHOOK_SECRET" ? options.unconfigured ? null : secret : name === "EXPO_ACCESS_TOKEN" ? null : "server-only-test" } },
    require: name => name.includes('pumpActionWording')
      ? require('./check-mobile-ui.cjs').harness().load('supabase/functions/_shared/pumpActionWording.js')
      : ({ createClient: () => db }),
    fetch: async (url, init) => {
      assert.equal(url, "https://exp.host/--/api/v2/push/send");
      const sent = JSON.parse(init.body); messages.push(...sent);
      return new Response(options.html ? "bad gateway" : JSON.stringify({ data: sent.map(() => options.retired ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "receipt" }) }), { status: options.httpStatus || 200 });
    },
  });
  return { calls, messages, request: async (overrides = {}, authorized = true) => {
    const body = typeof overrides === "string" ? overrides : JSON.stringify({ schema: "public", table: "alerts", type: "INSERT", record: { id: "event", user_id: "forged-recipient" }, ...overrides });
    const response = await handler(new Request("https://local.invalid/push", { method: "POST", headers: authorized ? { "x-craythrive-webhook-secret": secret } : {}, body }));
    return { status: response.status, body: await response.json() };
  } };
}
function nodes(view, type) {
  const found = [];
  const visit = n => { if (!n || typeof n !== "object") return; if (n.type === type) found.push(n); (n.children || []).flat().forEach(visit); };
  visit(view); return found;
}
async function main() {
  const files = [rootFile, pushFile, edgeFile, "src/lib/supabase.js", "src/screens/SplashScreen.js", "src/screens/main/SettingsScreen.js", "scripts/prepare-mobile-icons.cjs", "scripts/check-mobile-notifications.cjs"];
  const preset = require.resolve("babel-preset-expo", { paths: [path.dirname(require.resolve("expo/package.json"))] });
  for (const file of files) {
    const source = read(file);
    const ast = parser.parse(source, { sourceType: "unambiguous", plugins: /\.tsx?$/.test(file) ? ["jsx", "typescript"] : ["jsx"] });
    for (const node of ast.program.body.filter(n => n.type === "ImportDeclaration")) {
      const name = node.source.value; if (/^(https:|jsr:)/.test(name)) continue;
      if (name.startsWith(".")) { const p = path.resolve(path.dirname(file), name); assert.ok([p, p + ".js", p + ".ts", p + ".tsx"].some(fs.existsSync)); }
      else require.resolve(name);
    }
    if (file.endsWith(".cjs")) continue;
    if (file === edgeFile) transform(source, file);
    else babel.transformSync(source, { filename: path.resolve(file), configFile: false, babelrc: false, presets: [[preset, { platform: "android" }]], caller: { name: "metro", platform: "android", supportsStaticESM: true } });
  }
  const config = JSON.parse(read("app.json")).expo;
  for (const file of [config.icon, config.android.icon, config.android.adaptiveIcon.foregroundImage]) {
    const png = PNG.sync.read(fs.readFileSync(file)); assert.equal(png.width, png.height); assert.ok(png.width >= 1024); assert.notEqual(file, "./assets/images/icon.png");
  }
  const plugin = config.plugins.find(p => Array.isArray(p) && p[0] === "expo-notifications")[1];
  assert.equal(plugin.defaultChannel, "craythrive-alerts");
  const mark = PNG.sync.read(fs.readFileSync(plugin.icon));
  assert.equal(mark.width, 96); assert.equal(mark.height, 96);
  let visible = 0, transparent = 0;
  for (let i = 0; i < mark.data.length; i += 4) { if (mark.data[i + 3]) { visible++; assert.equal(mark.data[i], 255); assert.equal(mark.data[i + 1], 255); assert.equal(mark.data[i + 2], 255); } else transparent++; }
  assert.ok(visible && transparent);
  console.log("PASS syntax/imports, Expo transforms, custom square app icon and transparent white notification icon");
  let appStateListener, starts = 0, stops = 0;
  const authOptions = [];
  const storageMock = { getItem() {}, setItem() {}, removeItem() {} };
  vm.runInNewContext(transform(read("src/lib/supabase.js"), "src/lib/supabase.js"), {
    exports: {}, module: {}, process: { env: { EXPO_PUBLIC_SUPABASE_URL: "https://local.invalid", EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-test" } }, console: quiet,
    require: name => name.includes("polyfill") ? {} : name === "react-native" ? { Platform: { OS: "android" }, AppState: { currentState: "active", addEventListener(event, fn) { appStateListener = fn; return { remove() {} }; } } }
      : name.includes("async-storage") ? storageMock : name.includes('clientConfig') ? { validatePublicSupabaseConfig() {} }
        : { createClient(url, key, options) { authOptions.push(options); return { auth: { initialize: async () => ({}), startAutoRefresh() { starts++; }, stopAutoRefresh() { stops++; } } }; } },
  });
  await flush(); // Apply foreground state after the client's auth initialization.
  assert.equal(authOptions[0].auth.persistSession, true); assert.equal(authOptions[0].auth.storage, storageMock);
  assert.equal(starts, 1);
  appStateListener("background"); appStateListener("active"); assert.equal(starts, 2); assert.equal(stops, 1);
  console.log("PASS foreground token-refresh lifecycle keeps persistent AsyncStorage login");
  const saved = rootHarness("saved"); let view = await saved.settle(); assert.equal(view.type, "SplashScreen"); view.props.onFinish(); view = await saved.settle(); assert.equal(view.type, "MainShell");
  saved.model.logoutError = true; await view.props.onLogout(); assert.equal((await saved.settle()).type, "MainShell"); assert.equal(saved.model.alerts, 1);
  saved.model.logoutError = false; await view.props.onLogout(); assert.equal((await saved.settle()).type, "LandingScreen");
  const empty = rootHarness("none"); view = await empty.settle(); view.props.onFinish(); assert.equal((await empty.settle()).type, "LandingScreen");
  const offline = rootHarness("offline"); view = await offline.settle(); view.props.onFinish(); view = await offline.settle(); assert.equal(view.type, "AppScreen"); assert.equal(nodes(view, "TouchableOpacity").length, 1);
  offline.setResult("saved"); nodes(view, "TouchableOpacity")[0].props.onPress(); assert.equal((await offline.settle()).type, "MainShell");
  console.log("PASS cold-start saved login, fresh install, offline restoration retry and failed/successful logout");
  const client = pushClient(); assert.equal((await client.exports.registerPushTokenForCurrentUser()).ok, true);
  const registration = client.calls.find(c => c.table === "push_tokens"); assert.equal(registration.payload.user_id, "owner"); assert.equal(registration.config.onConflict, "expo_push_token");
  assert.equal(registration.payload.last_seen_at, '2026-10-11T13:02:55.000Z', 'Push heartbeat uses database time');
  await client.exports.deactivateCurrentPushToken(); const disable = client.calls.find(c => c.payload?.is_active === false); assert.ok(disable.filters.some(([k, v]) => k === "user_id" && v === "owner")); assert.ok(disable.filters.some(([k]) => k === "expo_push_token"));
  for (const option of [{ denied: true }, { expoGo: true }, { web: true }, { currentUser: "someone-else" }, { saveError: new Error("policy") }]) {
    const test = pushClient(option); assert.equal((await test.exports.registerPushTokenForCurrentUser({ requestPermission: false })).ok, false); assert.equal(test.prompts(), 0);
  }
  const response = { actionIdentifier: "default", notification: { request: { identifier: "notice", content: { data: { user_id: "owner", screen: "marketplace" } } } } };
  const tapped = pushClient({ coldResponse: response }); let navigations = 0;
  const cleanup = tapped.exports.addPushNotificationListeners({ onResponse: () => { navigations++; } }); await flush(); await tapped.listeners.ResponseReceived(response); assert.equal(navigations, 1); assert.equal(tapped.cleared(), 1); cleanup(); assert.equal(tapped.removed.length, 3);
  const wrongAccount = pushClient({ coldResponse: response, currentUser: "other" }); wrongAccount.exports.addPushNotificationListeners({ onResponse: () => { throw new Error("Must not navigate another account's notice"); } }); await flush(); assert.equal(wrongAccount.cleared(), 0);
  console.log("PASS registration, denied permission, Expo Go guard, current-device logout and cold-start tap deduplication/account guard");
  const good = edge(); assert.equal((await good.request()).status, 200); assert.equal(good.messages.length, 1); const message = good.messages[0]; assert.equal(message.channelId, "craythrive-alerts"); assert.ok(message.title && message.body); assert.equal(message.data.user_id, "owner"); assert.equal(message.priority, "high"); assert.equal((await good.request()).status, 200); assert.equal(good.messages.length, 1);
  for (const [fixture, payload, authorized, status] of [
    [{}, {}, false, 401], [{ unconfigured: true }, {}, true, 503], [{}, "broken-json", true, 400], [{}, { type: "DELETE" }, true, 400], [{}, { table: "profiles" }, true, 400],
    [{ preferences: [{ user_id: "owner", tank_alerts: false }] }, {}, true, 200], [{ preferenceError: true }, {}, true, 502], [{ record: null }, {}, true, 200], [{ html: true }, {}, true, 502],
  ]) { const test = edge(fixture); assert.equal((await test.request(payload, authorized)).status, status); if (!fixture.html) assert.equal(test.messages.length, 0); }
  const retired = edge({ retired: true }); assert.equal((await retired.request()).status, 200); assert.ok(retired.calls.some(c => c.update?.is_active === false && c.filters.some(([k, v]) => k === "user_id" && v === "owner")));
  const chat = edge({ record: { id: "event", sender_id: "sender", receiver_id: "owner", thread_id: "thread" } }); await chat.request({ table: "marketplace_chat_messages" }); assert.equal(chat.messages[0].data.screen, "marketplace");
  const order = edge({ record: { id: "event", buyer_id: "buyer", seller_id: "owner", listing_id: "listing", status: "pending" } }); await order.request({ table: "marketplace_orders" }); assert.equal(order.messages[0].data.order_id, "event");
  const confirmed = edge({ record: { id: "event", buyer_id: "owner", seller_id: "seller", status: "confirmed" } }); await confirmed.request({ table: "marketplace_orders", type: "UPDATE", record: { id: "event", status: "confirmed" }, old_record: { status: "pending" } }); assert.equal(confirmed.messages[0].data.user_id, "owner");
  const unchanged = edge({ record: { id: "event", buyer_id: "owner", seller_id: "seller", status: "confirmed" } }); await unchanged.request({ table: "marketplace_orders", type: "UPDATE", record: { id: "event", status: "confirmed" }, old_record: { status: "confirmed" } }); assert.equal(unchanged.messages.length, 0);
  console.log("PASS authenticated server sender, canonical recipients, preference failures, Expo error handling, retired tokens, messages and order events");
  const lint = await new ESLint().lintFiles(files);
  const problems = lint.reduce((n, r) => n + r.errorCount + r.warningCount, 0);
  if (problems) console.log(await (await new ESLint().loadFormatter("stylish")).format(lint));
  assert.equal(problems, 0); console.log("PASS ESLint: 0 errors, 0 warnings");
  console.log("Mobile notification/login checks passed. Deployment, live delivery and APK build were not performed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
