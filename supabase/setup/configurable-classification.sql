-- FIX #3: REVIEW DRAFT. Do not apply until this concrete migration is reviewed.
-- No critical/freshness defaults, reading backfill, firmware or actuator changes.
begin;

create or replace function public.craythrive_json_number(value jsonb) returns numeric
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result numeric;
begin
 if jsonb_typeof(value) not in ('number','string') or value is null then return null; end if;
 if (value #>> '{}') !~ '^\s*[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$' then return null; end if;
 result=(value #>> '{}')::numeric;
 if result::double precision in ('Infinity'::double precision,'-Infinity'::double precision) then return null; end if;
 return result;
exception when numeric_value_out_of_range or invalid_text_representation then return null;
end $$;

create or replace function public.craythrive_policy_keys() returns text[]
language sql immutable as $$ select array[
 'waterLevelMax','temperatureCriticalMin','temperatureCriticalMax','phCriticalMin','phCriticalMax',
 'waterCriticalMin','waterCriticalMax','turbidityCriticalMinV','ammoniaCriticalMax',
 'temperatureMaxAgeSeconds','phMaxAgeSeconds','waterMaxAgeSeconds','turbidityMaxAgeSeconds','ammoniaMaxAgeSeconds']; $$;

create or replace function public.craythrive_policy_values(row_value jsonb) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(k,public.craythrive_json_number(coalesce(nullif(row_value->'thresholds'->k,'null'),row_value->k))),'{}'::jsonb)
 from unnest(public.craythrive_policy_keys()) k; $$;

-- Existing safe normalization/defaults remain unchanged; optional fields survive safe edits.
create or replace function public.craythrive_threshold_values(p_row jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb='{}'; item record; candidate jsonb;
begin
 for item in select * from (values
 ('temperatureMin','temperature_min',20::numeric),('temperatureMax','temperature_max',30::numeric),
 ('phMin','ph_min',6.5::numeric),('phMax','ph_max',8.5::numeric),('turbidityMax','turbidity_max',2.5::numeric),
 ('waterLevelMin','water_level_min',4.5::numeric),('ammoniaMax','ammonia_max',0.25::numeric)) v(key,column_name,fallback) loop
 candidate=coalesce(nullif(p_row->'thresholds'->item.key,'null'),nullif(p_row->'thresholds'->item.column_name,'null'),p_row->item.column_name);
 result=result||jsonb_build_object(item.key,coalesce(public.craythrive_json_number(candidate),item.fallback));
 end loop;
 return result||public.craythrive_policy_values(p_row);
end $$;

create or replace function public.craythrive_merge_classification(tank_row jsonb,account_row jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb=public.craythrive_threshold_values(coalesce(tank_row,account_row)); k text;
 tank_policy jsonb=public.craythrive_policy_values(tank_row); account_policy jsonb=public.craythrive_policy_values(account_row);
begin
 foreach k in array public.craythrive_policy_keys() loop
 result=result||jsonb_build_object(k,coalesce(nullif(tank_policy->k,'null'),account_policy->k,'null'::jsonb));
 end loop;
 return result;
end $$;

create or replace function public.craythrive_validate_classification(t jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
declare k text; v numeric; b record; lo numeric; hi numeric; cl numeric; ch numeric;
begin
 foreach k in array public.craythrive_policy_keys() loop
 if t->k is null or t->k='null' then continue; end if;
 v=public.craythrive_json_number(t->k);
 if v is null or (k like '%MaxAgeSeconds' and v<=0) then raise exception 'Invalid classification value: %',k using errcode='22023'; end if;
 end loop;
 for b in select * from (values
 ('temperatureMin','temperatureMax','temperatureCriticalMin','temperatureCriticalMax'),
 ('phMin','phMax','phCriticalMin','phCriticalMax'),('waterLevelMin','waterLevelMax','waterCriticalMin','waterCriticalMax'),
 ('turbidityMax',null,'turbidityCriticalMinV',null),(null,'ammoniaMax',null,'ammoniaCriticalMax')) x(low_key,high_key,critical_low,critical_high) loop
 lo=public.craythrive_json_number(t->b.low_key); hi=public.craythrive_json_number(t->b.high_key);
 cl=public.craythrive_json_number(t->b.critical_low); ch=public.craythrive_json_number(t->b.critical_high);
 if lo is not null and hi is not null and lo>=hi then raise exception 'Safe minimum must be below maximum: %',b.low_key using errcode='22023'; end if;
 if cl is not null and (lo is null or cl>=lo) then raise exception 'Lower Critical limit must be below safe minimum: %',b.critical_low using errcode='22023'; end if;
 if ch is not null and (hi is null or ch<=hi) then raise exception 'Upper Critical limit requires a safe maximum and must be above it: %',b.critical_high using errcode='22023'; end if;
 end loop;
end $$;

create or replace function public.craythrive_effective_classification(owner_id uuid,tank_id_value uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.craythrive_merge_classification(
 (select to_jsonb(s) from public.tank_threshold_settings s where s.user_id=owner_id and s.tank_id=tank_id_value),
 (select to_jsonb(s) from public.threshold_settings s where s.user_id=owner_id)); $$;
revoke all on function public.craythrive_effective_classification(uuid,uuid) from public,anon,authenticated;

create or replace function public.craythrive_validate_policy_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text; baseline jsonb; next_row jsonb; candidate record;
begin
 -- A legacy safe-only JSON replacement must not erase optional settings.
 if tg_op='UPDATE' then
 foreach k in array public.craythrive_policy_keys() loop
 if not coalesce(new.thresholds,'{}'::jsonb) ? k and old.thresholds ? k then
 new.thresholds=coalesce(new.thresholds,'{}'::jsonb)||jsonb_build_object(k,old.thresholds->k);
 end if; end loop; end if;
 foreach k in array public.craythrive_policy_keys() loop
 if new.thresholds ? k and new.thresholds->k<>'null' and public.craythrive_json_number(new.thresholds->k) is null then
 raise exception 'Invalid classification value: %',k using errcode='22023'; end if;
 end loop;
 next_row=to_jsonb(new);
 if tg_table_name='tank_threshold_settings' then
 select to_jsonb(s) into baseline from public.threshold_settings s where s.user_id=new.user_id;
 perform public.craythrive_validate_classification(public.craythrive_merge_classification(next_row,baseline));
 else
 perform public.craythrive_validate_classification(public.craythrive_merge_classification(null,next_row));
 for candidate in select to_jsonb(s) value from public.tank_threshold_settings s where s.user_id=new.user_id loop
 perform public.craythrive_validate_classification(public.craythrive_merge_classification(candidate.value,next_row));
 end loop;
 end if;
 return new;
end $$;
drop trigger if exists z_craythrive_validate_policy on public.tank_threshold_settings;
create trigger z_craythrive_validate_policy before insert or update on public.tank_threshold_settings for each row execute function public.craythrive_validate_policy_write();
drop trigger if exists z_craythrive_validate_policy on public.threshold_settings;
create trigger z_craythrive_validate_policy before insert or update on public.threshold_settings for each row execute function public.craythrive_validate_policy_write();

create or replace function public.configure_tank_classification(p_tank_id uuid,p_patch jsonb,p_scope text default 'single_tank') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid=auth.uid(); baseline jsonb; saved_row jsonb; k text; current_values jsonb; before_tanks jsonb='{}'; t record; after_values jsonb;
begin
 if actor is null or not exists(select 1 from public.tanks where id=p_tank_id and user_id=actor) then raise exception 'Tank ownership required' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('single_tank','account_defaults') or jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}' then raise exception 'Invalid configuration operation' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('craythrive:thresholds:'||actor::text,0));
 for k in select jsonb_object_keys(p_patch) loop
 if not k=any(public.craythrive_policy_keys()) or (p_patch->k<>'null' and (jsonb_typeof(p_patch->k)<>'number' or public.craythrive_json_number(p_patch->k) is null)) then raise exception 'Invalid classification value: %',k using errcode='22023'; end if;
 end loop;
 select to_jsonb(s) into baseline from public.threshold_settings s where s.user_id=actor for update;
 if p_scope='single_tank' then
 select to_jsonb(s) into saved_row from public.tank_threshold_settings s where s.user_id=actor and s.tank_id=p_tank_id for update;
 -- First per-tank row retains the inherited safe values, with only explicit policy overrides.
 current_values=public.craythrive_threshold_values(coalesce(saved_row,baseline));
 if saved_row is null then foreach k in array public.craythrive_policy_keys() loop current_values=current_values||jsonb_build_object(k,null); end loop; end if;
 current_values=current_values||p_patch;
 perform set_config('craythrive.threshold_source','manual',true);
 perform set_config('craythrive.threshold_scope','single_tank',true);
 insert into public.tank_threshold_settings(user_id,tank_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
 values(actor,p_tank_id,current_values,(current_values->>'temperatureMin')::numeric,(current_values->>'temperatureMax')::numeric,
 (current_values->>'phMin')::numeric,(current_values->>'phMax')::numeric,(current_values->>'turbidityMax')::numeric,(current_values->>'waterLevelMin')::numeric,(current_values->>'ammoniaMax')::numeric)
 on conflict(user_id,tank_id) do update set thresholds=excluded.thresholds,updated_at=now();
 else
 for t in select id from public.tanks where user_id=actor order by id for update loop
 before_tanks=before_tanks||jsonb_build_object(t.id::text,public.craythrive_effective_classification(actor,t.id)); end loop;
 current_values=public.craythrive_threshold_values(baseline)||p_patch;
 insert into public.threshold_settings(user_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
 values(actor,current_values,(current_values->>'temperatureMin')::numeric,(current_values->>'temperatureMax')::numeric,
 (current_values->>'phMin')::numeric,(current_values->>'phMax')::numeric,(current_values->>'turbidityMax')::numeric,(current_values->>'waterLevelMin')::numeric,(current_values->>'ammoniaMax')::numeric)
 on conflict(user_id) do update set thresholds=threshold_settings.thresholds||p_patch,updated_at=now();
 for t in select id from public.tanks where user_id=actor loop
 after_values=public.craythrive_effective_classification(actor,t.id);
 if before_tanks->t.id::text is distinct from after_values then
 insert into public.control_logs(user_id,tank_id,action_type,action_status,notes,metadata) values(actor,t.id,'threshold_updated','updated',
 'Account classification defaults changed for inherited fields.',jsonb_build_object('source','manual','scope','account_defaults','actor_user_id',actor,'old_values',before_tanks->t.id::text,'new_values',after_values));
 end if; end loop;
 end if;
 return public.craythrive_effective_classification(actor,p_tank_id);
end $$;
revoke all on function public.configure_tank_classification(uuid,jsonb,text) from public,anon;
grant execute on function public.configure_tank_classification(uuid,jsonb,text) to authenticated;

create or replace function public.craythrive_source_problem(row_value jsonb,param text) returns text
language plpgsql immutable set search_path=pg_catalog,public as $$
declare s text; payload jsonb=row_value->'raw_payload'; analog jsonb; water jsonb; health text;
begin
 s=upper(replace(replace(coalesce(case when param='water' then row_value->>'water_status'
 when param='ammonia' then coalesce(row_value->>'ammonia_status',row_value->>'status') else row_value->>(param||'_status') end,''),'_',' '),'-',' '));
 if s~'STALE' then return 'stale'; end if;
 if s~'ERROR|INVALID|UNKNOWN|WAITING|NO DATA|NO READING|N/A' then return 'invalid'; end if;
 analog=coalesce(payload->'analog_state',payload->'health'->'analog','{}');
 water=coalesce(payload->'water_state',payload->'health'->'water','{}');
 health=upper(payload->'sensor_health'->(case when param='water' then 'water_level' else param end)->>'health');
 if health~'ERROR|INVALID|UNKNOWN' then return 'invalid'; end if;
 if param='water' and (water->'fresh'='false' or water->'last_good_used'='true') then return 'stale'; end if;
 if param in ('ph','turbidity') and (analog->(param||'_fresh')='false' or analog->(param||'_last_good_used')='true') then return 'stale'; end if;
 return null;
end $$;

create or replace function public.craythrive_classify_parameter(param text,value numeric,t jsonb,
 source_problem text default null,reading_at timestamptz default null,server_at timestamptz default now(),paired boolean default true) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare b record; lo numeric; hi numeric; cl numeric; ch numeric; direction text; severity text='normal'; boundary numeric; age_limit numeric;
begin
 if value is null then return jsonb_build_object('severity','missing'); end if;
 if param<>'ammonia' and not paired then return jsonb_build_object('severity','unpaired'); end if;
 if source_problem in ('stale','invalid') then return jsonb_build_object('severity',source_problem); end if;
 if value::text in ('NaN','Infinity','-Infinity') or (param in ('water','turbidity','ammonia') and value<0) then return jsonb_build_object('severity','invalid'); end if;
 if reading_at is null or reading_at>server_at then return jsonb_build_object('severity','invalid'); end if;
 age_limit=public.craythrive_json_number(t->(param||'MaxAgeSeconds'));
 if age_limit is not null and extract(epoch from server_at-reading_at)>age_limit then return jsonb_build_object('severity','stale'); end if;
 select * into b from (values
 ('temperature','temperatureMin','temperatureMax','temperatureCriticalMin','temperatureCriticalMax'),
 ('ph','phMin','phMax','phCriticalMin','phCriticalMax'),('water','waterLevelMin','waterLevelMax','waterCriticalMin','waterCriticalMax'),
 ('turbidity','turbidityMax',null,'turbidityCriticalMinV',null),('ammonia',null,'ammoniaMax',null,'ammoniaCriticalMax')) x(parameter,low_key,high_key,critical_low,critical_high) where parameter=param;
 if not found then return jsonb_build_object('severity','invalid'); end if;
 begin perform public.craythrive_validate_classification(t);
 exception when sqlstate '22023' then return jsonb_build_object('severity','configuration'); end;
 lo=public.craythrive_json_number(t->b.low_key); hi=public.craythrive_json_number(t->b.high_key);
 cl=public.craythrive_json_number(t->b.critical_low); ch=public.craythrive_json_number(t->b.critical_high);
 direction=case when lo is not null and value<lo then 'low' when hi is not null and value>hi then 'high' else null end;
 if direction is not null then
 boundary=case when direction='low' then cl else ch end;
 severity=case when boundary is null then 'configuration' when direction='low' and value<=boundary or direction='high' and value>=boundary then 'critical' else 'warning' end;
 elsif age_limit is null then severity='unverified'; end if;
 return jsonb_build_object('severity',severity,'direction',direction,'boundary',boundary,'recency_verified',age_limit is not null);
end $$;

-- Active incidents may update their current state. Immutable control events
-- retain each transition's original severity, reading, limits and server time.
create or replace function public.craythrive_reconcile_classification_internal(owner_id uuid,tank_id_value uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t jsonb; sr jsonb; ar jsonb; item record; row_value jsonb; value numeric; stamp timestamptz; computed jsonb;
 state text; direction text; previous_state text; previous_direction text; reason text; event_id uuid; incident public.alerts; recent_notice public.alerts;
metadata_value jsonb; paired_value boolean; problem text; fault public.alerts;
sensor_count bigint; sensor_uid text; sensor_id uuid;
begin
 if not exists(select 1 from public.tanks where id=tank_id_value and user_id=owner_id) then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('craythrive:classification:'||tank_id_value::text,0));
 t=public.craythrive_effective_classification(owner_id,tank_id_value);
 select count(*),min(device_uid),(array_agg(id))[1] into sensor_count,sensor_uid,sensor_id
 from public.iot_devices where user_id=owner_id and tank_id=tank_id_value and is_claimed=true
 and coalesce(device_type,'')||' '||coalesce(device_uid,'') ~* 'sensor|monitor'
 and coalesce(device_type,'')||' '||coalesce(device_uid,'') !~* 'actuator|pump|relay|feeder|cam';
 if sensor_count=1 and sensor_uid is not null then
 select to_jsonb(s) into sr from public.sensor_readings s where s.user_id=owner_id and s.tank_id=tank_id_value and s.device_uid=sensor_uid
 and (to_jsonb(s)->>'iot_device_id' is null or to_jsonb(s)->>'iot_device_id'=sensor_id::text)
 order by created_at desc,id desc limit 1;
 end if;
 select to_jsonb(a) into ar from public.ammonia_readings a where a.user_id=owner_id and a.tank_id=tank_id_value order by created_at desc,id desc limit 1;
 select exists(select 1 from public.iot_devices d where d.user_id=owner_id and d.tank_id=tank_id_value and d.is_claimed=true
  and coalesce(d.device_type,'')||' '||coalesce(d.device_uid,'') !~* 'cam|camera') into paired_value;
 for item in select * from (values ('temperature','temperature_c','temperature','°C'),('ph','ph_value','ph',''),
 ('water','water_depth_cm','water_level','cm'),('turbidity','turbidity_voltage','turbidity','V'),('ammonia','ammonia_level','ammonia_mg_l','ppm')) x(param,primary_key,alias_key,unit) loop
 row_value=case when item.param='ammonia' then ar else sr end;
 if row_value is null then continue; end if;
 value=case when row_value ? item.primary_key then public.craythrive_json_number(row_value->item.primary_key)
  else public.craythrive_json_number(row_value->item.alias_key) end;
 stamp=(row_value->>'created_at')::timestamptz; problem=public.craythrive_source_problem(row_value,item.param);
 computed=public.craythrive_classify_parameter(item.param,value,t,problem,stamp,now(),paired_value);
 state=computed->>'severity'; direction=coalesce(computed->>'direction','unknown');
 reason=case when state='configuration' then 'Outside safe range or conflicting settings; verified Critical limit requires configuration.'
  when state='critical' then 'Reached the configured Critical boundary in the unsafe direction.'
  when state='warning' then 'Outside configured safe range; Critical boundary has not been reached.'
  when state='normal' then 'Within configured safe range and reading-age policy.'
  else 'Current condition cannot be established: '||state||'.' end;
 metadata_value=jsonb_build_object('policy','configured-v1','parameter',item.param,'reading_value',value,'unit',item.unit,
  'reading_id',row_value->'id','reading_timestamp',stamp,'threshold_snapshot',t,'trigger_value',computed->'boundary',
  'classification',state,'direction',direction,'reason',reason,'recency_verified',computed->'recency_verified',
  'severity',case when state='critical' then 'critical' when state in ('warning','configuration') then 'warning' else 'info' end);
 select c.metadata->>'classification',c.metadata->>'direction' into previous_state,previous_direction from public.control_logs c where c.user_id=owner_id and c.tank_id=tank_id_value
  and c.metadata->>'policy'='configured-v1' and c.metadata->>'parameter'=item.param order by c.created_at desc,c.id desc limit 1;
 event_id=null;
 if previous_state is distinct from state or previous_direction is distinct from direction then
 insert into public.control_logs(user_id,tank_id,action_type,action_status,notes,metadata)
 values(owner_id,tank_id_value,case when state='normal' and exists(select 1 from public.alerts a where a.user_id=owner_id and a.tank_id=tank_id_value and a.status='active' and a.metadata->>'policy'='configured-v1' and a.metadata->>'parameter'=item.param) then 'sensor_recovery' else 'sensor_'||state end,
 'recorded',reason,metadata_value) returning id into event_id;
 end if;
 -- Operational faults stay distinct from water-condition severity.
 select * into fault from public.alerts a where a.user_id=owner_id and a.tank_id=tank_id_value and a.status='active'
  and a.metadata->>'policy'='configured-v1-fault' and a.metadata->>'parameter'=item.param order by created_at desc limit 1;
 if problem='invalid' and fault.id is null then
 perform public.create_alert_if_enabled(owner_id,tank_id_value,'tank_alerts','sensor_fault',item.param||' sensor fault',
 'The source reports an invalid measurement. This is an operational fault; water-condition severity is unknown.','critical',
 metadata_value||jsonb_build_object('policy','configured-v1-fault','control_log_id',event_id));
 elsif state='normal' and fault.id is not null then update public.alerts set status='resolved',resolved_at=now() where id=fault.id; end if;
 if state='normal' then
 update public.alerts set status='resolved',resolved_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution','valid_current_safe_reading','recovery_control_log_id',event_id)
 where user_id=owner_id and tank_id=tank_id_value and status='active' and metadata->>'policy'='configured-v1' and metadata->>'parameter'=item.param;
 continue;
 end if;
 -- Unknown/stale/unpaired data never resolves an unsafe incident.
 if state not in ('warning','critical','configuration') or computed->>'direction' is null then continue; end if;
 if event_id is not null then metadata_value=metadata_value||jsonb_build_object('control_log_id',event_id); end if;
 update public.alerts set status='resolved',resolved_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution','unsafe_direction_changed')
 where user_id=owner_id and tank_id=tank_id_value and status='active' and metadata->>'policy'='configured-v1' and metadata->>'parameter'=item.param and metadata->>'direction'<>direction;
 select * into incident from public.alerts a where a.user_id=owner_id and a.tank_id=tank_id_value and a.status='active'
  and a.metadata->>'policy'='configured-v1' and a.metadata->>'parameter'=item.param and a.metadata->>'direction'=direction order by created_at desc limit 1;
 select * into recent_notice from public.alerts a where a.user_id=owner_id and a.tank_id=tank_id_value and a.created_at>=now()-interval '1 hour'
  and a.metadata->>'policy'='configured-v1' and a.metadata->>'parameter'=item.param and a.metadata->>'direction'=direction
  and (state<>'critical' or a.metadata->>'notified_severity'='critical') order by created_at desc limit 1;
 if incident.id is not null and (state<>'critical' or incident.severity='critical' or recent_notice.id is not null) then
 update public.alerts set severity=metadata_value->>'severity',title=item.param||': '||state,message=reason||' Saved value: '||value||' '||item.unit||'. Reading time: '||stamp::text,
 metadata=coalesce(metadata,'{}')||metadata_value||jsonb_build_object('notified_severity',incident.metadata->>'notified_severity')
 where id=incident.id;
 elsif recent_notice.id is null then
 if incident.id is not null then update public.alerts set status='resolved',resolved_at=now(),metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution','critical_escalation') where id=incident.id; end if;
 perform public.create_alert_if_enabled(owner_id,tank_id_value,'tank_alerts','sensor_reading',item.param||': '||state,
 reason||' Saved value: '||value||' '||item.unit||'. Reading time: '||stamp::text,metadata_value->>'severity',
 metadata_value||jsonb_build_object('notified_severity',state));
 end if;
 end loop;
end $$;
revoke all on function public.craythrive_reconcile_classification_internal(uuid,uuid) from public,anon,authenticated;

create or replace function public.reconcile_tank_classification(p_tank_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid=auth.uid();
begin
 if actor is null or not exists(select 1 from public.tanks where id=p_tank_id and user_id=actor) then raise exception 'Tank ownership required' using errcode='42501'; end if;
 perform public.craythrive_reconcile_classification_internal(actor,p_tank_id);
 return jsonb_build_object('policy','configured-v1');
end $$;
revoke all on function public.reconcile_tank_classification(uuid) from public,anon;
grant execute on function public.reconcile_tank_classification(uuid) to authenticated;

-- Replace only notification producers; raw uploaded statuses/values stay intact.
create or replace function public.create_alert_from_sensor_reading() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.craythrive_reconcile_classification_internal(new.user_id,new.tank_id); return new; end $$;
create or replace function public.create_alert_from_ammonia_reading() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.craythrive_reconcile_classification_internal(new.user_id,new.tank_id); return new; end $$;

create or replace function public.craythrive_reconcile_threshold_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t record;
begin
 if tg_table_name='tank_threshold_settings' then perform public.craythrive_reconcile_classification_internal(new.user_id,new.tank_id);
 else for t in select id from public.tanks where user_id=new.user_id loop perform public.craythrive_reconcile_classification_internal(new.user_id,t.id); end loop; end if;
 return new;
end $$;
drop trigger if exists zz_craythrive_reconcile on public.tank_threshold_settings;
create trigger zz_craythrive_reconcile after insert or update of thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max
 on public.tank_threshold_settings for each row execute function public.craythrive_reconcile_threshold_change();
drop trigger if exists zz_craythrive_reconcile on public.threshold_settings;
create trigger zz_craythrive_reconcile after insert or update of thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max
 on public.threshold_settings for each row execute function public.craythrive_reconcile_threshold_change();

create index if not exists craythrive_classification_events_idx on public.control_logs(user_id,tank_id,created_at desc)
 where metadata->>'policy'='configured-v1';
create unique index if not exists craythrive_classification_incident_idx on public.alerts(user_id,tank_id,(metadata->>'parameter'),(metadata->>'direction'))
 where status='active' and metadata->>'policy'='configured-v1';

-- Older APK/web clients may still attempt their derived water-condition alerts.
-- Only the server policy produces these types after rollout. Keep operational
-- fault notifications distinct; pump/feed/marketplace producers are unaffected.
create or replace function public.craythrive_condition_alert_gate() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.type in ('sensor_reading','ammonia_reading') then
 if current_user in ('authenticated','anon') then return null; end if;
 if coalesce(new.metadata->>'policy','')<>'configured-v1' and coalesce(new.title,'') !~* 'sensor (error|fault)' then return null; end if;
 end if;
 return new;
end $$;
drop trigger if exists craythrive_condition_alert_gate on public.alerts;
create trigger craythrive_condition_alert_gate before insert on public.alerts for each row execute function public.craythrive_condition_alert_gate();

-- Compatibility definition of apply_tank_thresholds is appended below, then COMMIT.

CREATE OR REPLACE FUNCTION public.apply_tank_thresholds(p_tank_id uuid, p_patch jsonb, p_scope text DEFAULT 'single_tank'::text, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE actor uuid=auth.uid(); target record; selected_row public.tank_threshold_settings; saved public.tank_threshold_settings;
 baseline jsonb; current_values jsonb; next_values jsonb; patch jsonb=p_patch; key text; canonical_key text; normalized_patch jsonb='{}';
 result jsonb='[]'; affected integer=0; changed integer=0;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_source IS NULL OR p_scope NOT IN ('single_tank','all_tanks') OR p_source NOT IN ('manual','ai_recommendation') THEN RAISE EXCEPTION 'Invalid threshold operation'; END IF;
 -- Serialize this owner's changes, including first inserts and apply-all.
 PERFORM pg_advisory_xact_lock(hashtextextended('craythrive:thresholds:'||actor::text,0));
 PERFORM 1 FROM public.tanks WHERE id=p_tank_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tank ownership required' USING ERRCODE='42501'; END IF;
 SELECT * INTO selected_row FROM public.tank_threshold_settings WHERE user_id=actor AND tank_id=p_tank_id FOR UPDATE;
 IF p_source='ai_recommendation' AND (patch IS NULL OR patch='{}'::jsonb) THEN
  IF selected_row.pending_ai_suggestion IS NULL THEN RAISE EXCEPTION 'No pending AI recommendation for this tank'; END IF;
  patch=public.craythrive_ai_threshold_patch(selected_row.pending_ai_suggestion);
 END IF;
 IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch='{}' THEN RAISE EXCEPTION 'No threshold changes supplied'; END IF;
 -- Explicit patches are supported for recommendation-only mobile clients.
 -- Legacy web clients may still accept a stored pending recommendation above.
 FOR key IN SELECT jsonb_object_keys(patch) LOOP
  canonical_key=CASE key
   WHEN 'temperature_min' THEN 'temperatureMin' WHEN 'temperature_max' THEN 'temperatureMax'
   WHEN 'ph_min' THEN 'phMin' WHEN 'ph_max' THEN 'phMax' WHEN 'turbidity_max' THEN 'turbidityMax'
   WHEN 'water_level_min' THEN 'waterLevelMin' WHEN 'ammonia_max' THEN 'ammoniaMax' ELSE key END;
  IF canonical_key NOT IN ('temperatureMin','temperatureMax','phMin','phMax','turbidityMax','waterLevelMin','ammoniaMax')
     OR jsonb_typeof(patch->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid threshold value: %',key; END IF;
  IF normalized_patch ? canonical_key AND normalized_patch->canonical_key IS DISTINCT FROM patch->key THEN
   RAISE EXCEPTION 'Conflicting threshold aliases: %',key;
  END IF;
  normalized_patch=normalized_patch||jsonb_build_object(canonical_key,patch->key);
 END LOOP;
 patch=normalized_patch;
 SELECT to_jsonb(s) INTO baseline FROM public.threshold_settings s WHERE user_id=actor;
 PERFORM set_config('craythrive.threshold_source',p_source,true);
 PERFORM set_config('craythrive.threshold_scope',p_scope,true);
 FOR target IN SELECT id FROM public.tanks WHERE user_id=actor AND (p_scope='all_tanks' OR id=p_tank_id) ORDER BY id FOR UPDATE LOOP
  SELECT * INTO saved FROM public.tank_threshold_settings WHERE user_id=actor AND tank_id=target.id FOR UPDATE;
  current_values=public.craythrive_threshold_values(CASE WHEN saved.id IS NULL THEN baseline ELSE to_jsonb(saved) END);
  -- First safe-only Apply must keep policy fields inherited, not copy them as overrides.
  IF saved.id IS NULL THEN
   FOREACH key IN ARRAY public.craythrive_policy_keys() LOOP current_values=current_values||jsonb_build_object(key,null); END LOOP;
  END IF;
  next_values=current_values||patch;
  IF (next_values->>'temperatureMin')::numeric NOT BETWEEN 10 AND 40 OR (next_values->>'temperatureMax')::numeric NOT BETWEEN 10 AND 40
   OR (next_values->>'temperatureMin')::numeric >= (next_values->>'temperatureMax')::numeric
   OR (next_values->>'phMin')::numeric < 0 OR (next_values->>'phMax')::numeric > 14
   OR (next_values->>'phMin')::numeric >= (next_values->>'phMax')::numeric
   OR (next_values->>'turbidityMax')::numeric NOT BETWEEN 0 AND 5
   OR (next_values->>'waterLevelMin')::numeric NOT BETWEEN 0 AND 20
   OR (next_values->>'ammoniaMax')::numeric NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'Threshold values are outside supported limits'; END IF;
  IF next_values IS DISTINCT FROM current_values THEN changed=changed+1; END IF;
  INSERT INTO public.tank_threshold_settings(user_id,tank_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
  VALUES(actor,target.id,next_values,(next_values->>'temperatureMin')::numeric,(next_values->>'temperatureMax')::numeric,
   (next_values->>'phMin')::numeric,(next_values->>'phMax')::numeric,(next_values->>'turbidityMax')::numeric,
   (next_values->>'waterLevelMin')::numeric,(next_values->>'ammoniaMax')::numeric)
  ON CONFLICT (user_id,tank_id) DO UPDATE SET thresholds=excluded.thresholds,temperature_min=excluded.temperature_min,
   temperature_max=excluded.temperature_max,ph_min=excluded.ph_min,ph_max=excluded.ph_max,turbidity_max=excluded.turbidity_max,
   water_level_min=excluded.water_level_min,ammonia_max=excluded.ammonia_max,updated_at=now()
  RETURNING * INTO saved;
  result=result||jsonb_build_array(to_jsonb(saved)); affected=affected+1;
 END LOOP;
 -- Synchronize the account-wide baseline only for an explicit Apply All.
 -- Do this AFTER tank writes so insert audits compare with the old fallback.
 -- Preserve legacy identity, creation time and pending metadata; bump the
 -- update timestamp only when effective legacy values actually change.
 IF p_scope='all_tanks' THEN
  -- Mirror only the accepted patch, preserving unrelated legacy values.
  next_values=public.craythrive_threshold_values(baseline)||patch;
  IF (next_values->>'temperatureMin')::numeric NOT BETWEEN 10 AND 40 OR (next_values->>'temperatureMax')::numeric NOT BETWEEN 10 AND 40
   OR (next_values->>'temperatureMin')::numeric >= (next_values->>'temperatureMax')::numeric
   OR (next_values->>'phMin')::numeric < 0 OR (next_values->>'phMax')::numeric > 14
   OR (next_values->>'phMin')::numeric >= (next_values->>'phMax')::numeric
   OR (next_values->>'turbidityMax')::numeric NOT BETWEEN 0 AND 5
   OR (next_values->>'waterLevelMin')::numeric NOT BETWEEN 0 AND 20
   OR (next_values->>'ammoniaMax')::numeric NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'Threshold values are outside supported limits'; END IF;
  INSERT INTO public.threshold_settings(user_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
  VALUES(actor,next_values,(next_values->>'temperatureMin')::numeric,(next_values->>'temperatureMax')::numeric,
   (next_values->>'phMin')::numeric,(next_values->>'phMax')::numeric,(next_values->>'turbidityMax')::numeric,
   (next_values->>'waterLevelMin')::numeric,(next_values->>'ammoniaMax')::numeric)
  ON CONFLICT (user_id) DO UPDATE SET thresholds=threshold_settings.thresholds||excluded.thresholds,temperature_min=excluded.temperature_min,
   temperature_max=excluded.temperature_max,ph_min=excluded.ph_min,ph_max=excluded.ph_max,turbidity_max=excluded.turbidity_max,
   water_level_min=excluded.water_level_min,ammonia_max=excluded.ammonia_max,
   updated_at=CASE WHEN public.craythrive_threshold_values(to_jsonb(threshold_settings)) IS DISTINCT FROM next_values
    THEN now() ELSE threshold_settings.updated_at END;
 END IF;
 IF p_source='ai_recommendation' THEN
  UPDATE public.tank_threshold_settings SET pending_ai_suggestion=NULL,pending_ai_suggested_at=NULL WHERE user_id=actor AND tank_id=p_tank_id;
 END IF;
 PERFORM set_config('craythrive.threshold_source','',true);
 PERFORM set_config('craythrive.threshold_scope','',true);
 RETURN jsonb_build_object('affected',affected,'changed',changed,'rows',result);
END $function$
;


create or replace function public.craythrive_audit_threshold_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare baseline jsonb; before_values jsonb; after_values jsonb; old_overrides jsonb; new_overrides jsonb; source_value text; scope_value text;
begin
 if new.tank_id is not null and not exists(select 1 from public.tanks where id=new.tank_id and user_id=new.user_id) then raise exception 'Tank ownership required' using errcode='42501'; end if;
 if tg_op='UPDATE' and (old.user_id is distinct from new.user_id or old.tank_id is distinct from new.tank_id) then raise exception 'Threshold identity cannot be changed' using errcode='42501'; end if;
 if new.tank_id is null or auth.uid() is null then return new; end if;
 select to_jsonb(s) into baseline from public.threshold_settings s where s.user_id=new.user_id;
 before_values=public.craythrive_merge_classification(case when tg_op='UPDATE' then to_jsonb(old) else null end,baseline);
 after_values=public.craythrive_merge_classification(to_jsonb(new),baseline);
 old_overrides=public.craythrive_policy_values(case when tg_op='UPDATE' then to_jsonb(old) else null end);
 new_overrides=public.craythrive_policy_values(to_jsonb(new));
 if before_values=after_values and old_overrides=new_overrides then return new; end if;
 source_value=case when current_setting('craythrive.threshold_source',true)='ai_recommendation' then 'ai_recommendation' else 'manual' end;
 scope_value=case when current_setting('craythrive.threshold_scope',true)='all_tanks' then 'all_tanks' else 'single_tank' end;
 insert into public.control_logs(user_id,tank_id,action_type,action_status,notes,metadata) values(new.user_id,new.tank_id,'threshold_updated','updated',
 case when source_value='ai_recommendation' then 'AI safe-range suggestion accepted by the user.' else 'User changed threshold settings.' end,
 jsonb_build_object('source',source_value,'scope',scope_value,'actor_user_id',auth.uid(),'old_values',before_values,'new_values',after_values,'old_overrides',old_overrides,'new_overrides',new_overrides));
 return new;
end $$;
commit;
