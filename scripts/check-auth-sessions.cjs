/* global __dirname, Buffer */
// Offline regression fixtures. No real accounts, credentials, or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { createClient, processLock, AuthApiError, AuthRetryableFetchError } = require('@supabase/supabase-js');
const { harness } = require('./check-mobile-ui.cjs');
process.chdir(path.resolve(__dirname, '..'));
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
function storage() {
  const values = new Map();
  return { getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); } };
}

async function checkHook() {
  let state, callback, appCallback, reads = 0, authListeners = 0, authRemoved = 0, appRemoved = 0;
  let result = deferred();
  const db = { auth: {
    getSession() { reads++; return result.promise; },
    onAuthStateChange(fn) { authListeners++; callback = fn;
      return { data: { subscription: { unsubscribe() { authRemoved++; } } } }; },
  } };
  const ui = harness({ overrides: { supabase: db, appState: { currentState: 'active',
    addEventListener(event, fn) { appCallback = fn; return { remove() { appRemoved++; } }; } } } });
  const hook = ui.load('src/hooks/useAuthSession.js').default;
  ui.setRoot(() => { state = hook(); return null; });
  const render = () => { ui.render(); ui.flushEffects(); };
  const user = { user: { id: 'mobile-user' } };
  render(); assert.equal(state.authReady, false);
  callback('INITIAL_SESSION', null); render(); assert.equal(state.authReady, false);
  state.retryRestore(); state.retryRestore(); assert.equal(reads, 1, 'restoration requests coalesce');
  result.resolve({ data: { session: null }, error: new AuthRetryableFetchError('Offline', 0) });
  await settle(); render(); assert.equal(state.authReady, false); assert.match(state.restoreError, /connection/);
  result = deferred(); state.retryRestore(); callback('SIGNED_IN', user);
  result.resolve({ data: { session: null } }); await settle(); render();
  assert.equal(state.session, user, 'late startup result cannot replace a fresh login');
  assert.equal(state.authReady, true); assert.equal(state.restoreError, '');
  result = deferred(); appCallback('active');
  result.resolve({ data: { session: null }, error: new AuthRetryableFetchError('Offline', 503) });
  await settle(); render(); assert.equal(state.session, user, 'resume network failure retains identity');
  assert.equal(state.authReady, true);
  callback('INITIAL_SESSION', null); render(); assert.equal(state.session, user);
  result = deferred(); state.retryRestore(); callback('SIGNED_OUT', null);
  result.resolve({ data: { session: user } }); await settle(); render();
  assert.equal(state.session, null, 'late restored session cannot undo explicit logout');
  result = deferred(); state.retryRestore();
  result.resolve({ data: { session: null }, error: new AuthApiError('Revoked', 400, 'refresh_token_not_found') });
  await settle(); render(); assert.equal(state.session, null); assert.equal(state.authReady, true);
  assert.equal(state.restoreError, '', 'confirmed invalid refresh session requires login');
  callback('SIGNED_IN', user); callback('TOKEN_REFRESHED', { ...user }); render();
  assert.equal(state.session.user.id, 'mobile-user');
  render(); render(); assert.equal(authListeners, 1, 'retry and rerender never duplicate auth listeners');
  result = deferred(); state.retryRestore(); ui.unmount();
  const before = state; result.resolve({ data: { session: null } }); await settle();
  callback('SIGNED_OUT', null); appCallback('active');
  assert.equal(state, before); assert.equal(authRemoved, 1); assert.equal(appRemoved, 1);
  console.log('PASS startup gate, offline recovery, auth races, revocation, token events and listener cleanup');
}

async function checkNativeClient() {
  let options, appCallback, dispose, removed = 0, started = 0, stopped = 0;
  const initialization = deferred(), asyncStorage = storage();
  const appState = { currentState: 'background', addEventListener(event, fn) {
    appCallback = fn; return { remove() { removed++; } };
  } };
  const fake = { auth: { initialize: () => initialization.promise,
    startAutoRefresh() { started++; }, stopAutoRefresh() { stopped++; } } };
  const code = babel.transformSync(fs.readFileSync('src/lib/supabase.js', 'utf8'), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const sandbox = { exports: {}, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline-fixture-only' } },
    module: { hot: { dispose(fn) { dispose = fn; } } }, require(name) {
      if (name === 'react-native-url-polyfill/auto') return {};
      if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: appState };
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStorage };
      if (name === '@supabase/supabase-js') return { processLock, createClient(url, key, config) { options = config; return fake; } };
      if (name === './clientConfig') return { validatePublicSupabaseConfig() {} };
      throw new Error(`Unexpected import: ${name}`);
    } };
  vm.runInNewContext(code, sandbox);
  assert.equal(options.auth.storage, asyncStorage); assert.equal(options.auth.persistSession, true);
  assert.equal(options.auth.autoRefreshToken, true); assert.equal(options.auth.detectSessionInUrl, false);
  assert.equal(options.auth.lock, processLock);
  assert.equal(stopped, 0, 'lifecycle waits for initialization ticker');
  initialization.resolve({ error: null }); await settle(); assert.equal(stopped, 1);
  appCallback('active'); assert.equal(started, 1);
  appCallback('inactive'); assert.equal(stopped, 2);
  dispose(); assert.equal(removed, 1); assert.equal(stopped, 3);
  appCallback('active'); assert.equal(started, 1, 'disposed lifecycle cannot restart the ticker');
  const beforeEarlyDispose = stopped;
  vm.runInNewContext(code, { ...sandbox, exports: {} });
  dispose(); await settle();
  assert.equal(stopped, beforeEarlyDispose + 2, 'initialization after disposal also stops the old ticker');
  console.log('PASS native AsyncStorage persistence, refresh lock, AppState initialization ordering and cleanup');
}

async function checkSdkPersistence() {
  const sessions = new Map(); let number = 0, refreshes = 0, offline = false, lifetime = 3600;
  const signoutScopes = [], user = { id: 'same-account', email: 'fixture@example.invalid' };
  const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
  });
  function newSession() {
    const expires = Math.floor(Date.now() / 1000) + lifetime;
    const id = ++number;
    const jwt = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({
      sub: user.id, exp: expires, session_id: `session-${id}`,
    })).toString('base64url')}.offline-test-signature`;
    const session = { access_token: jwt, refresh_token: `fixture-refresh-${id}`,
      token_type: 'bearer', expires_in: lifetime, expires_at: expires, user };
    sessions.set(session.refresh_token, session); return session;
  }
  async function fetchFixture(url, init) {
    if (offline) return response({ msg: 'Offline fixture' }, 503);
    const target = new URL(url);
    if (target.pathname.endsWith('/token')) {
      const body = JSON.parse(init.body);
      if (target.searchParams.get('grant_type') === 'refresh_token') {
        refreshes++;
        if (!sessions.delete(body.refresh_token)) return response({ code: 'refresh_token_not_found', msg: 'Revoked fixture' }, 400);
      }
      return response(newSession());
    }
    if (target.pathname.endsWith('/logout')) {
      const scope = target.searchParams.get('scope'); signoutScopes.push(scope);
      const access = init.headers.Authorization.replace('Bearer ', '');
      for (const [key, value] of sessions) if (scope === 'global' || value.access_token === access) sessions.delete(key);
      return response({});
    }
    throw new Error(`Unexpected fixture route: ${target.pathname}`);
  }
  const clients = [];
  function client(saved) {
    const instance = createClient('https://fixture.supabase.co', 'sb_publishable_offline-fixture-only', {
      auth: { storage: saved, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, lock: processLock },
      global: { fetch: fetchFixture },
    }); clients.push(instance); return instance;
  }
  const mobileStorage = storage(), webStorage = storage();
  const mobile = client(mobileStorage), web = client(webStorage);
  try {
    const credentials = { email: user.email, password: 'offline-fixture-only' };
    assert.equal((await mobile.auth.signInWithPassword(credentials)).error, null);
    assert.equal((await web.auth.signInWithPassword(credentials)).error, null);
    assert.equal(sessions.size, 2, 'same account has independent device sessions');
    const a = (await mobile.auth.getSession()).data.session, b = (await web.auth.getSession()).data.session;
    assert.equal(a.user.id, b.user.id); assert.notEqual(a.refresh_token, b.refresh_token);
    const reopened = client(mobileStorage);
    assert.equal((await reopened.auth.getSession()).data.session.user.id, user.id, 'new process/client restores stored session');
    assert.equal((await reopened.auth.refreshSession()).error, null); assert.equal(refreshes, 1);
    assert.equal((await web.auth.getSession()).data.session.refresh_token, b.refresh_token);
    offline = true;
    const retained = (await reopened.auth.getSession()).data.session;
    assert.equal(retained.user.id, user.id, 'unexpired persisted session survives offline read');
    offline = false;
    assert.equal((await reopened.auth.signOut({ scope: 'local' })).error, null);
    assert.equal(signoutScopes.join(','), 'local'); assert.equal(sessions.size, 1);
    assert.equal((await client(mobileStorage).auth.getSession()).data.session, null);
    assert.equal((await web.auth.refreshSession()).error, null, 'web can still refresh after mobile logout');
    lifetime = -1; // Fixture server issues an already expired access token.
    assert.equal((await mobile.auth.signInWithPassword(credentials)).error, null);
    lifetime = 3600;
    const beforeExpiryRefresh = refreshes;
    assert.ok((await mobile.auth.getSession()).data.session.expires_at > Date.now() / 1000);
    assert.equal(refreshes, beforeExpiryRefresh + 1, 'getSession refreshes an expired access token through the SDK');
    assert.equal((await web.auth.refreshSession()).error, null, 'mobile login preserves existing web session');
    const live = (await mobile.auth.getSession()).data.session;
    sessions.delete(live.refresh_token);
    assert.equal((await mobile.auth.refreshSession()).error.code, 'refresh_token_not_found');
    assert.equal((await mobile.auth.getSession()).data.session, null, 'SDK removes confirmed revoked session');
  } finally {
    for (const instance of clients) await instance.auth.stopAutoRefresh();
  }
  console.log('PASS installed Supabase SDK: persistent reopen, independent device sessions, local logout, refresh and revocation');
}

async function checkNavigation() {
  let authState = { session: null, authReady: false, restoreError: '', retryRestore() {} };
  let signouts = 0, deactivations = 0, rendered;
  const gate = deferred(), ui = harness();
  const jsx = (type, props, key) => ({ type, props, key });
  const code = babel.transformSync(fs.readFileSync('app/index.tsx', 'utf8'), {
    filename: 'app/index.tsx', configFile: false, babelrc: false, plugins: [
      ['@babel/plugin-transform-typescript', { isTSX: true }],
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  }).code;
  const exports = {};
  vm.runInNewContext(`${code}\nexports.RootNavigator = RootNavigator;`, { exports, console: { log() {} }, require(name) {
    if (name === 'react') return { __esModule: true, default: ui.react, ...ui.react };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-native') return new Proxy({ Platform: { OS: 'web' }, StyleSheet: { create: x => x },
      Alert: { alert() {} } }, { get: (object, key) => object[key] || key });
    if (name.endsWith('/ThemeContext')) return { useAppTheme: () => ({ colors: {} }) };
    if (name.endsWith('/useAuthSession')) return { __esModule: true, default: () => authState };
    if (name.endsWith('/useSingleFlight')) return ui.load('src/hooks/useSingleFlight.js');
    if (name.endsWith('/supabase')) return { supabase: { auth: { async signOut(options) {
      signouts++; assert.equal(options.scope, 'local'); await gate.promise;
      authState = { ...authState, session: null }; return { error: null };
    } } } };
    if (name.endsWith('/pushNotifications')) return { deactivateCurrentPushToken: async () => { deactivations++; } };
    return { __esModule: true, default: path.basename(name) };
  } });
  ui.setRoot(() => { rendered = exports.RootNavigator(); return rendered; });
  const render = () => { ui.render(); ui.flushEffects(); };
  const element = type => ui.elements.find(node => node.type === type);
  render(); element('SplashScreen').props.onFinish(); render();
  assert.ok(element('ActivityIndicator')); assert.equal(element('LandingScreen'), undefined);
  authState = { ...authState, authReady: true }; render(); render();
  element('LandingScreen').props.onLogin(); render();
  const oldLoginCallback = element('LoginScreen').props.onSuccess;
  oldLoginCallback(); render(); assert.ok(element('LoginScreen'), 'success callback alone cannot bypass session gate');
  authState = { ...authState, session: { user: { id: 'owner-A' } } }; render(); render();
  assert.ok(element('DashboardScreen')); assert.equal(rendered.key, 'owner-A');
  authState = { ...authState, session: { user: { id: 'owner-B' } } }; render(); render();
  assert.equal(rendered.key, 'owner-B', 'account change remounts the user data subtree');
  const logout = element('DashboardScreen').props.onLogout;
  const first = logout(), duplicate = logout(); await settle();
  assert.equal(signouts, 1); assert.equal(deactivations, 1);
  gate.resolve(); await Promise.all([first, duplicate]); render(); render();
  assert.ok(element('LandingScreen')); assert.equal(element('DashboardScreen'), undefined);
  oldLoginCallback(); render(); assert.ok(element('LandingScreen'), 'late login callback cannot undo sign-out');
  ui.unmount();
  console.log('PASS actual navigator: splash gating, session-driven dashboard, account key and single local logout');
}

async function checkDashboardRecovery() {
  let offline = true, reads = 0, appCallback, removed = 0, cleared = 0, late;
  const timers = [], queries = [];
  const db = { auth: { async getUser() {
    reads++; if (late) return late.promise;
    return offline ? { data: { user: null }, error: new Error('Offline') }
      : { data: { user: { id: 'owner', email: 'owner@example.invalid' } } };
  } }, rpc: async () => ({ data: new Date().toISOString() }), from(table) {
    const operations = [];
    const query = new Proxy({}, { get(object, name) {
      if (name === 'then') {
        queries.push({ table, operations });
        const result = Promise.resolve({ data: table === 'profiles' ? { username: 'Correct owner' } : [], error: null });
        return result.then.bind(result);
      }
      return (...args) => { operations.push([name, ...args]); return query; };
    } }); return query;
  } };
  const ui = harness({ overrides: { supabase: db,
    appState: { currentState: 'active', addEventListener(event, fn) { appCallback = fn; return { remove() { removed++; } }; } },
    setInterval(fn) { timers.push(fn); return fn; }, clearInterval() { cleared++; },
  } });
  ui.render('src/screens/main/DashboardScreen.js'); ui.flushEffects(); await settle(); ui.render();
  assert.ok(ui.texts.some(text => /Check your connection/.test(text)));
  const initialReads = reads; offline = false;
  appCallback('background'); timers[0](); await settle(); assert.equal(reads, initialReads);
  appCallback('active'); await settle(); ui.render(); ui.flushEffects();
  assert.ok(ui.texts.includes('Correct owner'));
  for (const query of queries.filter(row => ['profiles', 'tanks'].includes(row.table))) {
    assert.ok(query.operations.some(([op, field, value]) => op === 'eq' &&
      field === (query.table === 'profiles' ? 'id' : 'user_id') && value === 'owner'));
  }
  const afterResume = reads; timers[0](); await settle();
  assert.equal(reads, afterResume, 'healthy dashboard does not repeatedly reload profile/tank lists');
  late = deferred(); appCallback('background'); appCallback('active'); await settle(); ui.unmount();
  late.resolve({ data: { user: { id: 'previous-account' } } }); await settle();
  const afterCleanup = queries.length; timers[0](); await settle();
  assert.equal(queries.length, afterCleanup); assert.equal(removed, 1); assert.equal(cleared, 1);
  assert.equal(queries.filter(row => row.operations.some(([, , value]) => value === 'previous-account')).length, 0);
  console.log('PASS dashboard offline resume recovery, owned profile/tank queries and stale-account cleanup');
}

async function main() {
  await checkHook(); await checkNativeClient(); await checkSdkPersistence();
  await checkNavigation(); await checkDashboardRecovery();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
