-- Fix #6: read-only metadata audit; not a migration or historical data update.
select jsonb_build_object(
 'tables', (select jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity,
   'realtime', exists(select 1 from pg_publication_tables p where p.pubname='supabase_realtime' and p.schemaname='public' and p.tablename=c.relname)))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
   and c.relname ~ '(activit|histor|feed|automation|control|command|alert|device|ammonia|threshold|sensor)'),
 'columns', (select jsonb_agg(to_jsonb(c) order by table_name, ordinal_position)
   from (select table_name,column_name,data_type,column_default,ordinal_position from information_schema.columns
   where table_schema='public' and table_name ~ '(activit|histor|feed|automation|control|command|alert|device|ammonia|threshold|sensor)') c),
 'policies', (select jsonb_agg(to_jsonb(p)) from (select tablename,policyname,roles,cmd,qual,with_check from pg_policies
   where schemaname='public' and tablename ~ '(activit|histor|feed|automation|control|command|alert|device|ammonia|threshold|sensor)') p),
 'triggers', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'function',p.proname))
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal
   and c.relname ~ '(activit|histor|feed|automation|control|command|alert|device|ammonia|threshold|sensor)'),
 'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
   and p.proname ~ '(log_|mirror|alert_from|device_command|control_log|audit_threshold)')
) as activity_audit;
