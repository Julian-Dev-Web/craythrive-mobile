-- Wording only: no command execution, threshold, schema column, or history changes.
begin;

create or replace function public.craythrive_pump_action_wording(record jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog
as $function$
declare
  metadata jsonb := coalesce(record->'metadata', '{}'::jsonb);
  action text;
  kind text;
  execution_status text;
  title text := coalesce(record->>'title', '');
  label text;
  action_label text;
  message text;
  candidate text;
  source jsonb;
  field text;
  actual_seconds numeric;
  duration_text text;
begin
  foreach candidate in array array[record->>'command_type', record->>'action_type', metadata->>'command_type', metadata->>'action_type'] loop
    candidate := regexp_replace(lower(btrim(candidate)), '[[:space:]-]+', '_', 'g');
    if candidate in ('drain','drain_for','drain_water','drain_pump','pump_drain','refill','refill_for','fill','fill_water','add_water','refill_pump','pump_refill') then
      action := candidate;
      exit;
    end if;
  end loop;
  if action is not null then
    kind := case when action like '%drain%' then 'drain' else 'refill' end;
  elsif title ~* '^drain( water)?\M' then kind := 'drain';
  elsif title ~* '^(refill|add water)\M' then kind := 'refill';
  else return null;
  end if;

  foreach candidate in array array[record->>'command_status', record->>'action_status', metadata->>'command_status', metadata->>'action_status', case when action is not null then record->>'status' end] loop
    candidate := lower(btrim(candidate));
    if candidate in ('done','completed','success','succeeded','failed','error','rejected','blocked','cancelled','canceled','pending','queued','running','executing') then
      execution_status := candidate;
      exit;
    end if;
  end loop;
  execution_status := coalesce(execution_status, case
    when title ~* 'rejected|blocked' then 'rejected'
    when title ~* 'failed|failure' then 'failed'
    when title ~* 'cancelled|canceled' then 'cancelled'
    when title ~* 'completed|\mdone\M' then 'done'
    else 'recorded' end);
  label := case when kind = 'drain' then 'Drain' else 'Add Water' end;
  action_label := case when kind = 'drain' then 'drain' else 'refill' end;
  if execution_status in ('rejected','blocked') then
    execution_status := 'rejected';
    message := 'The ' || action_label || ' action was blocked by a safety rule.';
  elsif execution_status in ('failed','error') then
    execution_status := 'failed';
    message := 'The ' || action_label || ' action could not be completed.';
  elsif execution_status in ('done','completed','success','succeeded') then
    execution_status := 'completed';
    message := 'The ' || action_label || ' pump was activated.';
    if kind = 'refill' then
      foreach source in array array[record, metadata] loop
        foreach field in array array['actual_duration_ms', 'actual_duration_seconds'] loop
          candidate := source->>field;
          -- Explicit actual runtime only. Never substitute requested duration_ms.
          if candidate ~ '^[+]?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$' and candidate::numeric > 0 then
            actual_seconds := candidate::numeric / case when field = 'actual_duration_ms' then 1000 else 1 end;
            exit;
          end if;
        end loop;
        exit when actual_seconds is not null;
      end loop;
      if actual_seconds is not null then
        if actual_seconds < 0.001 then
          duration_text := trim_scale(actual_seconds * 1000)::text || ' milliseconds';
        else
          duration_text := trim_scale(round(actual_seconds, 3))::text || case when round(actual_seconds, 3) = 1 then ' second' else ' seconds' end;
        end if;
        message := 'The refill pump ran for ' || duration_text || '.';
      end if;
    end if;
  else
    message := 'The ' || action_label || ' action is ' || execution_status || '.';
  end if;
  return jsonb_build_object('title', label || ' ' || execution_status, 'message', message);
end;
$function$;

revoke all on function public.craythrive_pump_action_wording(jsonb) from public, anon, authenticated;

-- Existing generators follow. Their status guards, deduplication, recipients,
-- severities and non-water actions are retained from the audited live definitions.

CREATE OR REPLACE FUNCTION public.create_actuator_alert_from_command()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  alert_title text;
  alert_message text;
  alert_severity text;
  command_label text;
  safe_user_id uuid;
  safe_tank_id uuid;
  pump_wording jsonb;
begin
  -- Only final statuses should create user alerts.
  if new.command_status not in ('done', 'rejected', 'failed') then
    return new;
  end if;

  -- Avoid duplicate when same status is updated again.
  if old.command_status = new.command_status then
    return new;
  end if;

  -- Safely cast user_id/tank_id to UUID only if valid UUID text.
  if new.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    safe_user_id := new.user_id::uuid;
  else
    safe_user_id := null;
  end if;

  if new.tank_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    safe_tank_id := new.tank_id::uuid;
  else
    safe_tank_id := null;
  end if;

  -- Avoid duplicate alert for the same command.
  if exists (
    select 1
    from public.alerts
    where command_id = new.id
  ) then
    return new;
  end if;

  command_label :=
    case new.command_type
      when 'FEED_ONCE' then 'Feed'
      when 'DRAIN_FOR' then 'Drain'
      when 'REFILL_FOR' then 'Refill'
      when 'STOP_ALL' then 'Stop All'
      else coalesce(new.command_type, 'Command')
    end;


  if new.command_status = 'done' then
    alert_severity := 'normal';

    alert_title :=
      case new.command_type
        when 'FEED_ONCE' then 'Feeding completed'
        when 'DRAIN_FOR' then 'Drain completed'
        when 'REFILL_FOR' then 'Add Water completed'
        when 'STOP_ALL' then 'Actuators stopped'
        else command_label || ' completed'
      end;

    alert_message :=
      case new.command_type
        when 'FEED_ONCE' then 'The feeder ran one safe feeding cycle.'
        when 'DRAIN_FOR' then 'The drain pump was activated.'
        when 'REFILL_FOR' then 'The refill pump was activated.'
        when 'STOP_ALL' then 'All pump and feeder actuators were stopped.'
        else 'The actuator command was completed.'
      end;

  elsif new.command_status = 'rejected' then
    alert_severity := 'warning';
    alert_title := command_label || ' blocked by safety check';
    alert_message := 'The command was blocked by CrayThrive safety rules. View logs for details.';

  else
    alert_severity := 'critical';
    alert_title := command_label || ' command failed';
    alert_message := 'The actuator command failed. Check ESP32 power, WiFi, or wiring.';
  end if;

  pump_wording := public.craythrive_pump_action_wording(to_jsonb(new));
  if pump_wording is not null then
    alert_title := pump_wording->>'title';
    alert_message := pump_wording->>'message';
  end if;

  insert into public.alerts (
    user_id,
    tank_id,
    device_uid,
    type,
    title,
    message,
    severity,
    source,
    command_id,
    metadata,
    created_at
  )
  values (
    safe_user_id,
    safe_tank_id,
    new.device_uid::text,
    'actuator_command',
    alert_title,
    alert_message,
    alert_severity,
    'device_commands',
    new.id,
    jsonb_build_object('command_type', new.command_type, 'command_status', new.command_status, 'duration_ms', new.duration_ms),
    now()
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_alert_from_control_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  action_text text;
  category text;
  alert_title text;
  alert_message text;
  pump_wording jsonb;
begin
  action_text := lower(coalesce(new.action_type, ''));

  category := null;
  alert_title := null;
  alert_message := null;

  if action_text like '%feed%' then
    category := 'feeding_alerts';
    alert_title := 'Feeding action recorded';
    alert_message := 'A feeding action was logged for this tank.';

  elsif action_text like '%pump%' then
    category := 'pump_alerts';
    alert_title := 'Pump action recorded';
    alert_message := 'A pump control action was logged for this tank.';

  elsif action_text like '%drain%' then
    category := 'pump_alerts';
    alert_title := 'Drain action recorded';
    alert_message := 'A drain action was logged for this tank.';

  elsif action_text like '%refill%' then
    category := 'pump_alerts';
    alert_title := 'Refill action recorded';
    alert_message := 'A refill action was logged for this tank.';
  end if;

  pump_wording := public.craythrive_pump_action_wording(to_jsonb(new));
  if pump_wording is not null then
    category := 'pump_alerts';
    alert_title := pump_wording->>'title';
    alert_message := pump_wording->>'message';
  end if;

  if category is not null then
    perform public.create_alert_if_enabled(
      new.user_id,
      new.tank_id,
      category,
      'control_log',
      alert_title,
      case when pump_wording is not null then alert_message else coalesce(new.notes, alert_message) end,
      case
        when new.action_status = 'failed' then 'warning'
        else 'info'
      end,
      coalesce(to_jsonb(new)->'metadata', '{}'::jsonb) || jsonb_build_object(
        'control_log_id', new.id,
        'action_type', new.action_type,
        'action_status', new.action_status,
        'notes', new.notes
      )
    );
  end if;

  return new;
end;
$function$
;

commit;
