/* global __dirname */
// Offline fixtures: no hardware command, real alert, push, or APK build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { harness } = require('./check-mobile-ui.cjs');
const root = path.resolve(__dirname, '..');
// EAS excludes /supabase, and Edge deployment packages its own functions tree.
// Keep these two deployment-safe copies identical; never import server paths
// into mobile or bundle server configuration into an APK.
assert.equal(fs.readFileSync(path.join(root, 'src/utils/pumpActionWording.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'supabase/functions/_shared/pumpActionWording.js'), 'utf8'));
const env = harness();
const { formatPumpAction, formatPumpAlert } = env.load('src/utils/pumpActionWording.js');
const fixtures = [];
function check(name, row, title, message) {
  const before = JSON.stringify(row);
  const result = formatPumpAlert(row);
  assert.equal(result.title, title, name);
  assert.equal(result.message, message, name);
  assert.equal(JSON.stringify(row), before, 'Raw status and duration metadata are preserved');
  fixtures.push({ name, record: row, expected: { title, message } });
}
for (const source of ['manual', 'automatic', 'rule_based']) {
  check(`${source} drain`, { command_type: 'DRAIN_FOR', command_status: 'done', duration_ms: 10000,
    metadata: { source, requested_seconds: 10, actual_duration_ms: 200, pulse_ms: 200 } },
  'Drain completed', 'The drain pump was activated.');
  for (const seconds of [1, 2, 0.2, 1.25]) check(`${source} refill ${seconds}`, {
    action_type: 'refill', action_status: 'completed', metadata: { source, actual_duration_ms: seconds * 1000, requested_seconds: 10 },
  }, 'Add Water completed', `The refill pump ran for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`);
}
check('Rejected wins over stale success text', { title: 'Drain completed', message: 'The drain pump ran for 10 seconds.', metadata: { action_type: 'drain', action_status: 'rejected' } },
  'Drain rejected', 'The drain action was blocked by a safety rule.');
check('Failed drain', { command_type: 'DRAIN_FOR', command_status: 'failed', duration_ms: 10000 },
  'Drain failed', 'The drain action could not be completed.');
check('Historical drain without structured metadata', { title: 'Drain completed', message: 'The drain pump ran for 10 seconds.', status: 'active' },
  'Drain completed', 'The drain pump was activated.');
check('Generic successful control activity', { action_type: 'drain', action_status: 'completed', notes: 'Completed successfully.', metadata: { duration_seconds: 10 } },
  'Drain completed', 'The drain pump was activated.');
for (const metadata of [{}, { duration_ms: 1000, duration_seconds: 1, run_seconds: 1, pulse_ms: 1000 },
  { actual_duration_ms: null }, { actual_duration_ms: '' }, { actual_duration_ms: false },
  { actual_duration_ms: -1 }, { actual_duration_ms: 'NaN' }]) {
  check('Refill with no proven runtime', { command_type: 'REFILL_FOR', command_status: 'done', duration_ms: 1000, metadata },
    'Add Water completed', 'The refill pump was activated.');
}
check('Actual seconds', { command_type: 'REFILL_FOR', command_status: 'done', actual_duration_seconds: '2' },
  'Add Water completed', 'The refill pump ran for 2 seconds.');
check('Unknown drain status is not success', { action_type: 'drain', notes: 'Completed successfully.' },
  'Drain recorded', 'The drain action is recorded.');
check('Failed refill', { command_type: 'REFILL_FOR', command_status: 'failed' },
  'Add Water failed', 'The refill action could not be completed.');
assert.equal(formatPumpAction({ action_type: 'feed', action_status: 'done' }), null);
assert.equal(formatPumpAlert({ title: 'Low water', message: 'Refill the tank carefully.' }).message, 'Refill the tank carefully.');

// Exercise the real Edge delivery formatter without network or notifications.
const edgeFile = path.join(root, 'supabase/functions/send-craythrive-push/index.ts');
const edgeSource = fs.readFileSync(edgeFile, 'utf8');
const transformed = babel.transformSync(`${edgeSource}\nexport { deliveriesFor };`, {
  filename: edgeFile, configFile: false, babelrc: false,
  plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
}).code;
const exported = {};
vm.runInNewContext(transformed, { exports: exported,
  require: name => name.includes('pumpActionWording') ? { formatPumpAction, formatPumpAlert } : { createClient() {} },
  Deno: { serve() {} },
});
for (const fixture of fixtures) {
  const delivery = exported.deliveriesFor('alerts', 'INSERT', { id: 'fixture', user_id: 'owner', ...fixture.record }, {})[0];
  assert.equal(delivery.title, fixture.expected.title);
  assert.equal(delivery.body, fixture.expected.message);
  assert.equal(delivery.preference, 'pump_alerts');
}

// Historical notification rows render the corrected wording in both themes.
for (const mode of ['light', 'dark']) {
  const view = harness({ mode, seed: { modalVisible: true, loading: false, alerts: [{
    id: 'old-drain', title: 'Drain completed', message: 'The drain pump ran for 10 seconds.', severity: 'normal', is_read: false,
  }] } });
  view.render('src/components/ui/NotificationBell.js');
  const texts = view.texts;
  assert.ok(texts.includes('The drain pump was activated.'));
  assert.ok(!texts.join(' ').includes('10 seconds'));
  const report = harness({ mode, seed: { loading: false, selectedTankId: 'fixture-tank', tanks: [{
    id: 'fixture-tank', tank_name: 'Fixture', alerts: [{ id: 'old-drain', title: 'Drain completed',
      message: 'The drain pump ran for 10 seconds.' }], control_logs: [
      { id: 'drain', tank_id: 'fixture-tank', action_type: 'drain', action_status: 'completed', notes: 'Completed successfully.' },
      { id: 'refill', tank_id: 'fixture-tank', action_type: 'refill', action_status: 'completed', metadata: { actual_duration_ms: 1000 } },
      { id: 'blocked', tank_id: 'fixture-tank', action_type: 'drain', action_status: 'rejected', notes: 'The drain pump ran for 10 seconds.' },
    ],
  }] } });
  report.render('src/screens/main/ReportsScreen.js');
  assert.ok(report.texts.includes('The drain pump was activated.'));
  assert.ok(report.texts.some(text => text.includes('The refill pump ran for 1 second.')));
  assert.ok(report.texts.includes('Skipped'));
  assert.ok(report.texts.includes('Unknown / Unconfirmed'));
  assert.ok(!report.texts.join(' ').includes('10 seconds'));
}
if (process.argv.includes('--fixtures')) process.stdout.write(JSON.stringify(fixtures));
else console.log(`PASS: ${fixtures.length} pump wording cases, metadata immutability, real Edge delivery formatting and mobile feed in both themes. No live commands sent.`);
