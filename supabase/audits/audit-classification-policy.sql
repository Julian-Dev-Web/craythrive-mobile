-- Read-only audit for Fix #3. No threshold or automation changes.
select jsonb_build_object(
  'columns', (select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position)
    from (select table_name,column_name,data_type,column_default,ordinal_position
      from information_schema.columns where table_schema='public'
      and table_name in ('tank_threshold_settings','threshold_settings','sensor_readings','ammonia_readings','alerts','tank_automation_settings')) c),
  'threshold_json_keys', (select jsonb_agg(to_jsonb(k)) from (
    select 'tank_threshold_settings' as source,key,count(*) as rows_with_key
      from public.tank_threshold_settings cross join lateral jsonb_object_keys(thresholds) key group by key
    union all
    select 'threshold_settings',key,count(*) from public.threshold_settings
      cross join lateral jsonb_object_keys(thresholds) key group by key) k),
  'triggers', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'function',p.proname))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal
    and c.relname in ('sensor_readings','ammonia_readings','alerts','tank_threshold_settings','threshold_settings')),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
    and p.proname ~ '(sensor|threshold|alert|ammonia|automation|pump|feed|drain|refill)')
) as classification_audit;
