/* global __dirname */
// Returns a rollback-only SQL test. Destination tables and alert helper are
// replaced with temporary test doubles; never enqueue push or real pump commands.
const fs = require('node:fs');
const path = require('node:path');
module.exports = function sqlFixtures() {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/setup/fix-pump-alert-wording.sql'), 'utf8');
  const command = sql.match(/CREATE OR REPLACE FUNCTION public\.create_actuator_alert_from_command\(\)[\s\S]*?\$function\$\s*;/)[0]
    .replace('public.create_actuator_alert_from_command()', 'pg_temp.pump_test_command_alert()')
    .replaceAll('public.alerts', 'pg_temp.pump_test_alerts');
  const log = sql.match(/CREATE OR REPLACE FUNCTION public\.create_alert_from_control_log\(\)[\s\S]*?\$function\$\s*;/)[0]
    .replace('public.create_alert_from_control_log()', 'pg_temp.pump_test_log_alert()')
    .replace('public.create_alert_if_enabled', 'pg_temp.pump_test_alert_if_enabled');
  return `
create temporary table pump_test_alerts (like public.alerts including defaults) on commit drop;
create temporary table pump_test_commands (like public.device_commands including defaults) on commit drop;
create temporary table pump_test_logs (like public.control_logs including defaults) on commit drop;
create function pg_temp.pump_test_alert_if_enabled(uuid,uuid,text,text,text,text,text,jsonb)
returns void language sql as $stub$
insert into pg_temp.pump_test_alerts(user_id,tank_id,type,title,message,severity,metadata)
values ($1,$2,$4,$5,$6,$7,$8);
$stub$;
${command}
${log}
create trigger pump_test_command after update on pump_test_commands
for each row execute function pg_temp.pump_test_command_alert();
create trigger pump_test_log after insert on pump_test_logs
for each row execute function pg_temp.pump_test_log_alert();
do $test_generators$
declare
  execution_status text;
  action text;
  origin text;
  command_uuid uuid;
  runtime integer;
  row_record record;
  wording jsonb;
  checked integer := 0;
begin
  -- Both paths use exactly the same trigger formatter regardless of origin.
  foreach origin in array array['manual','rule_based'] loop
    foreach action in array array['DRAIN_FOR','REFILL_FOR'] loop
      foreach execution_status in array array['done','rejected','failed'] loop
        command_uuid := gen_random_uuid();
        insert into pg_temp.pump_test_commands(id,command_type,command_status,duration_ms,user_id,tank_id,device_uid)
          values(command_uuid,action,'pending',10000,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','wording-fixture');
        update pg_temp.pump_test_commands set command_status=execution_status where id=command_uuid;
        select * into strict row_record from pg_temp.pump_test_alerts where command_id=command_uuid;
        wording := public.craythrive_pump_action_wording(jsonb_build_object('command_type',action,'command_status',execution_status));
        if row_record.title <> wording->>'title' or row_record.message <> wording->>'message' then
          raise exception 'Command generator wording mismatch';
        end if;
        if (select duration_ms from pg_temp.pump_test_commands where id=command_uuid) <> 10000
          or (row_record.metadata->>'duration_ms')::integer <> 10000 then
          raise exception 'Requested duration was lost';
        end if;
        update pg_temp.pump_test_commands set command_status=execution_status where id=command_uuid;
        if (select count(*) from pg_temp.pump_test_alerts where command_id=command_uuid) <> 1 then
          raise exception 'Duplicate alert after unchanged status';
        end if;
        checked := checked + 1;
      end loop;
    end loop;
    foreach runtime in array array[1000,2000] loop
      command_uuid := gen_random_uuid();
      insert into pg_temp.pump_test_logs(id,action_type,action_status,user_id,tank_id,notes,metadata)
      values(command_uuid,'refill','completed','00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002','Completed successfully.',
        jsonb_build_object('source',origin,'actual_duration_ms',runtime,'requested_seconds',10));
      select * into strict row_record from pg_temp.pump_test_alerts where metadata->>'control_log_id'=command_uuid::text;
      wording := public.craythrive_pump_action_wording(jsonb_build_object('action_type','refill','action_status','completed','metadata',jsonb_build_object('actual_duration_ms',runtime)));
      if row_record.title <> wording->>'title' or row_record.message <> wording->>'message'
        or (row_record.metadata->>'requested_seconds')::integer <> 10
        or row_record.metadata->>'source' <> origin then
        raise exception 'Control log wording/metadata mismatch';
      end if;
      checked := checked + 1;
    end loop;
    foreach execution_status in array array['completed','rejected','failed'] loop
      command_uuid := gen_random_uuid();
      insert into pg_temp.pump_test_logs(id,action_type,action_status,user_id,tank_id,notes,metadata)
      values(command_uuid,'drain',execution_status,'00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002','The drain pump ran for 10 seconds.',
        jsonb_build_object('source',origin,'requested_seconds',10,'actual_duration_ms',200));
      select * into strict row_record from pg_temp.pump_test_alerts where metadata->>'control_log_id'=command_uuid::text;
      wording := public.craythrive_pump_action_wording(jsonb_build_object('action_type','drain','action_status',execution_status));
      if row_record.title <> wording->>'title' or row_record.message <> wording->>'message' then
        raise exception 'Control drain wording mismatch';
      end if;
      checked := checked + 1;
    end loop;
  end loop;
  if checked <> 22 then raise exception 'Incomplete generator test set'; end if;
end;
$test_generators$;
`;
};
