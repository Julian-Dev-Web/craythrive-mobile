-- READ-ONLY. Run in this project's Supabase SQL Editor; do not paste credentials.
-- These queries report deployed configuration; they do not create/alter policies.
WITH expected(name) AS (VALUES
  ('profiles'), ('tanks'), ('threshold_settings'), ('sensor_readings'),
  ('ammonia_readings'), ('iot_devices'), ('control_logs'), ('alerts'),
  ('seller_profiles'), ('marketplace_listings'), ('marketplace_orders'),
  ('marketplace_chat_threads'), ('marketplace_chat_messages'),
  ('push_tokens'), ('notification_preferences'))
SELECT expected.name, c.oid IS NOT NULL AS table_exists,
  c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = expected.name) AS policy_count
FROM expected
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = expected.name
ORDER BY expected.name;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('public', 'storage') ORDER BY schemaname, tablename, policyname;

SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('public', 'storage') AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY table_name, column_name, grantee, privilege_type;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer, p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' ORDER BY p.proname;

SELECT event_object_table, trigger_name, event_manipulation, action_timing,
  action_statement FROM information_schema.triggers
WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name;

SELECT conrelid::regclass AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id IN ('marketplace-images', 'avatars', 'profile-images', 'profile-avatars');

SELECT c.relrowsecurity AS storage_objects_rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage' AND c.relname = 'objects';
