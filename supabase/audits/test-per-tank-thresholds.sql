-- Rollback-only integration checks. Synthetic owners/tanks, no device commands,
-- sensor writes, real user settings, or committed activity. Run with an admin
-- SQL connection after loading the migration in the same transaction if needed.
begin;
create temporary table threshold_test_ids on commit drop as
 select gen_random_uuid() actor, gen_random_uuid() other_actor,
 gen_random_uuid() tank_a, gen_random_uuid() tank_b, gen_random_uuid() tank_c, gen_random_uuid() foreign_tank;
grant select on threshold_test_ids to authenticated, anon;
insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
select id,'authenticated','authenticated','craythrive-threshold-qa-'||id::text||'@example.invalid',
 jsonb_build_object('username','threshold_qa_'||substr(id::text,1,8),'full_name','Threshold QA'),
 '{"provider":"email","providers":["email"]}'::jsonb,now(),now()
from (select actor id from threshold_test_ids union all select other_actor from threshold_test_ids) owners;
insert into public.tanks(id,user_id,tank_name,tank_type,male_count,female_count,juvenile_count,has_paired_device)
select tank_a,actor,'Threshold QA A','Breeder',1,2,0,false from threshold_test_ids
union all select tank_b,actor,'Threshold QA B','Breeder',1,2,0,false from threshold_test_ids
union all select tank_c,actor,'Threshold QA C','Breeder',1,2,0,false from threshold_test_ids
union all select foreign_tank,other_actor,'Threshold QA foreign','Breeder',1,2,0,false from threshold_test_ids;
insert into public.threshold_settings(user_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
select actor,public.craythrive_threshold_values(null),20,30,6.5,8.5,2.5,4.5,0.25 from threshold_test_ids
on conflict(user_id) do update set thresholds=excluded.thresholds,temperature_min=20,temperature_max=30,
 ph_min=6.5,ph_max=8.5,turbidity_max=2.5,water_level_min=4.5,ammonia_max=0.25;
insert into public.tank_threshold_settings(user_id,tank_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
select actor,tank_b,public.craythrive_threshold_values(null)||'{"waterLevelMin":4.2,"phMin":7.1}',20,30,7.1,8.5,2.5,4.2,0.25 from threshold_test_ids
union all select other_actor,foreign_tank,public.craythrive_threshold_values(null)||'{"waterLevelMin":4.9}',20,30,6.5,8.5,2.5,4.9,0.25 from threshold_test_ids;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from threshold_test_ids;
set local role authenticated;
do $tests$
declare ids record; baseline jsonb; b_before jsonb; n integer; log_count integer; blocked boolean; patch jsonb; result jsonb;
begin
 select * into ids from pg_temp.threshold_test_ids;
 select to_jsonb(s) into baseline from public.threshold_settings s where user_id=ids.actor;
 select to_jsonb(s) into b_before from public.tank_threshold_settings s where tank_id=ids.tank_b;
 select count(*) into log_count from public.control_logs where user_id=ids.actor;
 -- Test 5: a preview is a read, never a write or pending-suggestion insert.
 perform public.get_tank_threshold_settings();
 if exists(select 1 from public.tank_threshold_settings where tank_id=ids.tank_a)
   or (select count(*) from public.control_logs where user_id=ids.actor)<>log_count then raise exception 'Preview wrote data'; end if;
 -- Test 1: explicit mobile AI patch, no stored pending suggestion required.
 result=public.apply_tank_thresholds(ids.tank_a,'{"water_level_min":3.5}','single_tank','ai_recommendation');
 if result->>'affected'<>'1' or (select water_level_min from public.tank_threshold_settings where tank_id=ids.tank_a)<>3.5 then raise exception 'Mobile AI save failed'; end if;
 if not exists(select 1 from public.control_logs where tank_id=ids.tank_a and action_status='updated'
  and metadata->>'source'='ai_recommendation' and notes like '%AI recommendation accepted by user%') then raise exception 'AI acceptance attribution missing'; end if;
 -- Test 2: Tank B and the legacy account row must be byte-for-byte unchanged.
 if b_before is distinct from (select to_jsonb(s) from public.tank_threshold_settings s where tank_id=ids.tank_b)
   or baseline is distinct from (select to_jsonb(s) from public.threshold_settings s where user_id=ids.actor) then raise exception 'Single-tank change leaked'; end if;
 -- Test 6: independent canonical reload returns the saved 3.5.
 if not exists(select 1 from jsonb_array_elements(public.get_tank_threshold_settings()) r where r->>'tank_id'=ids.tank_a::text
  and (r->>'water_level_min')::numeric=3.5) then raise exception 'Reload lost the saved setting'; end if;
 -- Test 3: web-compatible camelCase manual patch; mobile resolves same saved row.
 perform public.apply_tank_thresholds(ids.tank_a,'{"waterLevelMin":3.7}','single_tank','manual');
 if (select (public.craythrive_threshold_values(to_jsonb(s))->>'waterLevelMin')::numeric
  from public.tank_threshold_settings s where tank_id=ids.tank_a)<>3.7 then raise exception 'Web/manual save not persisted'; end if;
 -- Test 4: Apply All mirrors only the patch, never unrelated Tank A fields.
 perform public.apply_tank_thresholds(ids.tank_a,'{"water_level_min":4.0}','all_tanks','manual');
 if (select count(*) from public.tank_threshold_settings where user_id=ids.actor and water_level_min=4)<>3
   or (select water_level_min from public.threshold_settings where user_id=ids.actor)<>4
   or (select ph_min from public.tank_threshold_settings where tank_id=ids.tank_b)<>7.1
   or (select ph_min from public.threshold_settings where user_id=ids.actor)<>6.5 then raise exception 'Apply All patch/mirror incorrect'; end if;
 if (select count(distinct tank_id) from public.control_logs where user_id=ids.actor and metadata->>'scope'='all_tanks')<>3 then raise exception 'Apply All activity missing'; end if;
 -- Test 7: the invoker cannot access or change another owner's tank.
 blocked=false;
 begin perform public.apply_tank_thresholds(ids.foreign_tank,'{"water_level_min":3.5}','single_tank','manual');
 exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Foreign tank allowed'; end if;
 if exists(select 1 from public.tank_threshold_settings where tank_id=ids.foreign_tank) then raise exception 'Foreign RLS row visible'; end if;
 -- Whitelist/numeric/range/alias guards must reject before committing anything.
 foreach patch in array array['{"user_id":1}'::jsonb,'{"water_level_min":"3.5"}','{"water_level_min":null}',
  '{"water_level_min":true}','{"water_level_min":-1}','{"water_level_min":21}',
  '{"temperature_min":30,"temperature_max":20}','{"water_level_min":3.5,"waterLevelMin":3.7}'] loop
  blocked=false;
  begin perform public.apply_tank_thresholds(ids.tank_a,patch,'single_tank','manual');
  exception when others then blocked=true; end;
  if not blocked then raise exception 'Invalid patch allowed: %',patch; end if;
 end loop;
 if (select water_level_min from public.tank_threshold_settings where tank_id=ids.tank_a)<>4 then raise exception 'Rejected patch changed data'; end if;
 -- Old web pending-recommendation Apply remains supported.
 update public.tank_threshold_settings set pending_ai_suggestion='{"parameter":"water_level","suggested_value":3.8}' where tank_id=ids.tank_a;
 perform public.apply_tank_thresholds(ids.tank_a,'{}','single_tank','ai_recommendation');
 if (select water_level_min from public.tank_threshold_settings where tank_id=ids.tank_a)<>3.8
  or (select pending_ai_suggestion from public.tank_threshold_settings where tank_id=ids.tank_a) is not null then raise exception 'Pending compatibility failed'; end if;
end;
$tests$;
reset role;
do $foreign_preserved$
begin
 if (select water_level_min from public.tank_threshold_settings where tank_id=(select foreign_tank from threshold_test_ids))<>4.9 then
  raise exception 'Another owner changed during Apply All'; end if;
end;
$foreign_preserved$;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $anonymous$
declare blocked boolean=false;
begin
 begin perform public.apply_tank_thresholds((select tank_a from pg_temp.threshold_test_ids),'{"water_level_min":3.5}','single_tank','manual');
 exception when insufficient_privilege then blocked=true; end;
 if not blocked then raise exception 'Anonymous Apply allowed'; end if;
end;
$anonymous$;
reset role;
rollback;
select 'PASS: 7 threshold scenarios, owner/anonymous RLS, invalid patches, source attribution, Apply All patch/mirror and pending-web compatibility. All synthetic data rolled back; web UI validation is separate.' as result;
