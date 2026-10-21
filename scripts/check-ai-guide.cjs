/* global __dirname */
// Offline checks only: mocked auth/provider, no database writes or APK builds.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");
const babel = require("@babel/core");
const parser = require("@babel/parser");
const { ESLint } = require("eslint");
const { harness } = require('./check-mobile-ui.cjs');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, "..");
process.chdir(root);
const serviceFile = "src/services/aiGuideService.js";
const screenFile = "src/screens/main/AiGuideScreen.js";
const edgeFile = "supabase/functions/craythrive-ai-guide/index.ts";
const context = { tank: { id: "tank-1" }, thresholds: {} };
const quiet = { log() {}, error() {}, info() {} };
function compile(file, typescript = false) {
  return babel.transformSync(fs.readFileSync(file, "utf8"), {
    filename: file, configFile: false, babelrc: false,
    plugins: [...(typescript ? ["@babel/plugin-transform-typescript"] : ["@babel/plugin-transform-react-jsx"]), "@babel/plugin-transform-modules-commonjs"],
  }).code;
}
function client(results, refreshError = false, authOptions = {}) {
  const calls = [];
  let refreshes = 0;
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: authOptions.noSession ? null : { access_token: 'test-session-only', expires_at: authOptions.expired ? 1 : Math.floor(Date.now() / 1000) + 3600 } } }),
      getUser: async () => ({ data: { user: authOptions.noUser ? null : { id: "user" } } }),
      refreshSession: async () => { refreshes++; return { data: { session: refreshError ? null : { access_token: 'refreshed-test-session-only' } }, error: refreshError }; },
    },
    functions: { invoke: async (name, options) => { calls.push({ name, options }); return results.shift(); } },
  };
  const exports = {};
  vm.runInNewContext(compile(serviceFile), {
    exports, console: quiet,
    require: name => name.includes("supabase") ? { supabase } : /aiFallback|aiResponseParsing/.test(name)
      ? harness().load(`src/utils/${path.basename(name)}.js`) : { DEFAULT_THRESHOLDS: {}, normalizeThresholds: value => value },
  });
  return { ask: overrides => exports.askCrayThriveAi({ question: "Should I feed my crayfish?", context, ...overrides }), calls, refreshes: () => refreshes };
}
const httpError = (status, body) => ({ error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: new Response(typeof body === "string" ? body : JSON.stringify(body), { status }) } });
function edge(options = {}) {
  let handler;
  let calls = 0;
  let sent;
  const timers = [];
  const exports = {};
  vm.runInNewContext(compile(edgeFile, true), {
    exports, Response, AbortController, TextDecoder, URL, crypto: webcrypto,
    console: { ...quiet, info(value) { options.diagnostics?.push(JSON.parse(value)); } },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    Deno: { serve: fn => { handler = fn; }, env: { get: name => options.unconfigured && name.startsWith("AI_") ? undefined : name === 'AI_API_URL' ? (options.providerUrl || 'https://provider.invalid/chat') : "test-placeholder" } },
    require: name => /aiScope|aiResponseParsing|thresholdResolution|classificationPolicy/.test(name) ? harness().load(`src/utils/${path.basename(name)}`) : ({ createClient: () => ({
      auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: "user" } } }) },
      from(table) {
        assert.ok(['tanks', 'tank_threshold_settings', 'threshold_settings'].includes(table));
        const filters = {};
        return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
          async maybeSingle() {
            assert.equal(filters.user_id, 'user');
            if (table !== 'tanks') {
              if (table === 'tank_threshold_settings') assert.ok(filters.tank_id);
              return { data: table === 'tank_threshold_settings' ? (Object.hasOwn(options, 'tankThresholdRow') ? options.tankThresholdRow : {
                user_id: 'user', tank_id: filters.tank_id, thresholds: options.thresholds || {},
              }) : options.legacyThresholdRow || null, error: options.thresholdError || null };
            }
            return { data: options.noTank ? null : { id: filters.id, user_id: options.foreignTank ? 'other-user' : 'user', tank_name: 'Owned Tank' },
              error: options.tankError ? { code: '42501' } : null };
          } };
      },
    }) }),
    fetch: async (url, init) => {
      calls++;
      sent = JSON.parse(init.body);
      assert.equal(init.redirect, 'error');
      assert.equal(init.signal.aborted, false);
      if (options.timeout) { timers.at(-1)(); throw new Error("AbortError"); }
      if (options.network) throw new Error("network");
      if (options.stalledBody) return { ok: true, text: async () => { timers.at(-1)(); throw new Error("AbortError"); } };
      return new Response(options.html ? "<html>provider failure</html>" : JSON.stringify(options.providerBody || { choices: [{ message: { content: options.content === undefined ? JSON.stringify({ message: "Review the latest saved readings before feeding.", action_type: "recommendation_only" }) : options.content } }] }), { status: options.status || 200 });
    },
  });
  return {
    request: async (body = { question: "Should I feed my crayfish?", context }, auth = true) => {
      const response = await handler(new Request("https://local.invalid/ai", {
        method: "POST", headers: auth ? { Authorization: "Bearer test" } : {}, body: typeof body === "string" ? body : JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    },
    calls: () => calls, sent: () => sent,
  };
}
async function main() {
  const expoPreset = require.resolve("babel-preset-expo", { paths: [path.dirname(require.resolve("expo/package.json"))] });
  for (const file of [screenFile, serviceFile, edgeFile]) {
    const source = fs.readFileSync(file, "utf8");
    const ast = parser.parse(source, { sourceType: "module", plugins: file.endsWith(".ts") ? ["typescript"] : ["jsx"] });
    for (const node of ast.program.body.filter(n => n.type === "ImportDeclaration")) {
      const name = node.source.value;
      if (/^(https:|jsr:)/.test(name)) continue; // Supabase Deno runtime imports.
      if (name.startsWith(".")) {
        const target = path.resolve(path.dirname(file), name);
        assert.ok([target, target + ".js", target + ".ts", path.join(target, "index.js")].some(p => fs.existsSync(p)), name);
      } else require.resolve(name);
    }
    if (file !== edgeFile) babel.transformSync(source, { filename: path.resolve(file), configFile: false, babelrc: false, presets: [[expoPreset, { platform: "android" }]], caller: { name: "metro", platform: "android", supportsStaticESM: true } });
  }
  console.log("PASS AI syntax, mobile imports and Expo Android transformations; edge TypeScript transformation");
  const good = { data: { answer: "Review your tank readings.", action: "recommendation_only" } };
  const success = client([good]);
  assert.equal((await success.ask({ history: [{ role: "assistant", text: "error code", error: true }, { role: "user", text: "Previous tank question" }] })).answer, good.data.answer);
  assert.equal(success.calls[0].options.timeout, 60000);
  assert.equal(success.calls[0].options.body.history.length, 1);
  console.log("PASS valid answers, bounded request timeout and failed-answer history exclusion");
  for (const [result, expected] of [
    [httpError(429, { error: "secret provider detail", code: "AI_RATE_LIMIT" }), /wait a minute/],
    [httpError(502, { error: "rate limit reached" }), /wait a minute/],
    [httpError(503, { code: "AI_NOT_CONFIGURED" }), /administrator/],
    [httpError(504, { code: "AI_TIMEOUT" }), /too long/],
    [httpError(502, "<html>bad gateway</html>"), /temporarily unavailable/],
    [{ error: { name: "FunctionsFetchError", context: new Error("offline") } }, /internet connection/],
    [{ error: { name: "FunctionsFetchError", context: { name: "AbortError" } } }, /too long/],
    [{ data: null }, /incomplete answer/],
    [{ data: { answer: { raw: "bad" } } }, /incomplete answer/],
    [{ data: { answer: '{"message":"unfinished' } }, /incomplete answer/],
    [{ data: { error: "raw provider code", code: "AI_RATE_LIMIT" } }, /wait a minute/],
  ]) {
    const test = client([result]);
    await assert.rejects(test.ask(), expected);
    assert.equal(test.calls.length, 1, "Provider failures must not automatically repeat billable requests");
  }
  console.log("PASS readable rate-limit, timeout, network, HTML and malformed-response errors without raw provider details");
  const renewed = client([httpError(401, {}), good]);
  assert.equal((await renewed.ask()).answer, good.data.answer);
  assert.equal(renewed.refreshes(), 1);
  assert.equal(renewed.calls.length, 2);
  const expired = client([httpError(401, {})], true);
  await assert.rejects(expired.ask(), /sign in again/);
  assert.equal(expired.calls.length, 1);
  const repeated = client([httpError(401, {}), httpError(401, {})]);
  await assert.rejects(repeated.ask(), /sign in again/);
  assert.equal(repeated.calls.length, 2);
  const invalid = client([]);
  await assert.rejects(invalid.ask({ context: {} }), /Select a tank/);
  await assert.rejects(invalid.ask({ question: "x".repeat(2001) }), /2,000/);
  assert.equal(invalid.calls.length, 0);
  console.log("PASS one-time expired-session renewal, failed-session stop and pre-request validation");
  const screenSource = fs.readFileSync(screenFile, "utf8");
  const screenAst = parser.parse(screenSource, { sourceType: "module", plugins: ["jsx"] });
  const screenRoot = screenAst.program.body.find(n => n.type === "ExportDefaultDeclaration").declaration;
  const send = screenRoot.body.body.find(n => n.type === "FunctionDeclaration" && n.id.name === "handleSendAi");
  let releaseContext;
  let contextCalls = 0;
  const state = { chat: {}, sending: false };
  const sendSandbox = vm.createContext({
    getServerNow: () => new Date('2026-10-11T13:02:55Z'),
    console: quiet, selectedTank: { id: "tank-1" }, inputText: "Should I feed my crayfish?",
    sendingAi: false, sendLock: { current: false }, chatByTank: {}, thresholds: {}, ruleResult: {},
    getTankId: tank => tank.id, setInputText() {}, showNotice() {}, scrollChatToBottom() {},
    getAiFailureMessage: error => error.message,
    setSendingAi: value => { state.sending = value; },
    setChatByTank: updater => { state.chat = updater(state.chat); },
    buildAiTankContext: () => { contextCalls++; return new Promise(resolve => { releaseContext = resolve; }); },
    askCrayThriveAi: async () => { throw new Error("Could not connect to the AI."); },
  });
  vm.runInContext(screenSource.slice(send.start, send.end), sendSandbox);
  const firstSend = sendSandbox.handleSendAi();
  await sendSandbox.handleSendAi();
  assert.equal(contextCalls, 1);
  assert.equal(state.sending, true);
  releaseContext(context);
  await firstSend;
  assert.equal(sendSandbox.sendLock.current, false);
  assert.equal(state.sending, false);
  const failure = state.chat["tank-1"].at(-1);
  assert.equal(failure.error, true);
  assert.equal(failure.retryQuestion, "Should I feed my crayfish?");
  sendSandbox.buildAiTankContext = async () => context;
  sendSandbox.askCrayThriveAi = async () => good.data;
  await sendSandbox.handleSendAi(failure.retryQuestion);
  assert.equal(state.chat["tank-1"].at(-1).text, good.data.answer);
  const bubble = screenAst.program.body.find(n => n.id?.name === "ChatBubble");
  const bubbleCode = babel.transformSync(screenSource.slice(bubble.start, bubble.end), {
    configFile: false, babelrc: false, plugins: ["@babel/plugin-transform-react-jsx"],
  }).code;
  const ui = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    View: "View", Text: "Text", TouchableOpacity: "TouchableOpacity", Ionicons: "Ionicons", ACTION_LABELS: {},
    formatMessageTime: () => "10:00",
  });
  vm.runInContext(bubbleCode, ui);
  const buttons = [];
  const visit = node => {
    if (!node || typeof node !== "object") return;
    if (node.type === "TouchableOpacity") buttons.push(node);
    (node.children || []).flat().forEach(visit);
  };
  let retryCalls = 0;
  const props = { item: failure, colors: {}, styles: {}, onRetry: () => { retryCalls++; } };
  visit(ui.ChatBubble({ ...props, retrying: false }));
  assert.equal(buttons.length, 1);
  buttons[0].props.onPress();
  assert.equal(retryCalls, 1);
  assert.equal(buttons[0].props.disabled, false);
  buttons.length = 0;
  visit(ui.ChatBubble({ ...props, retrying: true }));
  assert.equal(buttons[0].props.disabled, true);
  console.log("PASS AI screen duplicate-send prevention, lock release, retained failed question and retry button behavior");
  const validEdge = edge();
  assert.equal((await validEdge.request()).status, 200);
  assert.equal(validEdge.sent().messages.at(-1).content, "Should I feed my crayfish?");
  for (const [options, status, code] of [
    [{ status: 429, html: true }, 429, "AI_RATE_LIMIT"],
    [{ status: 500, html: true }, 502, "AI_PROVIDER_UNAVAILABLE"],
    [{ html: true }, 502, "AI_INVALID_RESPONSE"],
    [{ timeout: true }, 504, "AI_TIMEOUT"],
    [{ stalledBody: true }, 504, "AI_TIMEOUT"],
    [{ network: true }, 502, "AI_PROVIDER_UNAVAILABLE"],
    [{ content: "" }, 502, "AI_INVALID_RESPONSE"],
    [{ content: '{"message":"broken' }, 502, "AI_INVALID_RESPONSE"],
    [{ content: '{"action_type":"suggest_fill"}' }, 502, "AI_INVALID_RESPONSE"],
    [{ unconfigured: true }, 503, "AI_NOT_CONFIGURED"],
  ]) {
    const result = await edge(options).request();
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
  }
  assert.equal((await edge().request("bad-json")).status, 400);
  assert.equal((await edge().request(undefined, false)).status, 401);
  for (const options of [{ noTank: true }, { foreignTank: true }]) {
    const test = edge(options);
    assert.equal((await test.request()).status, 403);
    assert.equal(test.calls(), 0, 'Unauthorized tank must never reach the provider');
  }
  assert.equal((await edge({ tankError: true }).request()).status, 503);
  const insecureProvider = edge({ providerUrl: 'http://provider.invalid/chat' });
  assert.equal((await insecureProvider.request()).status, 503);
  assert.equal(insecureProvider.calls(), 0);
  const oversized = edge();
  assert.equal((await oversized.request({ question: 'Should I feed my crayfish?', context, padding: 'x'.repeat(131073) })).status, 413);
  assert.equal(oversized.calls(), 0);
  const bounded = edge();
  assert.equal((await bounded.request({ question: 'Should I feed my crayfish?', context: { ...context, access_token: 'not-for-provider',
    latest_reading: { temperature: 26, password: 'not-for-provider' }, secret_profile: { email: 'private@example.invalid' } } })).status, 200);
  assert.ok(!JSON.stringify(bounded.sent()).includes('not-for-provider'));
  assert.ok(!JSON.stringify(bounded.sent()).includes('private@example.invalid'));
  const limited = edge();
  for (let i = 0; i < 20; i++) assert.equal((await limited.request()).status, 200);
  assert.equal((await limited.request()).status, 429);
  assert.equal(limited.calls(), 20);
  console.log('PASS AI tank ownership, bounded request/context, HTTPS provider, redirect rejection and per-worker rate limit');
  const denied = edge();
  const denial = await denied.request({ question: "Write a song about space travel", context });
  assert.equal(denial.body.scope, "denied");
  assert.equal(denied.calls(), 0);
  const plain = await edge({ content: "Check saved water-quality readings before feeding your crayfish." }).request();
  assert.equal(plain.status, 200);
  assert.equal(plain.body.action, "recommendation_only");
  console.log("PASS edge errors, stalled response bodies, malformed output, normal answers and preserved domain restrictions");
  const lint = await new ESLint().lintFiles([screenFile, serviceFile, edgeFile, "scripts/check-ai-guide.cjs"]);
  const errors = lint.reduce((n, r) => n + r.errorCount, 0);
  const warnings = lint.reduce((n, r) => n + r.warningCount, 0);
  if (errors || warnings) console.log(await (await new ESLint().loadFormatter("stylish")).format(lint));
  assert.equal(errors, 0);
  assert.equal(warnings, 0);
  console.log("PASS ESLint: 0 errors, 0 warnings (Deno remote imports checked by its runtime)");
  console.log("AI checks passed. No live provider requests or APK build.");
}
module.exports = { edge, client, httpError, compile };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
