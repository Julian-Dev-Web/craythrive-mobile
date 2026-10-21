-- Read-only: inspect configured bounds and realtime availability. No data writes.
select jsonb_build_object(
  'columns', (select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position)
    from (select table_name,column_name,data_type,column_default,ordinal_position
      from information_schema.columns where table_schema='public'
      and table_name in ('tank_threshold_settings','threshold_settings')) c),
  'realtime_tables', (select coalesce(jsonb_agg(tablename),'[]'::jsonb)
    from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
    and tablename in ('tank_threshold_settings','threshold_settings'))
) as safe_range_audit;
