# CrayThrive mobile branding, saved login, and push notifications

October 6 status: the linked project's missing push backend has now been provisioned. `send-craythrive-push` is ACTIVE (version 1), with matching server-only authentication in Vault and Edge secrets. `pg_net` is installed, and INSERT triggers on `alerts` and `marketplace_chat_messages` call the sender asynchronously. Existing order insert/status triggers already create `alerts`; no direct order push trigger was added, preventing duplicate order delivery. Chat triggers do not create alert rows. [Setup SQL](../supabase/setup/enable-mobile-push.sql) preserves existing business triggers and can be rerun for this linked project.

Read-only account checks found fresh Android registrations and enabled preferences. EAS metadata confirms matching FCM V1 credentials; neither account nor project enhanced push security is enabled, so `EXPO_ACCESS_TOKEN` is not required for this configuration. Auth probes verified that an incorrect webhook secret returns 401 and an authenticated unsupported event returns 400 without sending a notification. A separate `pg_net` background request reached the same authenticated sender and returned 400 for an unsupported event, verifying the asynchronous worker without delivering a message. Authenticated app clients cannot execute the database trigger function. These checks establish backend readiness, not delivery to a phone.

[Account test SQL](../supabase/audits/test-my-notification.sql) is prepared for manual use; replace its email placeholder with the mobile login email. Running it now tests the saved alert and push webhook path. Only run it when a real test notification is wanted. Live column metadata confirms `public.alerts.type`, not `alert_type`; the mobile sensor-alert insert has been corrected to use `type`.

The earlier October 4 endpoint probe returned 404. The October 6 audit confirmed that the sender, webhook secret, and notification HTTP triggers were all absent; storing alerts alone could not generate remote Android notifications. This backend repair does not require rebuilding the installed APK's existing push registration code. No APK was built for this repair. The original `assets/images/Logo.png` is preserved. The square app icon is a logo-derived variant. The Android status-bar icon compiles the existing `CrayfishIcon.js` vector to white on transparency.

## Deploy the push sender

Use the **same Supabase project as the mobile app and web dashboard**. The existing tables are `push_tokens`, `notification_preferences`, `alerts`, `marketplace_orders`, and `marketplace_chat_messages`. No new application table or destructive migration is needed. `pg_net` supplies its own request queue/response tables. The following instructions are for a fresh environment; the linked production project is already configured.

1. Sign into Supabase CLI on your computer (or use the Dashboard's Edge Function editor). Deploy `supabase/functions/send-craythrive-push/index.ts` under the exact name **send-craythrive-push**:

   ```powershell
   npx supabase login
   npx supabase functions deploy send-craythrive-push --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```

2. Create a cryptographically random secret of at least 32 characters using a password manager. In Supabase Dashboard → Edge Functions → Secrets, set `PUSH_WEBHOOK_SECRET` to that value. Do **not** put it or the Supabase service-role key in `EXPO_PUBLIC_*`, app source, or the mobile bundle. Supabase normally supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.
3. If Expo enhanced push security is enabled for this EAS project, also set the function secret `EXPO_ACCESS_TOKEN` to its permitted Expo access token. Leave it unset only when enhanced security is not enabled.
4. Inspect existing notification webhooks/senders first. Use **one sender per event** to avoid duplicate notifications. For this linked project, store the same authentication value in Vault under `craythrive_push_webhook_secret`, then apply [the reviewed setup SQL](../supabase/setup/enable-mobile-push.sql). Its fixed endpoint belongs to project `abtzkqfrwzcocyrwcrfc`; review the URL before using it elsewhere. The SQL reads the header from Vault instead of storing a secret literal in trigger definitions or source. The function uses this secret instead of user JWTs; disabling gateway JWT verification without configuring the secret does not enable sending.
5. Set the webhook timeout to 30,000 ms and enable these events only:

   | Table | Event | Recipient |
   | --- | --- | --- |
   | `alerts` | INSERT | Alert's `user_id` |
   | `marketplace_chat_messages` | INSERT | Message's `receiver_id` |
   | Existing order alert triggers -> `alerts` | Order INSERT / status change | Recipient of the generated alert |

   If your current backend already generates `alerts` rows for Marketplace messages/orders, use either those alert webhooks **or** the direct Marketplace webhooks for those events, not both. Unchanged order statuses, read receipts, and alert updates do not send another push.

The sender reloads the canonical database row, respects the matching user preference (missing preference rows use the same enabled defaults as Settings), loads only active device tokens, and sends notification messages with a title/body and `channelId: craythrive-alerts`. It does not require a running mobile screen or Supabase realtime connection. Retired tokens reported as `DeviceNotRegistered` in Expo tickets are disabled for that device/user.

## Verify database access without changing policies blindly

- `push_tokens.expo_push_token` must have a unique constraint for the existing upsert conflict target.
- The authenticated mobile user must be able to register and update their own `push_tokens` rows, including logout deactivation. Users must not be able to read or change other users' tokens. Existing RLS policies must also permit a device to be rebound after signing into a different account; if a policy prevents this, inspect and fix that policy deliberately.
- `notification_preferences.user_id` must identify the same account used by mobile Settings. Database errors abort sending instead of bypassing preferences.
- The server function uses the service-role key only inside Supabase; never copy that key into the app.

## Configure Android delivery and build later

`app.json` references the custom app/status-bar icons, the `expo-notifications` plugin, `google-services.json`, and EAS project ID. Both existing Firebase files match package `com.craythrive.mobile`. A read-only EAS project metadata check on 2026-10-04 confirmed that an FCM V1 service account key is uploaded and its Firebase project identifier matches the client JSON. No private key was downloaded or credential changed. This checks configuration mapping; successful delivery still needs a phone/receipt test.

In EAS project credentials, verify the **FCM V1 service account key**, from the same Firebase project as `google-services.json`. The client JSON file alone is insufficient. If using CLI:

```powershell
npx eas-cli@latest credentials --platform android
```

Select the Google Service Account / FCM V1 push credential option. Keep its private key out of the app/source archive. Use the current EAS account/project; do not create a second Firebase project unnecessarily.

After server/credentials setup and phone-test readiness, the existing `preview` profile generates a standalone APK:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

This command is documentation only; Codex did not run a build. `.easignore` excludes native Android/iOS folders so EAS regenerates native resources from `app.json`. If building from the existing native Android folder locally, regenerate native resources deliberately before that later build. Restarting Metro or publishing JavaScript alone cannot replace the installed native app icon. Expo Go keeps its own launcher icon and does not support Android remote push on SDK 54.

## Phone checklist and delivery diagnosis

1. Install the newly built APK when authorized, sign in, allow notifications, and verify a fresh active token under that user's `push_tokens` row. Registration retries on foreground return without repeatedly opening permission dialogs.
2. Press Home. Use [Expo's notification tool](https://expo.dev/notifications) with that device token, a title/body, and Android channel `craythrive-alerts`. Repeat after a normal swipe-away from Recent Apps. Do not use Android Settings → Force Stop for this test.
3. If the tool succeeds but real alerts do not, inspect the database webhook event, destination/header and Edge Function logs. Trigger an actual saved tank alert, Marketplace message from another account, and reservation. Verify the recipient and preferences. Test disabled preferences too.
4. Expo `accepted` counts/receipt IDs mean **queued**, not delivered. Query `https://exp.host/--/api/v2/push/getReceipts` with `{"ids":["RECEIPT_ID"]}` after Expo has processed the message (Expo recommends around 15 minutes). Use the Expo authorization token when enhanced security is enabled. Check `InvalidCredentials`, `DeviceNotRegistered`, or other receipt errors before assuming delivery. Receipt IDs are in function logs/response. This implementation does not add a durable receipt queue or automatically poll later receipts; stale tokens discovered only in later receipts still need disabling in `push_tokens`.
5. Tap a received notification with the process closed: it should restore the saved login and open Marketplace or the tank alert destination. Close/reopen normally: no login prompt for a valid stored session. Try a temporary network failure during restoration: the retry screen must not clear the saved account.
6. Sign out and verify only this phone's token becomes inactive; other devices stay active. Test a new account on the same phone. If cleanup fails while offline, logout remains available; disable the old token when back online before handing the phone to another user.

Known boundaries: Android Force Stop blocks pushes until reopening; phone vendors/battery settings can delay delivery; push is not guaranteed or a replacement for critical monitoring. Retry deduplication is best effort within a warm server worker, not durable exactly-once delivery. The `pg_net` queue does not provide a durable application retry mechanism for failed delivery; inspect its response status and Edge logs after failures. Duplicate webhook requests across worker restarts can duplicate a notification. Delayed direct order events use the current canonical status and obsolete UPDATE events are skipped. No application tables/columns or live policies were changed; the repair added the `pg_net` extension and two trigger bindings.

October 6 validation: local notification/login regression tests and Expo transformations passed with ESLint 0 errors / 0 warnings. Deno type checking exposed an unbounded preference key; restricting it to the four supported notification preference fields fixed the error, and the cached Deno check now passes. No phone delivery is claimed until an authorized test and device confirmation.

## Local checks

```powershell
node scripts/check-mobile-notifications.cjs
node scripts/check-marketplace.cjs
node scripts/check-ai-guide.cjs
```

These checks use mocks and local Expo transforms. They do not send push messages, mutate live data, build an APK, or prove that EAS/Supabase credentials are deployed.

## Files changed for this work

- `app.json`
- `app/index.tsx`
- `src/lib/supabase.js`
- `src/utils/pushNotifications.js`
- `src/screens/SplashScreen.js`
- `src/screens/main/SettingsScreen.js`
- `assets/images/craythrive-app-icon.png`
- `assets/images/craythrive-notification-icon.svg`
- `assets/images/craythrive-notification-icon.png`
- `scripts/prepare-mobile-icons.cjs`
- `scripts/check-mobile-notifications.cjs`
- `supabase/config.toml`
- `supabase/functions/send-craythrive-push/index.ts`
- `supabase/setup/enable-mobile-push.sql`
- `docs/mobile-notifications.md`

For the October 6 missing-backend repair specifically, only the sender's preference-key types, the new setup SQL, and this document were edited. Other files above belong to the earlier mobile implementation. Live changes were limited to the new sender deployment, its matching Vault/Edge authentication secret, `pg_net`, the enqueue function, and the two alert/chat triggers.

References: [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [FCM V1 credentials](https://docs.expo.dev/push-notifications/fcm-credentials/), [Expo delivery/receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Supabase database webhooks](https://supabase.com/docs/guides/database/webhooks), [Supabase React Native session refresh](https://supabase.com/docs/guides/auth/quickstarts/react-native).
