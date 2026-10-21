// Offline reproduction of a full tank/history request rejected by the provider.
const assert = require('node:assert/strict');
const { edge, client, httpError } = require('./check-ai-guide.cjs');
const { context } = require('./check-ai-conversations.cjs');
async function main() {
  const sensor = { ...context.latest_sensor, evaluated_statuses: Object.fromEntries(['temperature', 'ph', 'water', 'turbidity']
    .map(key => [key, { reason: 'Repeated diagnostic text. '.repeat(35), status: 'Critical' }])), raw_statuses: { ph: 'UNSAFE' } };
  const largeContext = { ...context, latest_sensor: sensor, latest_reading: sensor,
    recent_sensor_readings: Array.from({ length: 10 }, (_, i) => ({ ...sensor, created_at: new Date(Date.parse(sensor.created_at) - i * 60000).toISOString() })),
    recent_ammonia_readings: Array.from({ length: 6 }, () => context.latest_ammonia),
    recent_alerts: Array.from({ length: 8 }, () => ({ title: 'Water warning', message: 'Repeated alert detail. '.repeat(40) })),
    recent_control_logs: Array.from({ length: 8 }, () => ({ action: 'inspection', message: 'Repeated control detail. '.repeat(40) })) };
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: i % 2
    ? 'AI is temporarily unavailable. Rule-based fallback from CrayThrive rules. '.repeat(24) : 'Review my tank readings. '.repeat(64) }));
  const server = edge();
  assert.equal((await server.request({ question: 'Compare the latest and previous readings.', context: largeContext, history })).status, 200);
  const payload = server.sent();
  const contextText = payload.messages[1].content;
  const compact = JSON.parse(contextText.slice(contextText.indexOf('{'), contextText.lastIndexOf('}') + 1));
  assert.ok(JSON.stringify(compact).length <= 5000);
  assert.ok(payload.messages.reduce((length, message) => length + message.content.length, 0) < 16000);
  assert.equal(compact.latest_sensor.ph_value, 4.8);
  assert.equal(compact.latest_sensor.created_at, sensor.created_at);
  assert.equal(compact.latest_ammonia.timestamp, context.latest_ammonia.timestamp);
  assert.equal(compact.latest_ammonia.value, 0.1);
  assert.equal(compact.thresholds.ammoniaMax, 0.25);
  assert.ok(compact.recent_sensor_readings.length >= 2);
  assert.ok(compact.recent_ammonia_readings.length >= 2);
  assert.ok(compact.history_coverage.truncated);
  assert.ok(!Object.hasOwn(compact, 'latest_reading'), 'no duplicate current sensor snapshot in the provider payload');
  assert.doesNotMatch(JSON.stringify(compact), /Repeated|evaluated_statuses|raw_statuses/);
  assert.ok(!payload.messages.slice(2, -1).some(message => /rule-based fallback/i.test(message.content)));
  assert.ok(payload.messages.slice(2, -1).reduce((length, message) => length + message.content.length, 0) <= 1600);
  assert.ok(payload.messages[0].content.length < 4700, 'static instructions stay compact without removing the output/safety contract');
  assert.equal(payload.max_tokens, 800, 'output budget remains sufficient for valid structured proposals');
  const followHistory = [
    { role: 'user', content: 'Preview a temperature threshold change to 25-30 C.' },
    { role: 'assistant', content: 'Explain tank thresholds. '.repeat(40) },
    { role: 'user', content: 'Compare my latest and previous readings. '.repeat(20) },
    { role: 'assistant', content: 'Inspect saved readings. '.repeat(40) },
  ];
  const follow = edge();
  assert.equal((await follow.request({ question: 'Show the Apply button for testing.', context, history: followHistory })).status, 200);
  const turns = follow.sent().messages.slice(2, -1);
  assert.equal(turns.length, 4); assert.equal(turns[0].content, followHistory[0].content);
  assert.ok(turns.reduce((n, turn) => n + turn.content.length, 0) <= 1600);
  const repeatedUser = edge();
  await repeatedUser.request({ question: 'Review tank readings.', context,
    history: Array.from({ length: 8 }, () => ({ role: 'user', content: 'Threshold question. '.repeat(40) })) });
  assert.ok(repeatedUser.sent().messages.slice(2, -1).reduce((n, turn) => n + turn.content.length, 0) <= 1600);
  const counted = await edge({ providerBody: { usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100, secret: 'DO_NOT_EXPOSE' },
    choices: [{ message: { content: '{"message":"Inspect the saved tank readings."}' } }] } }).request();
  assert.deepEqual(counted.body.usage, { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 });
  assert.ok(!JSON.stringify(counted.body).includes('DO_NOT_EXPOSE'));
  const malformedUsage = await edge({ providerBody: { usage: { prompt_tokens: 'private', completion_tokens: -1, total_tokens: 0 },
    choices: [{ message: { content: '{"message":"Inspect the saved tank readings."}' } }] } }).request();
  assert.equal(malformedUsage.status, 200); assert.equal(malformedUsage.body.usage, undefined);
  console.log('PASS shorter instructions, follow-up retention, 800-token output cap and numeric-only provider usage');
  console.log('PASS full tank/history request compacted with current readings, timestamps, thresholds and separate historical samples preserved');
  const mobile = client([{ data: { answer: 'Review your saved readings.' } }]);
  await mobile.ask({ history: [{ role: 'assistant', text: 'OLD FALLBACK', source: 'rule_based' },
    { role: 'assistant', text: 'OLD ERROR', error: true }, { role: 'user', text: 'Bakit mababa ang pH?' }] });
  assert.equal(mobile.calls[0].options.body.history.length, 1);
  assert.equal(mobile.calls[0].options.body.history[0].content, 'Bakit mababa ang pH?');
  const tooLarge = edge({ status: 413, providerBody: { error: { code: 'rate_limit_exceeded' } } });
  const failure = await tooLarge.request();
  assert.equal(failure.status, 413);
  assert.equal(failure.body.code, 'AI_CONTEXT_TOO_LARGE');
  assert.equal(tooLarge.calls(), 1, 'no automatic repeat of oversized billable requests');
  await assert.rejects(client([httpError(413, failure.body)]).ask(), /context is too large/);
  const malformed = edge();
  assert.equal((await malformed.request({ question: 'Is my tank safe?', context: { ...context,
    recent_sensor_readings: {}, recent_ammonia_readings: 'invalid', recent_alerts: {} } })).status, 200);
  console.log('PASS fallback/error history excluded, HTTP 413 classified distinctly, no blind retry, malformed history types handled');
  console.log('AI request budget checks passed. No live writes or APK build.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
