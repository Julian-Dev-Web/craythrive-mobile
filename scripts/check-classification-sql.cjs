/* global __dirname */
// Isolated PostgreSQL only. No Supabase credentials, live writes or hardware.
// Install @electric-sql/pglite outside the repository and set PGLITE_MODULE.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const { harness } = require('./check-mobile-ui.cjs');
const root = path.resolve(__dirname,'..');
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', foreign='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function main() {
 const db=new PGlite();
 try {
 const safeColumns='temperature_min numeric,temperature_max numeric,ph_min numeric,ph_max numeric,turbidity_max numeric,water_level_min numeric,ammonia_max numeric';
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table tanks(id uuid primary key,user_id uuid,tank_name text);
 create table threshold_settings(id uuid default gen_random_uuid() primary key,user_id uuid unique,thresholds jsonb default '{}',${safeColumns},created_at timestamptz default now(),updated_at timestamptz default now());
 create table tank_threshold_settings(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,thresholds jsonb default '{}',${safeColumns},pending_ai_suggestion jsonb,pending_ai_suggested_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),unique(user_id,tank_id));
 create table control_logs(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,action_type text,action_status text,notes text,metadata jsonb,created_at timestamptz default now());
 create table device_commands(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id text,command_type text,command_value text,command_status text,status text,result_message text,created_at timestamptz default now(),executed_at timestamptz,updated_at timestamptz);
 create table tank_automation_logs(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,action_type text,action_status text,reason text,water_status text,ph_status text,turbidity_status text,ammonia_status text,temperature_status text,stable_reading_count integer,created_at timestamptz default now());
 create table alerts(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,type text,title text,message text,severity text,is_read boolean default false,metadata jsonb,command_id uuid,status text default 'active',created_at timestamptz default now(),resolved_at timestamptz);
 create table sensor_readings(device_uid text default 'sensor-a',id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,temperature_c numeric,temperature numeric,temperature_status text,ph_value numeric,ph numeric,ph_status text,turbidity_voltage numeric,turbidity numeric,turbidity_status text,water_depth_cm numeric,water_level numeric,water_status text,raw_payload jsonb,created_at timestamptz default now());
 create table ammonia_readings(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,ammonia_level numeric,ammonia_mg_l numeric,ammonia_status text,status text,message text,chart_label text,created_at timestamptz default now());
 create table iot_devices(id uuid default gen_random_uuid() primary key,user_id uuid,tank_id uuid,device_type text,device_uid text,is_claimed boolean);
 create table notification_preferences(user_id uuid primary key,tank_alerts boolean);
 create table test_pushes(alert_id uuid,severity text);
 create function test_enqueue() returns trigger language plpgsql as $$begin insert into test_pushes values(new.id,new.severity);return new;end$$;
 create trigger test_enqueue after insert on alerts for each row execute function test_enqueue();
 create function craythrive_ai_threshold_patch(value jsonb) returns jsonb language sql as $$select value$$;
 create function create_alert_if_enabled(p_user_id uuid,p_tank_id uuid,p_category text,p_type text,p_title text,p_message text,p_severity text,p_metadata jsonb default '{}') returns void language plpgsql as $$begin
 if coalesce((select tank_alerts from notification_preferences where user_id=p_user_id),true) then
 insert into alerts(user_id,tank_id,type,title,message,severity,metadata) values(p_user_id,p_tank_id,p_type,p_title,p_message,p_severity,p_metadata);end if;end$$;
 grant usage on schema public,auth to authenticated; grant execute on function auth.uid() to authenticated;
 grant select,insert,update,delete on all tables in schema public to authenticated;
 alter table tanks enable row level security;create policy tank_owner on tanks to authenticated using(user_id=auth.uid());
 alter table threshold_settings enable row level security;create policy threshold_owner on threshold_settings to authenticated using(user_id=auth.uid());
 alter table tank_threshold_settings enable row level security;create policy threshold_owner on tank_threshold_settings to authenticated using(user_id=auth.uid());
 alter table alerts enable row level security;create policy alert_owner on alerts to authenticated using(user_id=auth.uid());
 alter table ammonia_readings enable row level security;create policy scan_owner on ammonia_readings to authenticated using(user_id=auth.uid());
 alter table control_logs enable row level security;create policy broad_controls on control_logs for select to authenticated using(true);create policy own_write on control_logs for all to authenticated using(user_id=auth.uid());
 alter table device_commands enable row level security;create policy broad_commands on device_commands for select to authenticated using(true);
 insert into tanks values('${a}','${owner}','A'),('${b}','${owner}','B'),('${foreign}','${other}','Foreign');
 insert into threshold_settings(user_id,thresholds) values('${owner}','{"waterLevelMin":2}');
 insert into iot_devices(user_id,tank_id,device_type,device_uid,is_claimed) values('${owner}','${a}','sensor','sensor-a',true),('${owner}','${b}','sensor','sensor-b',true);`);
 const migration=fs.readFileSync(path.join(root,'supabase/setup/configurable-classification.sql'),'utf8');
 const history=fs.readFileSync(path.join(root,'supabase/setup/tank-activity-history.sql'),'utf8');
 await db.exec(migration); await db.exec(history); await db.exec(migration); await db.exec(history);
 await db.exec('create trigger classification_threshold_audit after insert or update on tank_threshold_settings for each row execute function craythrive_audit_threshold_change();');
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const one=async(sql,args=[]) => (await q(sql,args))[0];
 const rules=harness().load('src/utils/thresholdSettings.js'), pure=harness().load('src/utils/classificationPolicy.js');
 const settings={...rules.DEFAULT_THRESHOLDS,waterLevelMin:2,waterLevelMax:4,waterCriticalMin:1,waterCriticalMax:5,
 temperatureCriticalMin:18,temperatureCriticalMax:32,phCriticalMin:6,phCriticalMax:9,turbidityCriticalMinV:1.5,ammoniaCriticalMax:0.5,
 ...Object.fromEntries(['temperature','ph','water','turbidity','ammonia'].map(key=>[`${key}MaxAgeSeconds`,120]))};
 for(const [param,values] of Object.entries({temperature:[18,18.001,20,30,30.001,32],ph:[6,6.1,6.5,8.5,8.6,9],water:[1,1.1,2,4,4.1,5],turbidity:[1.5,1.51,2.5],ammonia:[0,0.25,0.251,0.5]})) {
  for(const value of values) assert.equal((await one('select craythrive_classify_parameter($1,$2,$3,null,now(),now(),true) r',[param,value,JSON.stringify(settings)])).r.severity,pure.classifyParameter(param,value,settings).severity);
 }
 assert.equal((await one("select craythrive_classify_parameter('water',3,$1,'stale',now(),now(),true) r",[JSON.stringify(settings)])).r.severity,'stale');
 assert.equal((await one("select craythrive_classify_parameter('water',3,$1,null,now()-interval '121 seconds',now(),true) r",[JSON.stringify(settings)])).r.severity,'stale');
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 const configure=(tank,patch,scope='single_tank')=>q('select configure_tank_classification($1,$2,$3)',[tank,JSON.stringify(patch),scope]);
 await configure(a,{waterLevelMax:4,waterCriticalMin:1,waterCriticalMax:5,waterMaxAgeSeconds:120},'account_defaults');
 await configure(a,{waterCriticalMin:0.5});
 assert.equal((await one("select craythrive_tank_activity_history($1,now()-interval '1 day',now()+interval '1 second',100) h",[a])).h.tank.id,a);
 await assert.rejects(configure(foreign,{waterCriticalMin:1}),/ownership/);
 await assert.rejects(configure(a,{waterCriticalMax:3}),/above/);
 await assert.rejects(configure(a,{waterMaxAgeSeconds:0}),/Invalid/);
 await assert.rejects(configure(a,{unrecognized:1}),/Invalid/);
 await configure(a,{waterCriticalMin:null});
 await q('select apply_tank_thresholds($1,$2)',[b,JSON.stringify({water_level_min:2.5})]);
 assert.equal((await one('select thresholds from tank_threshold_settings where tank_id=$1',[b])).thresholds.waterCriticalMin,null,'safe-only first Apply inherits policy');
 await configure(a,{waterCriticalMin:0.5});
 await q('select apply_tank_thresholds($1,$2)',[a,JSON.stringify({water_level_min:2.1})]);
 assert.equal((await one('select thresholds from tank_threshold_settings where tank_id=$1',[a])).thresholds.waterCriticalMin,0.5,'safe edit retains policy');
 await configure(a,{waterCriticalMin:0.8},'account_defaults');
 const legacyClient=await q("insert into alerts(user_id,tank_id,type,title,severity,metadata) values($1,$2,'sensor_reading','Legacy Critical','critical','{\"policy\":\"configured-v1\"}') returning id",[owner,a]);
 assert.equal(legacyClient.length,0,'a client cannot forge server policy metadata to insert condition alerts');
 await db.exec('reset role;');
 assert.equal((await q("insert into alerts(user_id,tank_id,type,title,severity) values($1,$2,'sensor_reading','Legacy Critical','critical') returning id",[owner,a])).length,0,'old server condition producer is gated');
 assert.equal((await one('select craythrive_effective_classification($1,$2) t',[owner,a])).t.waterCriticalMin,0.5);
 assert.equal((await one('select craythrive_effective_classification($1,$2) t',[owner,b])).t.waterCriticalMin,0.8);
 // Install the actual production trigger endpoints; old raw statuses remain untouched.
 await db.exec('create trigger reading_notification after insert on sensor_readings for each row execute function create_alert_from_sensor_reading();create trigger scan_notification after insert on ammonia_readings for each row execute function create_alert_from_ammonia_reading();');
 const insertWater=value=>q('insert into sensor_readings(user_id,tank_id,water_depth_cm,water_status) values($1,$2,$3,$4) returning id',[owner,a,value,'SAFE']);
 await insertWater(2); await insertWater(1.9); await insertWater(1.8);
 assert.equal(Number((await one("select count(*) n from alerts where metadata->>'policy'='configured-v1'")).n),1,'numeric fluctuations reuse one incident');
 await insertWater(0.5); await insertWater(0.4);
 assert.equal(Number((await one("select count(*) n from test_pushes where severity='critical'")).n),1,'one Critical escalation notification');
 assert.equal((await one("select severity from alerts where status='active' and metadata->>'policy'='configured-v1'")).severity,'critical');
 await insertWater(1.9);
 assert.equal((await one("select severity from alerts where status='active' and metadata->>'policy'='configured-v1'")).severity,'warning');
 await insertWater(0.5);
 assert.equal(Number((await one("select count(*) n from test_pushes where severity='critical'")).n),1,'Critical oscillation stays within notice cooldown');
 await q('insert into sensor_readings(user_id,tank_id,water_depth_cm,water_status) values($1,$2,3,$3)',[owner,a,'SENSOR_STALE']);
 assert.ok(Number((await one("select count(*) n from alerts where status='active' and metadata->>'policy'='configured-v1'")).n)>0,'stale value cannot resolve');
 await insertWater(3);
 assert.equal(Number((await one("select count(*) n from alerts where status='active' and metadata->>'policy'='configured-v1'")).n),0);
 assert.ok(Number((await one("select count(*) n from control_logs where action_type='sensor_recovery'")).n)>0,'recovery event recorded');
 assert.equal((await one('select water_status from sensor_readings order by created_at desc limit 1')).water_status,'SAFE','raw firmware status is unchanged');
 await q('insert into sensor_readings(user_id,tank_id,water_depth_cm,water_status) values($1,$2,3,$3)',[owner,a,'SENSOR_ERROR']);
 assert.equal((await one("select metadata->>'classification' s from control_logs where metadata->>'parameter'='water' order by created_at desc,id desc limit 1")).s,'invalid');
 assert.equal((await one("select type from alerts where status='active' and metadata->>'policy'='configured-v1-fault'")).type,'sensor_fault','operational fault stays distinct from water-condition Critical');
 await insertWater(3);
 await q('insert into notification_preferences values($1,false)',[owner]);
 const noticesBefore=Number((await one('select count(*) n from test_pushes')).n);
 await q("insert into sensor_readings(user_id,tank_id,water_depth_cm,water_status,device_uid) values($1,$2,0.1,$3,'sensor-b')",[owner,b,'SAFE']);
 assert.equal(Number((await one('select count(*) n from test_pushes')).n),noticesBefore,'notification preference is preserved');
 assert.ok(Number((await one("select count(*) n from control_logs where tank_id=$1 and metadata->>'classification'='critical'",[b])).n)>0,'disabled notifications do not hide recorded classification transitions');
 await q('delete from notification_preferences where user_id=$1',[owner]);
 const before=await q("select id,metadata from control_logs where metadata->>'classification'='critical'");
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`); await configure(a,{waterCriticalMin:0.4}); await db.exec('reset role;');
 assert.deepEqual(await q("select id,metadata from control_logs where id=any($1::uuid[])",[before.map(row=>row.id)]),before,'threshold change never rewrites old transition snapshots');
 await q('insert into control_logs(user_id,tank_id,action_type) values($1,$2,$3)',[other,foreign,'feed']);
 await q('insert into device_commands(user_id,tank_id,command_type) values($1,$2,$3)',[other,foreign,'FEED_ONCE']);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 assert.equal((await q('select * from control_logs where user_id=$1',[other])).length,0,'restrictive guard defeats broad permissive SELECT');
 assert.equal((await q('select * from device_commands where user_id=$1',[other])).length,0);
 await assert.rejects(q("select craythrive_tank_activity_history($1,now()-interval '1 day',now(),100)",[foreign]),/unavailable/);
 await assert.rejects(q("select craythrive_tank_activity_history($1,now()-interval '32 days',now(),100)",[a]),/valid activity window/);
 console.log('PASS isolated PostgreSQL: migrations apply/reapply; JS/SQL boundary parity; scoped config inheritance/validation/safe edits; incident cooldown/escalation/recovery; source faults; notification preferences; legacy producer gate; immutable snapshots; owner RPC/RLS guards. Live Supabase unchanged.');
 } finally { await db.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
