/* global __dirname */
// Exact-question pipeline regressions with isolated auth/provider fixtures.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('node:crypto');
const { edge: rawEdge, client, httpError, compile } = require('./check-ai-guide.cjs');
const thresholdClient = require('./threshold-test-client.cjs');
const { harness } = require('./check-mobile-ui.cjs');
process.chdir(path.resolve(__dirname, '..'));
const PROMPTS = [
  'Ano ang current condition ng tank na ito?',
  'Pwede ba akong magpakain ngayon?',
  'Ano ang dapat kong gawin muna?',
  'May reading ba na kailangan bantayan?',
  'Review my current thresholds.',
  'Compare the latest and previous readings.',
  'Bakit mababa ang pH ng tank ko?',
  'Ano ang pwede kong gawin kapag mababa ang water level?',
  'Safe ba ang readings ng crayfish tank ko?',
  'Ano ang recommended action base sa latest readings?',
  'Base sa current readings ng tank ko, ano muna ang dapat kong unahin?',
  'What should I do first?',
];
const context = { system: 'CrayThrive', user_id: 'user', tank: { id: 'tank-1' },
  latest_sensor: { temperature_c: 27, ph_value: 4.8, water_depth_cm: 0.6, turbidity_voltage: 3, created_at: '2026-10-05T06:30:00Z' },
  latest_ammonia: { value: 0.1, created_at: '2026-10-05T06:15:00Z', timestamp: '2026-10-05T06:15:00Z', condition: 'Normal' },
  thresholds: { temperatureMin: 25, temperatureMax: 32, phMin: 6.5, phMax: 8, turbidityMax: 2.5, waterLevelMin: 4.5, ammoniaMax: 0.25 },
  rule_based_result: { status: 'Critical' } };
const edge = options => rawEdge({ thresholds: context.thresholds, ...options });
async function main() {
  for (const question of PROMPTS) {
    const server = edge();
    const result = await server.request({ question, context });
    assert.equal(result.status, 200, question);
    assert.equal(result.body.scope, 'allowed', question);
    const mobile = await client([{ data: result.body }]).ask({ question, context });
    assert.ok(mobile.answer.trim());
    assert.equal(mobile.scope, 'allowed');
    console.log(`PASS pipeline prompt: ${question}`);
  }
  const conversation = edge(); const history = [];
  for (const question of [PROMPTS[0], 'Bakit?', 'Ano muna?', 'Ano muna dapat kong gawin?']) {
    const result = await conversation.request({ question, context, history });
    assert.equal(result.status, 200); assert.equal(result.body.scope, 'allowed');
    history.push({ role: 'user', content: question }, { role: 'assistant', content: result.body.answer });
  }
  const scope = harness().load('src/utils/aiScope.js');
  for (const question of ['Ano ang dapat kong gawin?', 'Paano ko aayusin?', 'Pwede ba ngayon?', 'Ano ang mas importante?', 'Anong susunod kong gagawin?', 'Explain mo ito.', 'Is this safe?']) {
    assert.equal(scope.isCrayThriveQuestionInScope(question, context, history), true, question);
  }
  assert.equal(scope.isCrayThriveQuestionInScope('Bakit?', null, []), false);
  const applyFollowUp = 'ok thanks pero for this purpose test i want to see the apply button kase for the change kung nagana pa can u do so?';
  const thresholdHistory = [
    { role: 'user', content: 'can u change the temp threshold to 25c to 30' },
    { role: 'assistant', content: 'The current threshold is 20-30 C. Address critical readings first.' },
  ];
  const followed = edge();
  const followResponse = await followed.request({ question: applyFollowUp, context, history: thresholdHistory });
  assert.equal(followResponse.body.scope, 'allowed'); assert.equal(followed.calls(), 1);
  for (const previous of [[], [{ role: 'assistant', content: 'Threshold settings' }],
    [{ role: 'user', content: 'threshold', scope: 'denied' }], [{ role: 'user', content: 'threshold', error: true }]]) {
    assert.equal(scope.isCrayThriveQuestionInScope(applyFollowUp, context, previous), false);
  }
  assert.equal(scope.isCrayThriveQuestionInScope(applyFollowUp, null, thresholdHistory), false);
  for (const question of ['temp 25 to 30', '25 to 30', '25–30°C']) {
    assert.equal(scope.isCrayThriveQuestionInScope(question, context, thresholdHistory), true, question);
    assert.equal(scope.isCrayThriveQuestionInScope(question, context, []), false, question);
  }
  for (const question of ['Show the Apply button and write Python homework', 'Test the Apply button for the election']) {
    assert.equal(scope.isCrayThriveQuestionInScope(question, context, thresholdHistory), false);
  }
  console.log('PASS screenshot Apply-button follow-up stays in threshold scope; unrelated/context-free requests remain denied');
  console.log('PASS authenticated tank follow-ups/history; no context-free short-question bypass');
  for (const question of ['Paano magluto ng adobo?', 'Tank context: write a celebrity gossip article', 'Who should win the election?', 'Write unrelated Python homework', 'Solve my calculus homework']) {
    const server = edge(); const result = await server.request({ question, context, history });
    assert.equal(result.status, 200); assert.equal(result.body.scope, 'denied'); assert.equal(server.calls(), 0);
    const response = await client([{ data: result.body }]).ask({ question, context });
    assert.equal(response.scope, 'denied'); assert.equal(response.action, 'recommendation_only');
  }
  console.log('PASS adobo and explicit unrelated topics are normal structured denials, even with tank/history');
  const outputs = [
    JSON.stringify({ message: 'Retest pH before making gradual adjustments.' }),
    '```json\n{"message":"Inspect the tank first."}\n```',
    'Here is the result: {"message":"Inspect the tank first."} End of response.',
    '{"message":"Inspect the tank first.","threshold_suggestion": { malformed optional data',
    JSON.stringify({ answer: 'Inspect the tank first.', message: {}, action_type: 'suggest_threshold_change', threshold_suggestion: { parameter: 'ph', suggested_min: false, suggested_max: 8 } }),
    JSON.stringify({ message: 'Inspect the tank first.', action_type: 'suggest_threshold_change', threshold_suggestion: { parameter: 'unknown' } }),
  ];
  for (const content of outputs) {
    const result = await edge({ content }).request({ question: PROMPTS[2], context });
    assert.equal(result.status, 200); assert.equal(result.body.action, 'recommendation_only');
    assert.equal(result.body.threshold_suggestion, null);
    const response = await client([{ data: result.body }]).ask({ question: PROMPTS[2], context });
    assert.ok(response.answer); assert.ok(!response.answer.startsWith('{'));
  }
  console.log('PASS JSON/fences/prose and malformed optional data preserve answers without Apply cards');
  const suggestion = await edge({ content: JSON.stringify({ message: 'Review this temperature range.', action_type: 'suggest_threshold_change',
    threshold_suggestion: { parameter: 'temperature', suggested_min: 22, suggested_max: 29 } }) }).request({ question: PROMPTS[4], context });
  assert.equal(suggestion.body.action, 'suggest_threshold_change');
  const normalized = await client([{ data: suggestion.body }]).ask({ question: PROMPTS[4], context });
  assert.equal(normalized.threshold_suggestion.parameter, 'temperature');
  assert.equal(normalized.suggestion_saved, false);
  console.log('PASS validated threshold suggestion contract; no automatic threshold/hardware action');
  for (const proposal of [
    { parameter: 'temperature', suggested_min: 22, suggested_max: 29 },
    { parameter: 'ph', suggested_min: 6.8, suggested_max: 8.2 },
    { parameter: 'turbidity', suggested_value: 3 },
    { parameter: 'water_level', suggested_value: 5 },
    { parameter: 'ammonia', suggested_value: 0.2 },
  ]) {
    const result = await edge({ content: JSON.stringify({ message: 'Preview only, nothing saved.',
      action_type: 'suggest_threshold_change', threshold_suggestion: proposal }) }).request({ question: 'Preview my threshold change.', context });
    const mobile = await client([{ data: result.body }]).ask({ context });
    assert.equal(mobile.action, 'suggest_threshold_change'); assert.equal(mobile.threshold_suggestion.parameter, proposal.parameter);
    assert.equal(mobile.suggestion_saved, false);
  }
  for (const proposal of [
    { parameter: 'temperature', suggested_min: 9, suggested_max: 30 },
    { parameter: 'temperature', suggested_min: 30, suggested_max: 25 },
    { parameter: 'ph', suggested_min: 6, suggested_max: 15 },
    { parameter: 'ammonia', suggested_value: -1 },
    { parameter: 'water_level', suggested_value: true },
    { parameter: 'unknown', suggested_value: 2 },
    { parameter: 'temperature', suggested_min: 25, suggested_max: 32 },
  ]) {
    const result = await edge({ content: JSON.stringify({ message: 'Review the requested values.',
      action_type: 'suggest_threshold_change', threshold_suggestion: proposal }) }).request({ question: 'Preview my threshold change.', context });
    assert.equal(result.body.action, 'recommendation_only'); assert.equal(result.body.threshold_suggestion, null);
  }
  console.log('PASS all five threshold proposal contracts; invalid, unchanged and unsupported proposals never create Apply actions');
  const previewContext = { ...context, thresholds: { ...context.thresholds, temperatureMin: 20, temperatureMax: 30 } };
  const preview = await edge({ thresholds: previewContext.thresholds, content: JSON.stringify({ message: 'User-requested preview only; nothing saved.',
    action_type: 'suggest_threshold_change', threshold_suggestion: { parameter: 'temperature', suggested_min: 25, suggested_max: 30 } }) })
    .request({ question: 'Preview a temperature threshold change to 25-30 C for testing. Do not save it.', context: previewContext });
  const previewMessage = await client([{ data: preview.body }]).ask({ context: previewContext });
  assert.equal(previewMessage.threshold_suggestion.current_min, 20);
  assert.equal(previewMessage.suggestion_saved, false);
  for (const confirm of [false, true]) {
    const fixture = thresholdClient({ legacy: { user_id: 'user', thresholds: previewContext.thresholds } });
    const writes = fixture.state.writes;
    const helpers = harness({ overrides: { supabase: fixture.db } });
    const service = helpers.load('src/services/aiGuideService.js');
    let confirmations = 0;
    const app = harness({ seed: { loading: false, activeMode: 'ask', selectedTankId: 'tank-1', thresholds: previewContext.thresholds,
      tanks: [{ id: 'tank-1', tank_name: 'QA Tank' }], chatByTank: { 'tank-1': [{ id: 'preview', role: 'assistant',
        text: previewMessage.answer, action: previewMessage.action, thresholdSuggestion: previewMessage.threshold_suggestion }] } },
      overrides: { apply: service.applyAiThresholdSuggestion, alert(title, message, buttons) {
        if (!buttons) return;
        confirmations++; assert.match(message, /only QA Tank/);
        buttons.find(button => button.text === (confirm ? 'Apply' : 'Cancel')).onPress();
      } } });
    app.render('src/screens/main/AiGuideScreen.js');
    const button = app.elements.find(node => node.type === 'TouchableOpacity' &&
      JSON.stringify(node.props.children).includes('"Apply Threshold"'));
    assert.ok(button); assert.equal(writes.length, 0);
    await button.props.onPress(); app.render();
    assert.equal(confirmations, 1); assert.equal(writes.length, confirm ? 1 : 0);
    if (confirm) {
      assert.equal(writes[0].p_patch.temperature_min, 25); assert.equal(writes[0].p_patch.temperature_max, 30);
      for (const key of Object.keys(previewContext.thresholds).filter(key => !key.startsWith('temperature'))) {
        assert.equal(fixture.state.rows.get('tank-1').thresholds[key], previewContext.thresholds[key]);
      }
      assert.ok(!Object.keys(writes[0].p_patch).some(key => /^ph_|ammonia_|turbidity_|water_level_/.test(key)));
      await button.props.onPress(); assert.equal(writes.length, 1);
    }
  }
  console.log('PASS rendered 25-30 C preview, Cancel writes nothing, confirmed RPC Apply saves only the selected tank temperature once');
  const diagnostics = [];
  const limited = await edge({ status: 429, diagnostics,
    providerBody: { error: { code: 'rate_limit_exceeded', message: 'PRIVATE_PROVIDER_DETAIL' } } }).request({ question: PROMPTS[2], context });
  assert.equal(limited.status, 429); assert.equal(limited.body.code, 'AI_RATE_LIMIT');
  assert.equal(limited.body.stage, 'provider_response'); assert.match(limited.body.request_id, /^[a-f0-9-]{36}$/i);
  assert.ok(diagnostics.some(item => item.error_type === 'AI_PROVIDER_RATE_LIMIT' && item.provider_status === 429));
  for (const item of diagnostics) {
    assert.deepEqual(Object.keys(item).sort(), ['error_type', 'provider_status', 'request_id', 'stage']);
    assert.ok(!JSON.stringify(item).includes('PRIVATE_PROVIDER_DETAIL'));
  }
  console.log('PASS request IDs/stages/provider status and fixed diagnostics without provider payloads');
  for (const [status, code] of [[502, 'AI_PROVIDER_UNAVAILABLE'], [504, 'AI_TIMEOUT'], [429, 'AI_RATE_LIMIT']]) {
    for (const question of PROMPTS.filter((_, index) => index !== 4 && index !== 5)) {
      const response = await client([httpError(status, { code })]).ask({ question, context });
      assert.equal(response.source, 'rule_based'); assert.equal(response.action, 'recommendation_only');
      assert.equal(response.threshold_suggestion, null); assert.match(response.answer, /Rule-based fallback/);
      // This fixture supplies safe ranges only. Never invent Critical limits.
      assert.match(response.answer, /pH: 4\.8 \(Requires configuration\)/);
      assert.match(response.answer, /Water Depth: 0\.6 cm \(Requires configuration\)/);
      assert.ok(!/pH:.*\(Critical\)|Water Depth:.*\(Critical\)/.test(response.answer));
    }
  }
  await assert.rejects(client([httpError(502, { code: 'AI_PROVIDER_UNAVAILABLE' })]).ask({ question: PROMPTS[4], context }), /temporarily unavailable/);
  await assert.rejects(client([httpError(403, { code: 'AI_TANK_FORBIDDEN' })]).ask({ question: PROMPTS[2], context }), /unavailable to your account/);
  await assert.rejects(client([httpError(502, { code: 'AI_PROVIDER_UNAVAILABLE' })]).ask({ question: 'Paano magluto ng adobo?', context }), /temporarily unavailable/);
  const missing = await client([httpError(502, { code: 'AI_PROVIDER_UNAVAILABLE' })]).ask({ question: PROMPTS[2], context: { ...context, latest_sensor: null, latest_ammonia: null } });
  assert.match(missing.answer, /No Data/); assert.ok(!missing.answer.includes('Normal tank condition'));
  console.log('PASS safe labelled fallback uses existing rules, preserves missing data, excludes auth/threshold/unrelated requests');
  const noSession = client([], false, { noSession: true });
  await assert.rejects(noSession.ask({ question: PROMPTS[2], context }), /sign in again/);
  assert.equal(noSession.calls.length, 0);
  const renewed = client([{ data: { answer: 'Inspect your saved readings.' } }], false, { expired: true });
  await renewed.ask({ question: PROMPTS[2], context });
  assert.equal(renewed.refreshes(), 1); assert.equal(renewed.calls.length, 1);
  const failedRefresh = client([], true, { expired: true });
  await assert.rejects(failedRefresh.ask({ question: PROMPTS[2], context }), /sign in again/);
  assert.equal(failedRefresh.calls.length, 0);
  console.log('PASS release session presence, preflight expiry refresh, and failed refresh without invocation');
  for (const question of PROMPTS.slice(0, 6)) {
    const captured = [];
    for (const quick of [true, false]) {
      const app = harness({ seed: { loading: false, activeMode: 'ask', selectedTankId: 'tank-1',
        tanks: [{ id: 'tank-1', tank_name: 'QA Tank' }], inputText: question },
        overrides: { buildAiContext: async () => context, askAi: async request => {
          captured.push(request); return { answer: 'Inspect your saved readings.', scope: 'allowed', action: 'recommendation_only' };
        } } });
      app.render('src/screens/main/AiGuideScreen.js');
      const button = app.elements.find(node => node.type === 'TouchableOpacity' && node.props.onPress &&
        (quick ? node.props.children?.props?.children === question : JSON.stringify(node.props.children).includes('"arrow-up"')));
      assert.ok(button, `${quick ? 'Quick prompt' : 'Composer'} button: ${question}`);
      await button.props.onPress(); app.render();
      assert.ok(app.texts.includes('Inspect your saved readings.'));
    }
    assert.equal(captured.length, 2);
    assert.equal(captured[0].question, captured[1].question);
    assert.deepEqual(captured[0].context, captured[1].context);
    assert.deepEqual(JSON.parse(JSON.stringify(captured[0].history)), JSON.parse(JSON.stringify(captured[1].history)));
  }
  for (const code of ['AI_PROVIDER_UNAVAILABLE', 'AI_AUTH_REQUIRED']) {
    const response = code === 'AI_PROVIDER_UNAVAILABLE'
      ? await client([httpError(502, { code })]).ask({ question: PROMPTS[2], context }) : null;
    const app = harness({ seed: { loading: false, activeMode: 'ask', selectedTankId: 'tank-1',
      tanks: [{ id: 'tank-1', tank_name: 'QA Tank' }], inputText: PROMPTS[2] },
      overrides: { buildAiContext: async () => context, askAi: async () => {
        if (response) return response;
        throw Object.assign(new Error('PRIVATE RAW ERROR'), { code });
      }, aiFailureMessage: () => 'Your AI session could not be verified. Please sign in again.' } });
    app.render('src/screens/main/AiGuideScreen.js');
    await app.elements.find(node => node.type === 'TouchableOpacity' && node.props.onPress &&
      JSON.stringify(node.props.children).includes('"arrow-up"')).props.onPress();
    app.render();
    assert.ok(!app.texts.includes('PRIVATE RAW ERROR'));
    if (response) {
      assert.ok(app.texts.includes('CrayThrive Rules'));
      assert.ok(app.texts.some(text => text.includes('Rule-based fallback')));
      assert.ok(!app.texts.includes('Apply Threshold'));
    } else assert.ok(app.texts.includes('Your AI session could not be verified. Please sign in again.'));
  }
  console.log('PASS rendered Quick Prompt/manual equivalence for all six buttons; fallback label and friendly errors');
  for (const mode of ['light', 'dark']) {
    const captured = [];
    const app = harness({ mode, width: 320, seed: { loading: false, activeMode: 'ask', selectedTankId: 'tank-1',
      tanks: [{ id: 'tank-1', tank_name: 'QA Tank' }] }, overrides: { buildAiContext: async () => context,
      askAi: async request => { captured.push(request); return { answer: 'Which parameter and values would you like to preview?', action: 'recommendation_only' }; } } });
    app.render('src/screens/main/AiGuideScreen.js');
    const button = app.elements.find(node => node.props.accessibilityLabel === 'Preview threshold change');
    assert.ok(button); await button.props.onPress(); app.render();
    assert.equal(captured.length, 1); assert.match(captured[0].question, /Ask me which parameter and values/);
    assert.match(captured[0].question, /Do not save anything without my confirmation/);
    assert.equal(app.calls.filter(([table]) => table === 'threshold_settings').length, 0);
    assert.ok(app.texts.includes('Which parameter and values would you like to preview?'));
    assert.ok(!app.texts.includes('Apply Threshold'), 'clarification does not invent an Apply proposal');
  }
  const busy = harness({ seed: { loading: false, sendingAi: true, tanks: [{ id: 'tank-1' }], selectedTankId: 'tank-1' } });
  busy.render('src/screens/main/AiGuideScreen.js');
  assert.equal(busy.elements.find(node => node.props.accessibilityLabel === 'Preview threshold change').props.disabled, true);
  console.log('PASS discoverable threshold preview quick question in both themes; no preset values/write, disabled while sending');
  const legacyPath = path.join(require('os').tmpdir(), 'craythrive-ai-deployed-before-20261005/supabase/functions/craythrive-ai-guide/index.ts');
  if (fs.existsSync(legacyPath)) {
    let handler;
    vm.runInNewContext(compile(legacyPath, true), { exports: {}, Response, AbortController, TextDecoder, URL, crypto: webcrypto,
      console: { log() {}, error() {} }, setTimeout: () => 1, clearTimeout() {},
      Deno: { serve: fn => { handler = fn; }, env: { get: () => 'test-only' } },
      require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) }),
      fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: outputs[3] } }] })),
    });
    const response = await handler(new Request('https://test.invalid/ai', { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: JSON.stringify({ question: PROMPTS[2], context }) }));
    const body = await response.json();
    assert.equal(response.status, 200); assert.ok(/^\s*(?:\{|\[\s*[{\"]|```)/.test(body.answer), 'Legacy APK answer guard rejects this actual deployed output shape');
    const fixed = await client([{ data: body }]).ask({ question: PROMPTS[2], context });
    assert.equal(fixed.answer, 'Inspect the tank first.'); assert.equal(fixed.action, 'recommendation_only');
    console.log('PASS reproduced deployed-v3 malformed-optional output rejected by legacy APK guard; fixed client recovers text');
  }
  console.log('AI conversation matrix passed. Provider/auth fixtures only; live tests are reported separately.');
}
module.exports = { PROMPTS, context };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
