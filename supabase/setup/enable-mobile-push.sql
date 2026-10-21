-- Non-destructive server push setup. The sender and matching Vault/Edge secret
-- must be configured first. No tokens, private keys or header values are literals.
-- Existing Marketplace order triggers already create alerts; do not add a second
-- direct order webhook. Chat messages do not currently create alert rows.
begin;

create extension if not exists pg_net with schema extensions;

do $check$
begin
  if not exists (select 1 from vault.secrets where name = 'craythrive_push_webhook_secret') then
    raise exception 'Configure the matching Vault and Edge push secret first.';
  end if;
  if exists (
    select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and t.tgrelid in ('public.alerts'::regclass, 'public.marketplace_chat_messages'::regclass)
      and t.tgname not in ('craythrive_push_alert_insert', 'craythrive_push_chat_insert')
      and pg_get_functiondef(p.oid) ~* 'http_post|http_request|send.craythrive.push'
  ) then
    raise exception 'An existing notification webhook needs review before enabling another sender.';
  end if;
end;
$check$;

create or replace function public.craythrive_enqueue_mobile_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  webhook_secret text;
begin
  if tg_table_schema <> 'public' or tg_op <> 'INSERT'
    or tg_table_name not in ('alerts', 'marketplace_chat_messages') then
    return new;
  end if;
  -- Read receipts/system messages should not notify a nonexistent recipient.
  if tg_table_name = 'marketplace_chat_messages' and
    (to_jsonb(new)->>'receiver_id' is null or to_jsonb(new)->>'sender_id' = to_jsonb(new)->>'receiver_id') then
    return new;
  end if;
  select decrypted_secret into webhook_secret from vault.decrypted_secrets
    where name = 'craythrive_push_webhook_secret' limit 1;
  if webhook_secret is null or length(webhook_secret) < 32 then
    raise warning 'CrayThrive push webhook secret is not configured.';
    return new;
  end if;
  perform net.http_post(
    url := 'https://abtzkqfrwzcocyrwcrfc.supabase.co/functions/v1/send-craythrive-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-craythrive-webhook-secret', webhook_secret),
    -- The Edge sender rereads the canonical row; never transmit message/token data.
    body := jsonb_build_object('schema', tg_table_schema, 'table', tg_table_name,
      'type', tg_op, 'record', jsonb_build_object('id', to_jsonb(new)->>'id'), 'old_record', null),
    timeout_milliseconds := 30000
  );
  return new;
exception when others then
  -- Notification enqueue must not roll back a valid chat/reservation/alert.
  raise warning 'CrayThrive push enqueue failed. Inspect the notification backend.';
  return new;
end;
$function$;

revoke all on function public.craythrive_enqueue_mobile_push() from public, anon, authenticated;

do $triggers$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.alerts'::regclass and tgname = 'craythrive_push_alert_insert') then
    create trigger craythrive_push_alert_insert after insert on public.alerts
      for each row execute function public.craythrive_enqueue_mobile_push();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.marketplace_chat_messages'::regclass and tgname = 'craythrive_push_chat_insert') then
    create trigger craythrive_push_chat_insert after insert on public.marketplace_chat_messages
      for each row execute function public.craythrive_enqueue_mobile_push();
  end if;
end;
$triggers$;

commit;
