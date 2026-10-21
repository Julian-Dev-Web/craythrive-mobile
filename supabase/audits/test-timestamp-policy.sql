-- Rollback-only test. No sensor readings, alerts, commands or real user records.
begin;
create temporary table timestamp_test_ids on commit drop as select gen_random_uuid() actor, gen_random_uuid() tank;
grant select on timestamp_test_ids to authenticated;
insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','craythrive-time-qa-'||actor::text||'@example.invalid',
 jsonb_build_object('username','time_qa_'||substr(actor::text,1,8),'full_name','Timestamp QA'),
 '{"provider":"email","providers":["email"]}'::jsonb,now(),now() from timestamp_test_ids;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from timestamp_test_ids;
set local role authenticated;
do $tests$
declare before_time timestamptz; after_time timestamptz; saved_time timestamptz; ids record;
begin
 select * into ids from pg_temp.timestamp_test_ids;
 before_time=public.craythrive_server_time();
 -- Updated clients deliberately omit created_at; PostgreSQL now() creates it.
 insert into public.tanks(id,user_id,tank_name,tank_type,male_count,female_count,juvenile_count,has_paired_device)
 values(ids.tank,ids.actor,'Timestamp QA','Breeder',1,2,0,false) returning created_at into saved_time;
 after_time=public.craythrive_server_time();
 -- now() is the transaction start; clock_timestamp() advances within it.
 if saved_time is distinct from transaction_timestamp() or saved_time>after_time or before_time>after_time then
  raise exception 'Database-generated creation time contract failed';
 end if;
 if ('2026-10-11T12:00:00Z'::timestamptz at time zone 'Asia/Manila')::time<>'20:00:00'::time then
  raise exception 'Manila conversion failed';
 end if;
 if not ('2026-10-10T16:00:00Z'::timestamptz >= '2026-10-11T00:00:00+08:00'::timestamptz
   and '2026-10-11T15:59:59.999999Z'::timestamptz < '2026-10-12T00:00:00+08:00'::timestamptz) then
  raise exception 'Manila day interval failed';
 end if;
end;
$tests$;
reset role;
do $types$
begin
 if exists(select 1 from information_schema.columns where table_schema='public' and data_type='timestamp without time zone') then
  raise exception 'Naive timestamp columns require investigation; no automatic conversion';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public'
   and table_name in ('sensor_readings','ammonia_readings','alerts','control_logs','marketplace_orders',
     'marketplace_chat_messages','marketplace_chat_threads','marketplace_listings','tanks','tank_automation_logs')
   and column_name='created_at' and (data_type<>'timestamp with time zone' or column_default is distinct from 'now()')) then
  raise exception 'Authoritative creation default differs from audited policy';
 end if;
end;
$types$;
rollback;
select 'PASS: authenticated database time, database-generated created_at, Manila UTC interval and timestamp column types/defaults. All synthetic rows rolled back; no database timezone/schema/real-record changes.' as result;
