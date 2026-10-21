-- Run manually in Supabase SQL Editor. Replace YOUR_LOGIN_EMAIL in both queries.
-- No auth.uid(): the SQL Editor does not use your mobile login session.
-- First verify the intended account and whether it has an active device token.
select u.id as user_id, u.email,
  (select count(*) from public.push_tokens p where p.user_id = u.id and p.is_active = true) as active_push_devices
from auth.users u
where lower(u.email) = lower('YOUR_LOGIN_EMAIL');

-- Creates ONE clearly labelled test alert for only the matching account.
-- Bell/in-app delivery uses alerts. Phone push ALSO needs a deployed sender/webhook.
-- Running this INSERT again creates another test alert; run it only once per test.
insert into public.alerts (user_id, type, title, message, severity, is_read, status, metadata)
select u.id, 'system', 'TEST PUSH - CrayThrive',
  'Manual notification test only. This is not a real tank warning.',
  'info', false, 'active', '{"manual_notification_test":true}'::jsonb
from auth.users u
where lower(u.email) = lower('YOUR_LOGIN_EMAIL')
returning id, user_id, title, created_at;
