/* global __dirname */
// Exercises real mobile handlers with isolated mocks: no network, accounts or hardware.
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
const { harness, flatten, deferred } = require('./check-mobile-ui.cjs');
process.chdir(path.resolve(__dirname, '..'));
let failed = 0, passed = 0;
async function check(name, run) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
function submit(env, screen) {
  if (screen === 'login' || screen === 'register') {
    return env.elements.find(node => node.type === 'TouchableOpacity' && flatten(node.props.style).backgroundColor === env.palette.LIGHT_COLORS.accent2);
  }
  if (screen === 'forgot') return env.elements.find(node => node.type === 'TextInput' && node.props.onSubmitEditing)?.props;
  return env.elements.find(node => node.type === 'TouchableOpacity' && node.props.onPress?.name === 'handleSave');
}
const authSeeds = {
  login: { email: 'farmer@example.com', password: 'Test1234' },
  register: { firstName: 'Farmer', lastName: 'Test', email: 'farmer@example.com', password: 'Test1234', confirmPassword: 'Test1234', isAgreed: true },
  forgot: { email: 'farmer@example.com' },
};
const authFiles = { login: 'LoginScreen', register: 'RegisterScreen', forgot: 'ForgotPasswordScreen' };
function containsText(node, text) {
  if (Array.isArray(node)) return node.some(child => containsText(child, text));
  if (typeof node === 'string') return node === text;
  return !!node && typeof node === 'object' && containsText(node.props?.children, text);
}
function extract(file, names, values = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const component = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration;
  const declarations = [...ast.program.body, ...(component?.body?.body || [])];
  const context = vm.createContext({ URL, console: { log() {} }, ...values });
  for (const name of names) {
    const fn = declarations.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
    assert.ok(fn, `${file}: ${name} exists`);
    vm.runInContext(source.slice(fn.start, fn.end), context);
  }
  return context;
}
async function authSubmit(screen, seed, response = {}) {
  const calls = [], gate = deferred();
  const methods = { login: 'signInWithPassword', register: 'signUp', forgot: 'resetPasswordForEmail' };
  const env = harness({ seed: { ...authSeeds[screen], ...seed }, overrides: {
    supabase: { auth: { [methods[screen]]: async (...args) => { calls.push(args); return gate.promise; } } },
  } });
  env.render(`src/screens/auth/${authFiles[screen]}.js`);
  const target = submit(env, screen);
  assert.ok(target, 'Authentication submit exists');
  const press = target.props?.onPress || target.onSubmitEditing;
  const first = press(), second = press();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  gate.resolve({ data: { user: { id: 'user' }, session: { user: { id: 'user' } } }, error: null, ...response });
  await Promise.all([first, second]);
  env.render();
  return { env, calls };
}
async function main() {
  await check('all auth forms reject malformed/empty emails before any auth request', async () => {
    for (const screen of Object.keys(authFiles)) for (const email of ['', '@', 'farmer@', '@example.com', 'a@@example.com', 'a b@example.com', 'farmer@example']) {
      const { env, calls } = await authSubmit(screen, { email });
      assert.equal(calls.length, 0, `${screen} accepted a malformed email`);
      assert.ok(env.texts.some(text => /email/i.test(text)));
    }
  });
  await check('login/register/reset rapid submissions coalesce and valid emails still work', async () => {
    for (const screen of Object.keys(authFiles)) {
      const { calls } = await authSubmit(screen, { email: ' Farmer+pond@example.com ' });
      assert.equal(calls.length, 1, `${screen}: one request per rapid submission`);
    }
  });
  await check('registration missing names, password mismatch, weak password and terms prevent signup', async () => {
    for (const seed of [{ firstName: '' }, { lastName: '' }, { password: '' }, { password: 'weak' }, { confirmPassword: 'Different123' }, { isAgreed: false }]) {
      const { calls } = await authSubmit('register', seed);
      assert.equal(calls.length, 0);
    }
    assert.equal((await authSubmit('login', { password: '' })).calls.length, 0);
  });
  await check('incorrect credentials give readable feedback and release login loading state', async () => {
    const { env, calls } = await authSubmit('login', {}, { error: { message: 'Invalid login credentials' } });
    assert.equal(calls.length, 1);
    assert.ok(env.texts.some(text => /incorrect|invalid|email.*password/i.test(text)));
    assert.ok(!submit(env, 'login').props.disabled);
  });
  await check('manual ammonia rejects missing and nonnumeric inputs instead of inventing zero', () => {
    const { classifyManualAmmonia } = harness().load('src/utils/ammoniaScanner.js');
    for (const value of ['', '   ', null, undefined, false, true, [], {}, NaN, Infinity, -1, 'invalid']) {
      const result = classifyManualAmmonia(value);
      assert.equal(result.shouldSave, false, `Missing/invalid ${typeof value} was made into ammonia`);
      assert.equal(result.ammoniaLevel, null);
    }
    for (const value of [0, '0', '0.25', 5]) {
      const result = classifyManualAmmonia(value);
      assert.equal(result.shouldSave, true);
      assert.equal(result.ammoniaLevel, Number(value));
    }
  });
  await check('ammonia Save rapid taps write once and stale saved action cannot save again', async () => {
    const gate = deferred(); let writes = 0;
    const env = harness({ seed: { result: { shouldSave: true, ammoniaLevel: 0.25, status: 'SAFE' }, thresholds: { ammoniaMax: 0.25 } },
      overrides: { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
        from(table) { assert.equal(table, 'ammonia_readings'); return {
          insert() { writes++; return this; }, select() { return this; }, single() { return gate.promise; },
        }; } } } });
    env.render('src/screens/main/AmmoniaReaderScreen.js', { tank: { id: 'tank', tank_name: 'Farm' } });
    const button = env.elements.find(node => node.type === 'TouchableOpacity' && containsText(node, 'Save Result'));
    assert.ok(button, 'Save Result button');
    const first = button.props.onPress(), second = button.props.onPress();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    gate.resolve({ data: { id: 'saved-scan', tank_id: 'tank', ammonia_level: 0.25, created_at: '2026-10-17T04:00:00Z' }, error: null });
    await Promise.all([first, second]);
    assert.equal(writes, 1, 'Duplicate ammonia readings were inserted');
    await button.props.onPress();
    assert.equal(writes, 1, 'Saved result was inserted again by a stale callback');
    env.render();
    assert.ok(env.texts.includes('Result Saved'));
  });
  await check('ammonia persistence rejects invalid measurements before contacting auth/database', async () => {
    const env = harness(); const { saveAmmoniaReading } = env.load('src/utils/ammoniaReadings.js');
    for (const value of [null, undefined, '', NaN, Infinity, -1, false, [], {}]) {
      await assert.rejects(saveAmmoniaReading({ tankId: 'tank', result: { shouldSave: true, ammoniaLevel: value } }), /valid ammonia/i);
    }
    assert.equal(env.calls.length, 0);
    const saved = await saveAmmoniaReading({ tankId: 'tank', result: { shouldSave: true, ammoniaLevel: 0, status: 'SAFE' } });
    assert.equal(saved.ammonia_level, 0);
  });
  await check('ammonia failed Save releases the lock, retains the result and allows retry', async () => {
    let writes = 0;
    const env = harness({ seed: { result: { shouldSave: true, ammoniaLevel: 0.5, status: 'SAFE' }, thresholds: { ammoniaMax: 0.25 } },
      overrides: { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
        from() { return { insert() { writes++; return this; }, select() { return this; },
          single: async () => ({ data: writes === 1 ? null : { id: 'saved-scan', tank_id: 'tank', created_at: '2026-10-17T04:00:00Z' },
            error: writes === 1 ? { message: 'Network unavailable' } : null }),
        }; } } } });
    env.render('src/screens/main/AmmoniaReaderScreen.js', { tank: { id: 'tank' } });
    const button = env.elements.find(node => node.type === 'TouchableOpacity' && containsText(node, 'Save Result'));
    await button.props.onPress(); env.render();
    assert.ok(env.texts.includes('Network unavailable'));
    await env.elements.find(node => node.type === 'TouchableOpacity' && containsText(node, 'Save Result')).props.onPress();
    env.render(); assert.equal(writes, 2); assert.ok(env.texts.includes('Result Saved'));
  });
  await check('Marketplace filters/search preserve legacy products, all categories and all five tabs', () => {
    const base = { seller_id: 'seller', status: 'active', quantity: 3, price: 120, unit: 'piece' };
    const listings = [
      { ...base, id: 'adult', title: 'Adult legacy product', category: null, stage: 'adult' },
      { ...base, id: 'juvenile', title: 'Juvenile legacy product', stage: 'juvenile' },
      { ...base, id: 'feed', title: 'Feed packet', category: 'feeds', brand: 'Pelletbrand', sku: 'SKU42', location: 'Malolos' },
    ];
    for (const mode of ['light', 'dark']) for (const width of [320, 360, 412]) {
      const env = harness({ mode, width, seed: { loading: false, currentUser: { id: 'user' }, listings } });
      env.render('src/screens/main/MarketplaceScreen.js');
      assert.equal(env.elements.filter(node => node.props.accessibilityLabel?.startsWith('Show ')).length, 9);
      assert.equal(env.elements.filter(node => node.props.accessibilityRole === 'tab').length, 5);
      assert.ok(env.texts.includes('Adult legacy product'));
      env.elements.find(node => node.props.accessibilityLabel === 'Show Crayfish products').props.onPress(); env.render();
      assert.ok(!env.texts.includes('Feed packet')); assert.ok(env.texts.includes('Crayfish stage'));
      env.elements.find(node => node.type === 'TouchableOpacity' && containsText(node, 'Adult')).props.onPress(); env.render();
      assert.ok(env.texts.includes('Adult legacy product')); assert.ok(!env.texts.includes('Juvenile legacy product'));
      env.elements.find(node => node.props.accessibilityLabel === 'Show Feeds products').props.onPress(); env.render();
      assert.ok(env.texts.includes('Feed packet')); assert.ok(!env.texts.includes('Crayfish stage'));
      const search = () => env.elements.find(node => node.type === 'TextInput' && node.props.placeholder?.startsWith('Search'));
      for (const query of ['Pelletbrand', 'SKU42', 'Malolos']) { search().props.onChangeText(query); env.render(); assert.ok(env.texts.includes('Feed packet')); }
      search().props.onChangeText('No matching product'); env.render(); assert.ok(!env.texts.includes('Feed packet'));
    }
  });
  const sellerFile = 'src/screens/main/settings/SellerProfileScreen.js';
  const validSeller = { store_name: 'Farm Store', store_description: 'Supplies', seller_mobile: '09123456789',
    pickup_municipality: 'Malolos', pickup_barangay: 'Atlag', pickup_note: 'Gate', shopee_url: '', lazada_url: '', facebook_url: '', tiktok_url: '', website_url: '' };
  const { normalizeStoreUrl } = harness().load('src/lib/marketplace.js');
  await check('Seller Profile required fields and each external store URL are validated', () => {
    const context = extract(sellerFile, ['isValidOptionalUrl', 'validateSellerProfile'], { normalizeStoreUrl, form: validSeller });
    assert.equal(context.validateSellerProfile(), '');
    for (const key of ['store_name', 'seller_mobile', 'pickup_municipality', 'pickup_barangay']) {
      context.form = { ...validSeller, [key]: '' }; assert.ok(context.validateSellerProfile());
    }
    for (const key of ['shopee_url', 'lazada_url', 'facebook_url', 'tiktok_url', 'website_url']) {
      for (const value of ['https://shop.example/product', 'http://shop.example/product']) {
        context.form = { ...validSeller, [key]: value }; assert.equal(context.validateSellerProfile(), '');
      }
      for (const value of ['javascript:alert(1)', 'data:text/html,bad', 'file:///private']) {
        context.form = { ...validSeller, [key]: value }; assert.match(context.validateSellerProfile(), /valid URL/);
      }
    }
  });
  await check('Seller mobile matches the dialer limits and rejects text/oversized numbers', () => {
    const context = extract(sellerFile, ['isValidOptionalUrl', 'validateSellerProfile'], { normalizeStoreUrl });
    for (const mobile of ['abc09123456789', '091234567890123456', '123', '09123+456789']) {
      context.form = { ...validSeller, seller_mobile: mobile }; assert.match(context.validateSellerProfile(), /valid mobile/);
    }
    for (const mobile of ['09123456789', '+63 912 345 6789', '(0912) 345-6789']) {
      context.form = { ...validSeller, seller_mobile: mobile }; assert.equal(context.validateSellerProfile(), '');
    }
  });
  await check('Product Details store links reject unsafe schemes and handle platform failures', async () => {
    const opened = [], notices = [];
    const context = extract('src/screens/main/MarketplaceProductDetailsScreen.js', ['openExternalUrl'], {
      normalizeStoreUrl, Linking: { openURL: async url => { opened.push(url); if (url.includes('unavailable')) throw new Error('Platform refused URL'); } },
      showMessage: (type, message) => notices.push([type, message]),
    });
    for (const link of ['javascript:alert(1)', 'data:text/html,bad', 'file:///private']) await context.openExternalUrl(link);
    assert.equal(opened.length, 0);
    await context.openExternalUrl('https://shop.example/product'); assert.equal(opened.length, 1);
    await context.openExternalUrl('https://unavailable.example/product');
    assert.ok(notices.some(([, message]) => message.includes('Unable to open')));
  });
  await check('buyer cancellation coalesces rapid taps and preserves buyer/status constraints', async () => {
    const gate = deferred(), calls = [];
    const order = { id: 'order', buyer_id: 'buyer', listing_id: 'listing', status: 'pending' };
    const context = extract('src/screens/main/MarketplaceScreen.js', ['canCancelOrder', 'cancelReservation'], {
      currentUser: { id: 'buyer' }, actionLocks: { current: new Set() }, setUpdatingOrderId() {}, loadMarketplace: async () => {}, notify() {},
      supabase: { from(table) {
        const call = { table, filters: [] }; calls.push(call);
        const query = { update(payload) { call.payload = payload; return query; }, eq(...args) { call.filters.push(args); return query; },
          in(...args) { call.filters.push(args); return query; }, select() { return query; }, maybeSingle() { return query; },
          then(resolve, reject) { return (table === 'marketplace_orders' ? gate.promise : Promise.resolve({ error: null })).then(resolve, reject); } };
        return query;
      } },
    });
    const first = context.cancelReservation(order); await context.cancelReservation(order); assert.equal(calls.length, 1);
    gate.resolve({ data: { ...order, status: 'cancelled' }, error: null }); await first;
    assert.equal(calls.length, 2);
    assert.ok(calls[0].filters.some(([key, value]) => key === 'buyer_id' && value === 'buyer'));
    assert.equal(calls[0].payload.status, 'cancelled'); assert.equal(calls[1].payload.status, 'active');
    assert.ok(calls[1].filters.some(([key, value]) => key === 'status' && value === 'reserved'));
    await context.cancelReservation({ ...order, status: 'completed' }); assert.equal(calls.length, 2);
  });
  await check('chat rapid sends, empty/oversized/closed messages and failed retries preserve the thread flow', async () => {
    const gate = deferred(), sent = [], notices = [];
    let message = 'Message '.repeat(75);
    const context = extract('src/screens/main/MarketplaceChatScreen.js', ['handleSendMessage'], {
      messageText: message, sending: false, sendLock: { current: false }, thread: { id: 'thread' }, currentUserId: 'buyer', otherUserId: 'seller', isClosed: false,
      setSending() {}, setMessageText: value => { message = value; }, loadMessages: async () => {}, showNotice: (...args) => notices.push(args),
      getFriendlyMessageError: () => 'Please try again.', supabase: { from(table) {
        assert.equal(table, 'marketplace_chat_messages'); return { insert(payload) { sent.push(payload); return gate.promise; } };
      } },
    });
    const first = context.handleSendMessage(); await context.handleSendMessage(); assert.equal(sent.length, 1);
    gate.resolve({ error: { message: 'Network failure' } }); await first; assert.ok(message.length); assert.equal(context.sendLock.current, false);
    assert.ok(notices.length);
    await context.handleSendMessage(); assert.equal(sent.length, 2);
    assert.equal(sent[0].thread_id, 'thread'); assert.equal(sent[0].sender_id, 'buyer'); assert.equal(sent[0].receiver_id, 'seller');
    for (const text of ['', '   ', 'x'.repeat(801)]) { context.messageText = text; await context.handleSendMessage(); }
    context.messageText = 'Valid'; context.isClosed = true; await context.handleSendMessage(); assert.equal(sent.length, 2);
  });
  await check('chat marks only the authenticated recipient unread messages as read', async () => {
    const calls = [];
    const context = extract('src/screens/main/MarketplaceChatScreen.js', ['markReceivedMessagesAsRead'], {
      fetchServerTime: async () => '2026-10-17T04:00:00.000Z',
      supabase: { from(table) {
        assert.equal(table, 'marketplace_chat_messages');
        const query = { update(payload) { calls.push(['update', payload]); return query; }, eq(...args) { calls.push(args); return query; },
          then(resolve) { return Promise.resolve({ error: null }).then(resolve); } }; return query;
      } },
    });
    await context.markReceivedMessagesAsRead('thread', 'buyer');
    assert.ok(calls.some(([key, value]) => key === 'thread_id' && value === 'thread'));
    assert.ok(calls.some(([key, value]) => key === 'receiver_id' && value === 'buyer'));
    assert.ok(calls.some(([key, value]) => key === 'is_read' && value === false));
    const before = calls.length; await context.markReceivedMessagesAsRead('thread', null); assert.equal(calls.length, before);
  });
  await check('long AI answers and recommendation/threshold cards render in both themes', () => {
    const longAnswer = 'Inspect the saved water readings and your crayfish before acting. '.repeat(100);
    for (const mode of ['light', 'dark']) {
      const env = harness({ mode, width: 320, seed: { loading: false, selectedTankId: 'tank', tanks: [{ id: 'tank', tank_name: 'Farm' }],
        chatByTank: { tank: [
          { id: 'long-answer', role: 'assistant', text: longAnswer, action: 'recommendation_only' },
          { id: 'threshold', role: 'assistant', text: 'Review the temperature threshold.', action: 'suggest_threshold_change',
            thresholdSuggestion: { parameter: 'temperature', suggested_min: 22, suggested_max: 29 } },
        ] } } });
      env.render('src/screens/main/AiGuideScreen.js');
      assert.ok(env.texts.includes(longAnswer));
      assert.ok(env.texts.includes('AI suggested adjustment'));
      assert.ok(env.texts.includes('Apply Threshold'));
      assert.ok(env.elements.some(node => node.type === 'ScrollView'));
    }
  });
  console.log(`Pre-release focused QA: ${passed} passed, ${failed} failed. No live writes or hardware actions.`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
