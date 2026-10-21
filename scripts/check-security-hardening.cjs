/* global __dirname, Buffer */
// Offline malicious-input regressions. No API requests, database writes or APK build.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('node:child_process');
const babel = require('@babel/core');
const parser = require('@babel/parser');
const { ESLint } = require('eslint');
process.chdir(path.resolve(__dirname, '..'));
function load(file) {
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(code, { exports, URL, Uint8Array, require: name => {
    if (name === 'base-64') return { decode: text => Buffer.from(text, 'base64').toString('binary') };
    if (name.includes('supabase')) return { supabase: {} };
    throw new Error('Unexpected import');
  } });
  return exports;
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
  const file = path.join(dir, item.name);
  return item.isDirectory() ? walk(file) : /\.(?:js|tsx?|jsx)$/.test(file) ? [file] : [];
}); }
async function main() {
  const config = load('src/lib/clientConfig.js');
  const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test-signature`;
  config.validatePublicSupabaseConfig('https://project.supabase.co', jwt('anon'));
  config.validatePublicSupabaseConfig('https://project.supabase.co', 'sb_publishable_public-test-placeholder');
  for (const key of [jwt('service_role'), jwt('authenticated'), ['sb', 'secret', 'private-test-placeholder'].join('_'), 'invalid', '', null]) {
    assert.throws(() => config.validatePublicSupabaseConfig('https://project.supabase.co', key), /Only|Missing/);
  }
  for (const endpoint of ['http://project.supabase.co', 'https://user:password@project.supabase.co', 'javascript:alert(1)', '']) {
    assert.throws(() => config.validatePublicSupabaseConfig(endpoint, jwt('anon')));
  }
  console.log('PASS public-only Supabase configuration and HTTPS endpoint guard');
  const market = load('src/lib/marketplace.js');
  for (const link of ['javascript:alert(1)', 'data:text/html,x', 'file:///sdcard/private', 'intent://x', 'https://user:password@shop.example', 'https://shop.example\\evil', 'https://shop.example bad']) {
    assert.equal(market.normalizeStoreUrl(link), '', link);
  }
  assert.equal(market.normalizeStoreUrl('shop.example/product'), 'https://shop.example/product');
  assert.equal(market.normalizeStoreUrl('http://shop.example/product'), 'http://shop.example/product');
  const listing = { id: 'listing', seller_id: 'seller', status: 'active', quantity: 5, price: 100 };
  for (const quantity of [0, -1, NaN, Infinity, 1.1, 6, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => market.validateReservation(listing, 'buyer', quantity));
  }
  for (const price of [0, -1, Infinity, NaN]) assert.throws(() => market.validateReservation({ ...listing, price }, 'buyer', 1));
  assert.throws(() => market.validateReservation(listing, 'seller', 1));
  assert.throws(() => market.validateReservation({ ...listing, status: 'sold' }, 'buyer', 1));
  console.log('PASS seller URL schemes and numeric reservation validation (database authorization remains required)');
  const device = load('src/utils/deviceUrls.js');
  for (const [raw, expected] of [['192.168.4.1', 'http://192.168.4.1'], ['http://10.1.2.3/wifi', 'http://10.1.2.3'],
    ['https://172.16.0.2:8443/save', 'https://172.16.0.2:8443'], ['http://craythrive.local', 'http://craythrive.local']]) {
    assert.equal(device.normalizeDeviceBaseUrl(raw), expected);
  }
  for (const raw of ['https://evil.example', 'http://8.8.8.8/save', 'http://172.32.1.2', 'javascript:alert(1)',
    'http://user:password@192.168.4.1', 'http://192.168.4.1/redirect', 'http://192.168.4.1?destination=evil',
    'http://127.0.0.1', 'http://169.254.169.254', 'http://192.168.4.1#fragment', 'file:///x']) {
    assert.equal(device.normalizeDeviceBaseUrl(raw), null, raw);
  }
  console.log('PASS ESP32 private-network URL restriction and credential destination guards');
  const wifiSource = fs.readFileSync('src/screens/main/DeviceWifiSetupScreen.js', 'utf8');
  const wifiRequests = fs.readFileSync('src/utils/deviceWifi.js', 'utf8');
  assert.ok(wifiSource.includes("from 'expo/fetch'") && wifiSource.includes('findEsp32Wifi(baseline, fetchWithoutRedirects, controller.signal)'));
  assert.ok(wifiRequests.includes("redirect: 'error'"));
  const nativeRequest = fs.readFileSync('node_modules/expo/android/src/main/java/expo/modules/fetch/NativeRequest.kt', 'utf8');
  assert.ok(nativeRequest.includes('followRedirects(false)'), 'Use the installed native fetch implementation that enforces redirect rejection');
  await require('./check-device-wifi.cjs').main();
  const images = load('src/utils/uploadSecurity.js');
  for (const [bytes, ext] of [[[255, 216, 255, 0], 'jpg'], [[137, 80, 78, 71, 13, 10, 26, 10], 'png'],
    [[82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], 'webp']]) {
    assert.equal(images.validateImageBytes(new Uint8Array(bytes).buffer).fileExt, ext);
  }
  assert.throws(() => images.validateImageBytes(new Uint8Array([60, 115, 118, 103]).buffer));
  assert.throws(() => images.validateImageBytes(new ArrayBuffer(images.MAX_IMAGE_BYTES + 1)));
  assert.throws(() => images.validateSelectedImage({ uri: 'file:///fake.jpg', mimeType: 'image/svg+xml' }));
  assert.throws(() => images.validateSelectedImage({ uri: 'file:///big.jpg', fileSize: images.MAX_IMAGE_BYTES + 1 }));
  console.log('PASS image MIME allowlist, actual magic bytes and 5 MB size limit');
  for (const file of walk('src').concat(walk('app'))) {
    const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'console') {
        assert.ok(node.arguments.every(arg => ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(arg.type)), `${file}: logs must not dump raw objects`);
      }
      for (const [key, value] of Object.entries(node)) if (key !== 'loc') {
        if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
      }
    }
    visit(ast);
  }
  const forgot = fs.readFileSync('src/screens/auth/ForgotPasswordScreen.js', 'utf8');
  assert.ok(!forgot.includes('check_profile_email_exists') && !forgot.includes('.from("profiles")'));
  assert.ok(forgot.includes('If an account exists'));
  const forgotAst = parser.parse(forgot, { sourceType: 'module', plugins: ['jsx'] });
  const forgotScreen = forgotAst.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
  const sendReset = forgotScreen.body.body.flatMap(node => node.declarations || [])
    .find(node => node.id?.name === 'handleResetPassword').init.arguments[0];
  let resetCalls = 0, notice;
  const resetSandbox = vm.createContext({ email: 'farmer@example.invalid', validateEmail: () => '',
    setNoticeText: value => { notice = value; }, setErrorText() {}, setLoading() {}, console,
    supabase: { auth: { resetPasswordForEmail: async () => { resetCalls++; return { error: null }; } },
      rpc() { throw new Error('Anonymous email enumeration must not be called'); },
      from() { throw new Error('Recovery must not query profiles'); } } });
  vm.runInContext(`const send = ${forgot.slice(sendReset.start, sendReset.end)}; globalThis.send = send;`, resetSandbox);
  await resetSandbox.send();
  assert.equal(resetCalls, 1);
  assert.match(notice, /If an account exists/);
  resetSandbox.email = 'unregistered@example.invalid';
  const firstNotice = notice;
  await resetSandbox.send();
  assert.equal(notice, firstNotice);
  console.log('PASS actual password recovery avoids profiles/RPC lookups and gives the same success response');
  const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
  assert.equal(app.android.allowBackup, false);
  const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
  for (const name of ['development', 'preview', 'production']) assert.equal(eas.build[name].environment, name);
  const cloudEnv = { ...process.env, EAS_BUILD: 'true' };
  delete cloudEnv.NODE_ENV;
  for (const name of Object.keys(cloudEnv)) if (name.startsWith('EXPO_PUBLIC_')) delete cloudEnv[name];
  const checkBuild = variables => {
    const result = spawnSync(process.execPath, ['scripts/check-build-client-config.cjs'], {
      env: { ...cloudEnv, ...variables }, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  };
  for (const name of ['development', 'preview', 'production']) {
    const variables = eas.build[name].env;
    assert.ok(variables?.EXPO_PUBLIC_SUPABASE_URL, `${name}: public build endpoint required`);
    assert.ok(Object.keys(variables).every(key => ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].includes(key)));
    const result = checkBuild(variables);
    assert.equal(result.status, 0, `${name}: ${result.output}`);
    assert.ok(!result.output.includes('NODE_ENV'));
    for (const value of Object.values(variables)) assert.ok(!result.output.includes(value), 'Build checks must never log supplied values');
  }
  const publicBuild = { EXPO_PUBLIC_SUPABASE_URL: 'https://build-test.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') };
  const rejectedBuilds = [
    [{}, /Missing EXPO_PUBLIC_SUPABASE_URL/],
    [{ EXPO_PUBLIC_SUPABASE_URL: publicBuild.EXPO_PUBLIC_SUPABASE_URL }, /Missing public Supabase key/],
    [{ ...publicBuild, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') }, /Only a Supabase publishable/],
    [{ ...publicBuild, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('authenticated') }, /Only a Supabase publishable/],
    [{ ...publicBuild, EXPO_PUBLIC_UNAPPROVED_TEST: 'test-value-withheld' }, /unapproved EXPO_PUBLIC/],
    [{ ...publicBuild, EXPO_PUBLIC_SUPABASE_URL: 'https://private-user:private-password@build-test.supabase.co' }, /HTTPS without credentials/],
    [{ ...publicBuild, EXPO_PUBLIC_SUPABASE_URL: 'invalid-endpoint-withheld' }, /valid HTTPS URL/],
  ];
  for (const [variables, message] of rejectedBuilds) {
    const result = checkBuild(variables);
    assert.equal(result.status, 1);
    assert.match(result.output, message);
    assert.ok(!result.output.includes('NODE_ENV'));
    for (const value of Object.values(variables)) assert.ok(!result.output.includes(value), 'Rejected build config must remain redacted');
  }
  console.log('PASS all EAS profiles without .env/NODE_ENV; missing, private and unapproved config rejected without values');
  const ignore = fs.readFileSync('.easignore', 'utf8');
  for (const pattern of ['.env*', 'credentials.json', '*.keystore', '/eas-archive', '/supabase', '/.git']) assert.ok(ignore.includes(pattern));
  assert.ok(fs.readFileSync('.gitignore', 'utf8').includes('.env*'));
  console.log('PASS payload-free client logging, non-enumerating recovery, Android backup and build archive protections');
  const eslint = new ESLint();
  const lint = await eslint.lintFiles(['src', 'app', 'supabase/functions', 'scripts/check-release-security.cjs', 'scripts/check-security-hardening.cjs', 'scripts/check-build-client-config.cjs']);
  const problems = lint.reduce((n, row) => n + row.errorCount + row.warningCount, 0);
  if (problems) console.log(await (await eslint.loadFormatter('stylish')).format(lint));
  assert.equal(problems, 0);
  console.log('PASS security hardening ESLint: 0 errors, 0 warnings');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
