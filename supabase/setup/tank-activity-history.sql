-- REVIEW REQUIRED: Fix #6 additive read endpoint and authenticated read guards.
-- Not applied by the agent. No event inserts, hardware changes or backfill.
begin;

create or replace function public.craythrive_tank_activity_history(
 p_tank_id uuid, p_start timestamptz, p_end timestamptz, p_limit integer default 100
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public
as $function$
declare
 actor uuid := auth.uid(); tank_name text; result jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select t.tank_name into tank_name from public.tanks t where t.id=p_tank_id and t.user_id=actor;
 if not found then raise exception 'Tank unavailable' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '31 days'
   or p_limit is null or p_limit<1 or p_limit>500 then
   raise exception 'Choose a valid activity window (up to 31 days) and limit (1-500)' using errcode='22023';
 end if;
 select jsonb_build_object(
  'tank', jsonb_build_object('id',p_tank_id,'tank_name',tank_name),
  'sources', jsonb_build_object(
   'control_logs', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
    select c.id,c.user_id,c.tank_id,c.action_type,c.action_status,c.notes,c.created_at,
     jsonb_strip_nulls(jsonb_build_object('source',c.metadata->'source','scope',c.metadata->'scope',
      'old_values',c.metadata->'old_values','new_values',c.metadata->'new_values',
      'command_id',c.metadata->'command_id','parameter',c.metadata->'parameter',
      'reading_value',c.metadata->'reading_value','unit',c.metadata->'unit',
      'threshold_snapshot',c.metadata->'threshold_snapshot','trigger_value',c.metadata->'trigger_value',
      'recommendation',c.metadata->'recommendation','severity',c.metadata->'severity',
      'classification',c.metadata->'classification','reading_timestamp',c.metadata->'reading_timestamp')) as metadata
    from public.control_logs c where c.user_id=actor and c.tank_id=p_tank_id
     and c.created_at>=p_start and c.created_at<p_end order by c.created_at desc,c.id limit p_limit
   ) r),'[]'::jsonb),
   'device_commands', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
    select c.id,c.user_id,c.tank_id,c.command_type,c.command_value,c.command_status,c.status,
     c.result_message,c.created_at,c.executed_at,c.updated_at
    from public.device_commands c where c.user_id=actor and c.tank_id=p_tank_id::text
     and c.created_at>=p_start and c.created_at<p_end order by c.created_at desc,c.id limit p_limit
   ) r),'[]'::jsonb),
   'tank_automation_logs', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
    select c.id,actor as user_id,c.tank_id,c.action_type,c.action_status,c.reason,c.water_status,c.ph_status,
     c.turbidity_status,c.ammonia_status,c.temperature_status,c.stable_reading_count,c.created_at
    from public.tank_automation_logs c where (c.user_id=actor or c.user_id is null) and c.tank_id=p_tank_id
     and c.created_at>=p_start and c.created_at<p_end order by c.created_at desc,c.id limit p_limit
   ) r),'[]'::jsonb),
   'alerts', coalesce((select jsonb_agg(to_jsonb(r) order by greatest(r.created_at,r.resolved_at) desc,r.id) from (
    select a.id,a.user_id,a.tank_id,a.type,a.title,a.message,a.severity,a.status,a.command_id,a.created_at,a.resolved_at,
     jsonb_strip_nulls(jsonb_build_object('control_log_id',a.metadata->'control_log_id',
      'ammonia_reading_id',a.metadata->'ammonia_reading_id','parameter',a.metadata->'parameter',
      'reading_value',a.metadata->'reading_value','unit',a.metadata->'unit',
      'threshold_snapshot',a.metadata->'threshold_snapshot','trigger_value',a.metadata->'trigger_value',
      'recommendation',a.metadata->'recommendation','event_type',a.metadata->'event_type',
      'classification',a.metadata->'classification','reading_timestamp',a.metadata->'reading_timestamp',
      'command_type',a.metadata->'command_type','action_type',a.metadata->'action_type')) as metadata
    from public.alerts a where a.user_id=actor and a.tank_id=p_tank_id
     and ((a.created_at>=p_start and a.created_at<p_end) or (a.resolved_at>=p_start and a.resolved_at<p_end))
    order by greatest(a.created_at,a.resolved_at) desc,a.id limit p_limit
   ) r),'[]'::jsonb),
   'ammonia_readings', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
    select a.id,a.user_id,a.tank_id,a.ammonia_level,a.ammonia_mg_l,a.ammonia_status,a.status,a.message,a.chart_label,a.created_at
    from public.ammonia_readings a where a.user_id=actor and a.tank_id=p_tank_id
     and a.created_at>=p_start and a.created_at<p_end order by a.created_at desc,a.id limit p_limit
   ) r),'[]'::jsonb)
  ), 'limit_per_source',p_limit,'time_basis','created_at'
 ) into result;
 return result;
end;
$function$;
revoke all on function public.craythrive_tank_activity_history(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.craythrive_tank_activity_history(uuid,timestamptz,timestamptz,integer) to authenticated;

-- Existing permissive SELECT policies OR together. RESTRICTIVE guards close
-- authenticated cross-owner reads without altering the legacy anon device role.
-- Review device authentication separately: these guards do NOT secure anon
-- command access or the existing RLS-disabled automation tables.
drop policy if exists craythrive_control_history_owner on public.control_logs;
create policy craythrive_control_history_owner on public.control_logs as restrictive for select to authenticated
 using (user_id=auth.uid() and exists(select 1 from public.tanks t where t.id=control_logs.tank_id and t.user_id=auth.uid()));
drop policy if exists craythrive_command_history_owner on public.device_commands;
create policy craythrive_command_history_owner on public.device_commands as restrictive for select to authenticated
 using (user_id=auth.uid() and exists(select 1 from public.tanks t where t.id::text=device_commands.tank_id and t.user_id=auth.uid()));

create index if not exists craythrive_activity_controls_idx on public.control_logs(user_id,tank_id,created_at desc,id);
create index if not exists craythrive_activity_commands_idx on public.device_commands(user_id,tank_id,created_at desc,id);
create index if not exists craythrive_activity_automation_idx on public.tank_automation_logs(tank_id,created_at desc,id);
create index if not exists craythrive_activity_alerts_idx on public.alerts(user_id,tank_id,created_at desc,id);
create index if not exists craythrive_activity_scans_idx on public.ammonia_readings(user_id,tank_id,created_at desc,id);
commit;
