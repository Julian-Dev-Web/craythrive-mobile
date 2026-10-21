/* global __dirname */
const assert = require('node:assert/strict');
const path = require('node:path');
const { harness } = require('./check-mobile-ui.cjs');
process.chdir(path.resolve(__dirname,'..'));
const app=harness(), { buildTankActivity: build, normalizeActivityEvent: normalize }=app.load('src/utils/activityHistory.js');
const tank={id:'A',tank_name:'Breeder A',user_id:'user'}, at='2026-10-11T13:02:55Z';
const row=values=>({id:'row',user_id:'user',tank_id:'A',created_at:at,...values});
const sources={ tank_automation_logs:[row({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',action_type:'AUTO_REFILL',action_status:'done',reason:'Expected water movement confirmed.'})],
 device_commands:[row({id:'command',command_type:'REFILL_FOR',command_status:'done',result_message:'Auto log id: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),row({id:'feed',command_type:'FEED_ONCE',command_status:'done'})],
 control_logs:[row({id:'control',action_type:'refill',action_status:'completed',metadata:{command_id:'command'}}),row({id:'settings',action_type:'threshold_updated',action_status:'updated',metadata:{old_values:{waterLevelMin:2},new_values:{waterLevelMin:3}}}),row({id:'sensor',action_type:'sensor_warning',action_status:'recorded',metadata:{severity:'warning',classification:'warning',parameter:'water',reading_value:1.9,unit:'cm',threshold_snapshot:{waterLevelMin:2},recommendation:'Saved advice'}})],
 alerts:[row({id:'notice',type:'actuator_command',title:'Refill completed',severity:'normal',command_id:'command'}),row({id:'old',type:'sensor_reading',title:'pH warning',severity:'warning',created_at:'2026-10-10T10:00:00Z',status:'resolved',resolved_at:at})],
 ammonia_readings:[row({id:'scan',ammonia_level:0.1,status:'SAFE'})] };
async function main(){
 const snapshot=JSON.stringify(sources), events=build({tank,userId:'user',sources});
 assert.equal(events.filter(item=>item.category==='water').length,1,'explicit mirror/command/control relation deduplicates');
 assert.equal(events.find(item=>item.sourceId==='feed').outcome,'Unknown / Unconfirmed');
 assert.equal(events.find(item=>item.source==='tank_automation_logs').outcome,'Completed (device-reported)');
 assert.equal(events.find(item=>item.source==='tank_automation_logs').linkedNotifications.length,1);
 assert.match(events.find(item=>item.id.endsWith(':resolved')).reason,/does not prove sensor recovery/);
 assert.equal(events.find(item=>item.sourceId==='sensor').recommendation,'Saved advice');
 assert.equal(events.find(item=>item.sourceId==='sensor').severity,'warning');
 assert.equal(events.find(item=>item.sourceId==='scan').severity,'normal');
 assert.match(events.find(item=>item.sourceId==='scan').result,/Historical test/);
 assert.equal(build({tank,userId:'other',sources}).length,0);
 assert.equal(build({tank:{id:'B'},userId:'user',sources}).length,0);
 assert.equal(JSON.stringify(sources),snapshot);
 for(const status of [null,'done','completed','unexpected']) assert.equal(normalize('device_commands',row({command_type:'REFILL_FOR',command_status:status}),tank).outcome,'Unknown / Unconfirmed');
 for(const [status,outcome] of [['pending','Requested'],['running','Started'],['rejected','Skipped'],['failed','Failed']]) assert.equal(normalize('device_commands',row({command_type:'FEED_ONCE',command_status:status}),tank).outcome,outcome);
 assert.equal(normalize('tank_automation_logs',row({action_type:'AUTO_DRAIN',action_status:'done',reason:'Expected water movement was NOT confirmed.'}),tank).outcome,'Unknown / Unconfirmed');
 const boundarySources={alerts:[row({id:'start',created_at:'2026-10-10T16:00:00Z'}),row({id:'last',created_at:'2026-10-11T15:59:59.999Z'}),row({id:'end',created_at:'2026-10-11T16:00:00Z'})]};
 assert.deepEqual(Array.from(build({tank,userId:'user',sources:boundarySources,start:'2026-10-10T16:00:00Z',end:'2026-10-11T16:00:00Z'}),item=>item.sourceId),['last','start']);
 const originalTZ=process.env.TZ;
 const outputs=['UTC','America/New_York','Asia/Tokyo','Asia/Manila'].map(zone=>{process.env.TZ=zone;return JSON.stringify(build({tank,userId:'user',sources}));});
 if(originalTZ===undefined) delete process.env.TZ;else process.env.TZ=originalTZ;
 assert.equal(new Set(outputs).size,1);

 const calls=[], tables=[], fixture={tanks:[tank],alerts:sources.alerts,ammonia_readings:sources.ammonia_readings};
 let missing=true, network=false, currentUser='user';
 const db={auth:{getUser:async()=>({data:{user:{id:currentUser}}})},async rpc(name,args){calls.push({name,args});
  if(name==='craythrive_server_time') return {data:at};
  if(network) return {error:{code:'NETWORK',message:'offline'}};
  return missing?{error:{code:'PGRST202'}}:{data:{tank,sources}};
 }, from(table){const operations=[];const query=new Proxy({}, {get(target,key){if(key==='then'){
  tables.push({table,operations});let rows=[...fixture[table]||[]];
  for(const [op,field,value] of operations){if(op==='eq')rows=rows.filter(row=>row[field]===value);if(op==='gte')rows=rows.filter(row=>row[field]>=value);if(op==='lt')rows=rows.filter(row=>row[field]<value);if(op==='limit')rows=rows.slice(0,field);}
  const result=Promise.resolve({data:operations.some(([op])=>op==='maybeSingle')?rows[0]||null:rows});return result.then.bind(result);
 }return(...args)=>{assert.ok(!['insert','update','upsert','delete'].includes(key),'history is read only');operations.push([key,...args]);return query;};}});return query;},channel(){return{on(){return this;},subscribe(){}};},removeChannel(){}};
 const service=harness({overrides:{supabase:db}}).load('src/services/tankActivityService.js');
 let data=await service.fetchTankActivity({tankId:'A',date:'2026-10-11'},db);
 assert.match(data.notice,/pending/);assert.equal(data.range.start,'2026-10-10T16:00:00.000Z');assert.equal(data.range.end,'2026-10-11T16:00:00.000Z');
 assert.ok(!tables.some(q=>['control_logs','device_commands','tank_automation_logs','sensor_readings'].includes(q.table)));
 for(const q of tables)assert.ok(q.operations.some(([op,field,value])=>op==='eq'&&field==='user_id'&&value==='user'));
 missing=false;data=await service.fetchTankActivity({tankId:'A'},db);assert.equal(data.range.firstDay,'2026-10-05');
 network=true;await assert.rejects(service.fetchTankActivity({tankId:'A'},db),error=>error.code==='NETWORK');network=false;
 currentUser='other';await assert.rejects(service.fetchTankActivity({tankId:'A'},db),/unavailable/);currentUser='user';
 await assert.rejects(service.fetchTankActivity({tankId:'A',date:'2026-02-30'},db),/valid Philippine/);
 for(const mode of ['light','dark']){
 let params;const ui=harness({mode,width:320,overrides:{activityData:(...args)=>{params=args;return{loading:false,data:{tank,userId:'user',sources,range:{start:'2026-10-10T16:00:00Z',end:'2026-10-11T16:00:00Z',firstDay:'2026-10-11',today:'2026-10-11'}},refresh(){}};}}});
 ui.render('src/components/tank/TankActivityTimeline.js',{tank,colors:ui.palette[mode==='dark'?'DARK_COLORS':'LIGHT_COLORS']});
 assert.ok(ui.texts.includes('Activity history'));assert.ok(ui.texts.includes('Unknown / Unconfirmed'));assert.ok(ui.texts.some(text=>text.includes('9:02')));
 ui.elements.find(node=>node.props.accessibilityLabel==='Activity Philippine date YYYY-MM-DD').props.onChangeText('2026-10-11');ui.render();
 ui.elements.find(node=>node.type==='TouchableOpacity'&&JSON.stringify(node.props.children).includes('Apply date')).props.onPress();ui.render();assert.equal(params[1],'2026-10-11');
 ui.elements.find(node=>node.type==='TouchableOpacity'&&JSON.stringify(node.props.children).includes('Feeding')).props.onPress();ui.render();assert.ok(!ui.texts.some(text=>text.includes('Threshold settings changed')));
 }
 const timers=[],removed=[];let active;
 const hookView=harness({overrides:{supabase:db,setInterval:(fn,delay)=>{timers.push({fn,delay});return 1;},clearInterval:id=>removed.push(id),appState:{currentState:'active',addEventListener:(name,fn)=>{active=fn;return{remove(){}};}}}});
 hookView.render('src/hooks/useTankActivity.js','A');hookView.flushEffects();for(let i=0;i<100;i++)await Promise.resolve();hookView.render();
 assert.equal(timers[0].delay,60000);let count=calls.length;active('background');await timers[0].fn();assert.equal(calls.length,count);active('active');for(let i=0;i<100;i++)await Promise.resolve();assert.ok(calls.length>count);
 hookView.unmount();assert.equal(removed.length,1);
 console.log('PASS activity identity/deduplication, honest hardware outcomes, immutable historical context, Manila/date/type/tank filters, safe fallback/auth/network handling, responsive cards and read-only refresh lifecycle.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
