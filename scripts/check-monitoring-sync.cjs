/* global __dirname */
// Offline fixtures only. No live users, database writes, provider calls or hardware commands.
const assert = require('node:assert/strict');
const path = require('node:path');
const { harness } = require('./check-mobile-ui.cjs');
process.chdir(path.resolve(__dirname, '..'));
const at = '2026-10-12T04:00:00Z';
const sensor = (id, tank='A', extra={}) => ({id,user_id:'user',tank_id:tank,device_uid:`sensor-${tank}`,
  iot_device_id:`device-${tank}`,created_at:at,temperature_c:27,ph_value:7,water_depth_cm:5,turbidity_voltage:3,...extra});
const device = (tank='A', extra={}) => ({id:`device-${tank}`,user_id:'user',tank_id:tank,is_claimed:true,device_type:'sensor_hub',device_uid:`sensor-${tank}`,...extra});
const fixture = {iot_devices:[device(),device('B')],sensor_readings:[sensor('a'),sensor('z'),sensor('b','B'),
  sensor('former','A',{device_uid:'old-device',created_at:'2026-10-12T05:00:00Z'}),sensor('foreign','A',{user_id:'other'})],
  ammonia_readings:[{id:'scan-A',tank_id:'A',user_id:'user',created_at:'2026-10-12T03:00:00Z',ammonia_level:0}],
  tank_threshold_settings:[],threshold_settings:[]};
const queries=[],channels=[],removed=[],timers=[],cleared=[];
let user='user',authCallback,authRemoved=0,appCallback,appRemoved=0,deferNext=false,release,deferAuth=false,rejectAuth;
let authError;
const db={auth:{getSession:async()=>{if(deferAuth){deferAuth=false;return new Promise((resolve,reject)=>{rejectAuth=reject;});}return {data:{session:user?{user:{id:user}}:null},error:authError};},onAuthStateChange(fn){authCallback=fn;return {data:{subscription:{unsubscribe(){authRemoved++;}}}};}},
  rpc:async name=>{assert.equal(name,'craythrive_server_time');return {data:at};},
  from(table){const operations=[];const q=new Proxy({}, {get(object,key){if(key==='then'){
    queries.push({table,operations});let rows=[...(fixture[table]||[])];
    for(const [op,field,value] of operations){
      if(op==='eq')rows=rows.filter(row=>row[field]===value);
      if(op==='in')rows=rows.filter(row=>value.includes(row[field]));
      if(op==='gte')rows=rows.filter(row=>row[field]>=value);
      if(op==='lt')rows=rows.filter(row=>row[field]<value);
    }
    const orders=operations.filter(([op])=>op==='order');
    rows.sort((a,b)=>{for(const [,field,options] of orders){const difference=String(a[field]||'').localeCompare(String(b[field]||''));if(difference)return difference*(options.ascending?1:-1);}return 0;});
    for(const [op,count] of operations)if(op==='limit')rows=rows.slice(0,count);
    const result={data:operations.some(([op])=>op==='maybeSingle')?rows[0]||null:rows,error:fixture.errors?.[table]};
    const promise=table==='sensor_readings'&&deferNext?(deferNext=false,new Promise(resolve=>{release=()=>resolve(result);})) :Promise.resolve(result);
    return promise.then.bind(promise);
  }return(...args)=>{assert.ok(!['insert','update','upsert','delete'].includes(key),'monitoring must remain read only');operations.push([key,...args]);return q;};}});return q;},
  channel(name){const ch={name,handlers:[],on(event,filter,fn){this.handlers.push({filter,fn});return this;},subscribe(fn){this.status=fn;return this;}};channels.push(ch);return ch;},
  removeChannel(ch){removed.push(ch);}};
const appState={currentState:'active',addEventListener(name,fn){appCallback=fn;return {remove(){appRemoved++;}};}};
const ui=harness({overrides:{supabase:db,appState,setInterval(fn,delay){const timer={fn,delay};timers.push(timer);return timer;},clearInterval(timer){cleared.push(timer);}}});
const monitor=ui.load('src/utils/sensorMonitoring.js'),rules=ui.load('src/utils/thresholdSettings.js');
const settle=async()=>{for(let i=0;i<180;i++)await Promise.resolve();};
async function main(){
  const original=JSON.stringify(fixture);
  assert.equal((await monitor.fetchLatestMonitoringRows(null,['A'])).sensors.length,0);
  assert.equal(queries.length,0,'no anonymous monitoring fallback');
  let rows=await monitor.fetchLatestMonitoringRows('user',['A','B']);
  assert.equal(rows.sensors.find(row=>row.tank_id==='A').id,'z','stable ID tie breaker');
  assert.equal(rows.sensors.find(row=>row.tank_id==='B').id,'b');
  const combined=monitor.combineMonitoringReadings(rows.sensors[0],rows.scans[0]);
  assert.equal(combined.ammonia,0);assert.equal(combined.ammonia_created_at,fixture.ammonia_readings[0].created_at);
  assert.equal(combined.sensor_created_at,at);assert.equal(combined.ammonia_reading_id,'scan-A');
  assert.match(combined.ammonia_source,/method not recorded/);
  assert.equal(monitor.ammoniaSourceLabel({source:'manual'}),'Manual test entry');
  assert.equal(monitor.ammoniaSourceLabel({camera_device_uid:'legacy-camera'}),'Saved device scan');
  assert.throws(()=>monitor.combineMonitoringReadings(sensor('a'),{tank_id:'B'}),/different tanks/);
  assert.equal(JSON.stringify(fixture),original,'original measurements remain intact');
  for(const query of queries.filter(row=>['sensor_readings','ammonia_readings'].includes(row.table))){
    assert.ok(query.operations.some(([op,field,value])=>op==='eq'&&field==='user_id'&&value==='user'));
    assert.ok(query.operations.some(([op,field])=>op==='eq'&&field==='tank_id'));
    assert.equal(query.operations.filter(([op])=>op==='order').map(row=>row[1]).join(','),'created_at,id');
    if(query.table==='sensor_readings')assert.ok(query.operations.some(([op,field])=>op==='eq'&&field==='device_uid'));
  }
  fixture.sensor_readings.push(sensor('nulls','A',{created_at:'2026-10-12T04:01:00Z',ph_value:null,ph:99,
    temperature_c:'',temperature:99,water_depth_cm:null,water_distance_cm:8,turbidity_voltage:null,raw_turbidity_value:3000}));
  rows=await monitor.fetchLatestMonitoringRows('user',['A']);
  assert.equal(rows.sensors[0].id,'nulls');
  const invalid=rules.evaluateMonitoring(rows.sensors[0]);
  for(const metric of ['ph','temperature','water','turbidity']){assert.equal(invalid.metrics[metric].value,null);assert.notEqual(invalid.metrics[metric].severity,'normal');}
  assert.equal(rules.getReadingPh({ph_voltage:2.5,raw_ph_value:2500}),null);
  assert.equal(rules.getReadingPh({ph:7}),7,'absent canonical column may use documented legacy alias');
  fixture.iot_devices.push(device('A',{id:'second',device_uid:'sensor-second'}));
  assert.equal((await monitor.fetchLatestMonitoringRows('user',['A'])).sensors.length,0,'ambiguous pairing does not guess');
  fixture.iot_devices.pop();fixture.iot_devices[0].device_type='actuator_hub';
  assert.equal((await monitor.fetchLatestMonitoringRows('user',['A'])).sensors.length,0,'actuator cannot supply sensor measurements');
  fixture.iot_devices[0].device_type='sensor_hub';
  const newer={id:'A',user_id:'user',monitoring_version:20,latest_reading:{id:'new'}};
  assert.equal(monitor.mergeMonitoringTank(newer,{...newer,monitoring_version:10,latest_reading:{id:'old'}}).latest_reading.id,'new');
  assert.equal(monitor.mergeMonitoringTank(newer,{...newer,monitoring_version:21,latest_reading:null}).latest_reading,null,'authoritative removal remains visible');
  console.log('PASS owned tank/device queries, whole latest row, stable ID ordering, canonical null/raw-field guards, independent ammonia and response versions');

  let state,ids=['A'],snapshots=[],resets=0,accept=true;
  const hook=ui.load('src/hooks/useMonitoringSync.js').default;
  ui.setRoot(()=>{state=hook(ids,value=>{if(!accept)return false;snapshots.push(value);},()=>resets++);return null;});
  const render=()=>{ui.render();ui.flushEffects();};render();await settle();render();
  assert.equal(state.dataAvailable,true);assert.equal(channels.length,1);assert.equal(timers[0].delay,60000);
  render();render();assert.equal(channels.length,1,'rerender does not add subscriptions');
  const emit=(table,tank='A')=>channels.at(-1).handlers.find(row=>row.filter.table===table).fn({new:{tank_id:tank}});
  assert.ok(channels[0].handlers.every(row=>row.filter.event==='*'&&row.filter.filter==='user_id=eq.user'));
  const before=snapshots.length;emit('sensor_readings','B');await settle();assert.equal(snapshots.length,before);
  fixture.sensor_readings.push(sensor('inserted','A',{created_at:'2026-10-12T04:02:00Z'}));
  emit('sensor_readings');await settle();render();assert.equal(state.snapshot.sensors[0].id,'inserted');
  fixture.sensor_readings.at(-1).temperature_c=28;emit('sensor_readings');await settle();render();assert.equal(state.snapshot.sensors[0].temperature,28,'UPDATE re-reads same ID');
  accept=false;fixture.sensor_readings.at(-1).temperature_c=29;emit('sensor_readings');await settle();render();
  assert.equal(state.snapshot.sensors[0].temperature,28,'screen rejection cannot publish an obsolete recommendation snapshot');
  accept=true;state.refresh();await settle();render();assert.equal(state.snapshot.sensors[0].temperature,29);
  deferNext=true;state.refresh();await settle();assert.ok(release);const start=snapshots.length;
  fixture.sensor_readings.push(sensor('newer','A',{created_at:'2026-10-12T04:03:00Z'}));emit('sensor_readings');release();await settle();render();
  assert.equal(state.snapshot.sensors[0].id,'newer');assert.equal(snapshots.length,start+1,'obsolete in-flight result never commits');
  channels[0].status('CHANNEL_ERROR');render();assert.match(state.error,/periodically/);
  channels[0].status('SUBSCRIBED');await settle();render();assert.equal(state.error,undefined);
  const counts=queries.length;appCallback('background');timers[0].fn();await settle();assert.equal(queries.length,counts);
  appCallback('active');await settle();render();assert.ok(queries.length>counts);
  assert.equal(channels.length-removed.length,1,'resume leaves one current channel');
  const beforeReset=resets, savedSnapshot=state.snapshot;
  authError=new Error('temporary network failure');appCallback('active');await settle();render();
  assert.equal(resets,beforeReset,'connection failures never clear the owner or saved readings');
  assert.equal(state.snapshot,savedSnapshot);assert.match(state.error,/connected/);
  authCallback('INITIAL_SESSION',null);await settle();render();assert.equal(resets,beforeReset);
  authError=null;appCallback('active');await settle();render();assert.equal(state.dataAvailable,true);
  fixture.tank_threshold_settings=[{user_id:'user',tank_id:'A',thresholds:{temperatureMax:26}}];
  timers[0].fn();await settle();render();assert.equal(state.snapshot.thresholds.A.temperatureMax,26);
  fixture.errors={sensor_readings:new Error('offline')};state.refresh();await settle();render();
  assert.equal(state.dataAvailable,false);assert.match(state.error,/connected/);delete fixture.errors;
  state.refresh();await settle();render();assert.equal(state.dataAvailable,true);
  deferNext=true;state.refresh();await settle();const savedCount=snapshots.length;
  user=null;authCallback('SIGNED_OUT',null);await settle();release();await settle();render();
  assert.ok(resets>0);assert.equal(state.dataAvailable,false);assert.equal(snapshots.length,savedCount,'signed-out request cannot commit');
  user='other';authCallback('SIGNED_IN',{user:{id:user}});await settle();render();
  assert.equal(state.snapshot.userId,'other');assert.equal(state.snapshot.sensors.length,0);
  deferAuth=true;appCallback('active');await settle();authCallback('TOKEN_REFRESHED',{user:{id:user}});await settle();
  rejectAuth(new Error('old verification failed'));await settle();render();assert.equal(state.dataAvailable,true,'obsolete auth failure cannot erase a newer snapshot');
  channels[0].status('CLOSED');render();assert.equal(state.error,undefined,'removed owner channel cannot change current connection state');
  ids=['B'];ui.render();assert.equal(state.dataAvailable,false,'tank switch hides prior snapshot immediately');ui.flushEffects();await settle();render();
  ui.unmount();assert.equal(authRemoved,2);assert.equal(appRemoved,2);assert.equal(cleared.length,2);assert.equal(removed.length,channels.length);
  const end=queries.length;timers.at(-1).fn();await settle();assert.equal(queries.length,end,'unmounted timer cannot read');
  assert.ok(queries.every(row=>!['profiles','control_logs','device_commands','tank_automation_logs'].includes(row.table)),'realtime never reloads full page or equipment');
  console.log('PASS INSERT/UPDATE, coalescing, tank isolation, reconnect/polling, resume, thresholds, errors, auth races and subscription cleanup');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
