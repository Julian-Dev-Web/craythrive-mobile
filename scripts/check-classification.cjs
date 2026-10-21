/* global __dirname */
// Synthetic limits/ages are TEST FIXTURES, never defaults or biological advice.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./check-mobile-ui.cjs');
process.chdir(path.resolve(__dirname, '..'));
const app = harness(), rules = app.load('src/utils/thresholdSettings.js');
const policy = app.load('src/utils/classificationPolicy.js');
const fixtures = { ...rules.DEFAULT_THRESHOLDS, waterLevelMin: 2, waterLevelMax: 4,
  temperatureCriticalMin: 18, temperatureCriticalMax: 32, phCriticalMin: 6, phCriticalMax: 9,
  waterCriticalMin: 1, waterCriticalMax: 5, turbidityCriticalMinV: 1.5, ammoniaCriticalMax: 0.5,
  ...Object.fromEntries(['temperature','ph','water','turbidity','ammonia'].map(key => [`${key}MaxAgeSeconds`, 120])) };
const now = '2026-10-11T13:02:55Z';
const reading = { temperature_c: 27, ph_value: 7, water_depth_cm: 3, turbidity_voltage: 3, ammonia: 0.1,
  created_at: now, ammonia_created_at: now, has_ammonia_scan: true };
const evaluate = (row = reading, thresholds = fixtures, options = {}) => rules.evaluateMonitoring(row, thresholds, { serverTime: now, ...options });
for (const [key, field, cases] of [
  ['temperature','temperature_c',[[20,'normal'],[30,'normal'],[19.999,'warning'],[30.001,'warning'],[18,'critical'],[32,'critical']]],
  ['ph','ph_value',[[6.5,'normal'],[8.5,'normal'],[6.49,'warning'],[8.51,'warning'],[6,'critical'],[9,'critical']]],
  ['water','water_depth_cm',[[2,'normal'],[4,'normal'],[1.99,'warning'],[4.01,'warning'],[1,'critical'],[5,'critical']]],
  ['turbidity','turbidity_voltage',[[2.5,'normal'],[2.49,'warning'],[1.5,'critical'],[1.51,'warning']]],
  ['ammonia','ammonia',[[0,'normal'],[0.25,'normal'],[0.251,'warning'],[0.5,'critical'],[0.499,'warning']]],
]) for (const [value, severity] of cases) assert.equal(evaluate({ ...reading, [field]: value }).metrics[key].severity, severity, `${key}: ${value}`);
assert.equal(evaluate().severity, 'normal');
assert.equal(evaluate({ ...reading, ammonia: null }).severity, 'partial');
assert.equal(evaluate({ ...reading, water_depth_cm: 1 }, { ...fixtures, waterCriticalMin: null }).metrics.water.severity, 'configuration');
assert.equal(evaluate(reading, rules.DEFAULT_THRESHOLDS).metrics.temperature.severity, 'unverified');
assert.equal(evaluate({ ...reading, created_at: '2026-10-11T13:00:54Z' }).metrics.temperature.severity, 'stale');
assert.equal(evaluate({ ...reading, created_at: '2026-10-11T13:00:55Z' }).metrics.temperature.severity, 'normal');
assert.equal(evaluate(reading, fixtures, { serverTime: null }).metrics.temperature.severity, 'unverified');
for (const status of ['SENSOR_ERROR','UNKNOWN','NO_READING','SENSOR_STALE'])
  assert.notEqual(evaluate({ ...reading, water_status: status }).metrics.water.severity, 'normal');
assert.equal(evaluate({ ...reading, raw_payload: { water_state: { last_good_used: true } } }).metrics.water.severity, 'stale');
assert.equal(evaluate({ ...reading, raw_payload: { analog_state: { ph_fresh: false } } }).metrics.ph.severity, 'stale');
assert.equal(evaluate({ ...reading, created_at: '2026-10-11T13:03:00Z' }).metrics.temperature.severity, 'invalid');
for (const value of [NaN, Infinity, '', 'bad', -1]) assert.notEqual(evaluate({ ...reading, water_depth_cm: value }).metrics.water.severity, 'normal');
assert.equal(evaluate(reading, fixtures, { paired: false }).metrics.water.severity, 'unpaired');
assert.equal(evaluate(reading, fixtures, { paired: false }).metrics.ammonia.severity, 'normal');
const resolver = app.load('src/utils/thresholdResolution.js');
const account = { thresholds: { waterCriticalMin: 1, waterLevelMax: 5, ammoniaCriticalMax: 0.5 } };
const tank = { thresholds: { waterLevelMin: 3, waterCriticalMin: 2 } };
const a = resolver.resolveThresholdRows(tank,account), b = resolver.resolveThresholdRows(null,account);
assert.equal(a.waterCriticalMin,2); assert.equal(b.waterCriticalMin,1); assert.equal(a.waterLevelMax,5);
assert.equal(a.policySources.waterCriticalMin,'tank'); assert.equal(a.policySources.waterLevelMax,'account');
assert.equal(resolver.resolveThresholdRows({ thresholds: { ...tank.thresholds, waterCriticalMin: null } },account).waterCriticalMin,1);
assert.ok(policy.validateClassificationSettings({ ...fixtures, waterCriticalMax: 3 }).length);
assert.ok(policy.validateClassificationSettings({ ...fixtures, waterLevelMax: null }).length);
assert.ok(policy.validateClassificationSettings({ ...fixtures, ammoniaMaxAgeSeconds: 0 }).length);
assert.equal(evaluate().metrics.water.safeRangeLabel,'Safe Range: 2–4 cm');
assert.equal(evaluate(reading,{ ...fixtures, waterLevelMin: 3,waterLevelMax: 5,waterCriticalMax: 6 }).metrics.water.safeRangeLabel,'Safe Range: 3–5 cm');
for (const mode of ['light','dark']) {
  const view = harness({mode}); view.render('src/components/tank/SensorReadingCard.js',{ metric:evaluate().metrics.water,colors:view.palette[mode==='dark'?'DARK_COLORS':'LIGHT_COLORS'] });
  assert.ok(view.texts.includes('Safe Range: 2–4 cm')); assert.ok(view.texts.some(text => text.startsWith('Critical Limit:')));
}
assert.equal(fs.readFileSync('src/utils/classificationPolicy.js','utf8'), fs.readFileSync('supabase/functions/_shared/classificationPolicy.js','utf8'));
assert.equal(fs.readFileSync('src/utils/thresholdResolution.js','utf8'), fs.readFileSync('supabase/functions/_shared/thresholdResolution.js','utf8').replace("'./classificationPolicy.js'","'./classificationPolicy'"));
const snapshot=JSON.stringify(reading); evaluate(); assert.equal(JSON.stringify(reading),snapshot);
console.log('PASS configured safe/critical boundaries and equality for five parameters; unset limits; validity/recency/server clock; partial data; tank/account inheritance; card labels/colors; shared contract; immutable readings');

async function settingsInteraction() {
  const writes = []; let confirmation;
  const db = { auth: { getUser: async () => ({data:{user:{id:'user'}}}) },
    rpc: async (name, args) => { writes.push({name,args}); return {data:{}}; },
    from(table) { return { select(){return this;},eq(){return this;},async maybeSingle(){return{data: table==='tank_threshold_settings'?{thresholds:fixtures}:null};} }; } };
  const view = harness({overrides:{supabase:db,alert:(title,message,buttons)=>{confirmation=buttons;}}});
  const resolved=resolver.resolveThresholdRows({thresholds:fixtures},null);
  const props={tankId:'A',thresholds:resolved,colors:view.palette.LIGHT_COLORS,onSaved:async()=>{}};
  view.render('src/components/tank/ClassificationSettings.js',props);view.flushEffects();view.render();
  const field=()=>view.elements.find(node=>node.props.accessibilityLabel==='Water Critical at or below in cm');
  field().props.onChangeText('1.5');view.render();
  const save=()=>view.elements.find(node=>node.type==='TouchableOpacity'&&JSON.stringify(node.props.children).includes('Review and save'));
  save().props.onPress();assert.equal(writes.length,0);confirmation.find(button=>button.text==='Cancel');
  save().props.onPress();await confirmation.find(button=>button.text==='Save').onPress();
  assert.equal(writes.length,1);assert.equal(writes[0].name,'configure_tank_classification');assert.equal(writes[0].args.p_patch.waterCriticalMin,1.5);
  assert.equal(writes[0].args.p_tank_id,'A');
  field().props.onChangeText('3');view.render();save().props.onPress();await confirmation.find(button=>button.text==='Save').onPress();view.render();
  assert.equal(writes.length,1);assert.ok(view.texts.some(text=>text.includes('below the safe minimum')));
  field().props.onChangeText('1.6');view.render();save().props.onPress();const oldConfirm=confirmation.find(button=>button.text==='Save').onPress;
  view.render('src/components/tank/ClassificationSettings.js',{...props,tankId:'B'});await oldConfirm();assert.equal(writes.length,1,'tank switch aborts stale confirmation');
  view.unmount();
  console.log('PASS classification settings confirmation, finite/order validation, scoped RPC and stale confirmation guard');
}
settingsInteraction().catch(error=>{console.error(error);process.exitCode=1;});
