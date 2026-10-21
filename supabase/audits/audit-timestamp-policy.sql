-- Read-only metadata audit. The database timezone remains UTC.
select jsonb_build_object(
 'columns', (select jsonb_agg(to_jsonb(c) order by c.table_name,c.ordinal_position)
   from (select table_name,column_name,data_type,column_default,is_nullable,ordinal_position
     from information_schema.columns where table_schema='public'
     and (data_type like 'timestamp%' or data_type in ('date','time without time zone','time with time zone'))) c),
 'triggers', (select jsonb_agg(jsonb_build_object('table',c.relname,'trigger',t.tgname,
     'function',p.proname,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal),
 'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid)) order by p.proname)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname ~ '(time|feed|alert|read|log|marketplace)')
) as timestamp_audit;
