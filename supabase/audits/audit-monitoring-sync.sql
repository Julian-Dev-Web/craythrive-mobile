-- Fix #7 read-only metadata/aggregate audit. No user values or credentials.
select jsonb_build_object(
 'columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'default',column_default) order by table_name,ordinal_position)
 from information_schema.columns where table_schema='public' and table_name in ('sensor_readings','ammonia_readings','iot_devices')),
 'realtime_tables',(select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'),
 'device_roles',(select jsonb_agg(to_jsonb(r)) from (select device_type,count(*) records from public.iot_devices group by device_type) r),
 'sensor_identity_counts',(select jsonb_build_object('rows',count(*),'without_uid',count(*) filter(where device_uid is null),'without_device_id',count(*) filter(where iot_device_id is null),'canonical_temp_missing_with_legacy',count(*) filter(where temperature_c is null and temperature is not null),'canonical_ph_missing_with_legacy',count(*) filter(where ph_value is null and ph is not null),'canonical_depth_missing_with_legacy',count(*) filter(where water_depth_cm is null and water_level is not null),'canonical_voltage_missing_with_legacy',count(*) filter(where turbidity_voltage is null and turbidity is not null)) from public.sensor_readings),
 'timestamp_ties',(select count(*) from (select user_id,tank_id,created_at from public.sensor_readings group by user_id,tank_id,created_at having count(*)>1) s),
 'ambiguous_sensor_pairings',(select count(*) from (select user_id,tank_id from public.iot_devices where is_claimed and tank_id is not null and device_type ilike '%sensor%' group by user_id,tank_id having count(*)>1) s),
 'indexes',(select jsonb_agg(jsonb_build_object('table',tablename,'definition',indexdef)) from pg_indexes where schemaname='public' and tablename in ('sensor_readings','ammonia_readings'))
) as monitoring_sync_audit;
