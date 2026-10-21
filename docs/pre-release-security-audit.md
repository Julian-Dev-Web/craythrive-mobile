# CrayThrive pre-release security audit — 2026-10-05

The local source audit and hardening are complete. Release approval remains pending deployed database authorization, online dependency checks and phone tests. **No APK was built, no EAS build was started, no database policies were changed, and no Edge Function was deployed.** No private credential values are printed in this report or the redacted scanner.

## Findings and fixes

| Area | Finding | Result |
| --- | --- | --- |
| Client secrets | `.env` was eligible for Git/EAS upload. Its current contents are only an HTTPS Supabase URL and a decoded legacy JWT with `role: anon`. | All `.env*` files are ignored; an example contains placeholders only. Private credential file patterns, old build archives and backend function source are excluded from EAS. Local `.env` remains usable for development. |
| Public config | The client previously accepted any supplied Supabase key. | The client accepts a publishable key or legacy anon key and requires HTTPS without URL credentials. An EAS post-install check rejects private keys and unapproved `EXPO_PUBLIC_*` names before compilation. Validation is a guard against accidental inclusion, not authorization. |
| AI | `craythrive-ai-guide` authenticated a user but did not verify ownership of the supplied tank ID. | The function queries the tank using the caller JWT, requires matching `user_id`, and refuses absent/foreign tanks before calling the provider. Requests are limited to 128 KiB; context fields, strings, nesting and arrays are bounded. Token/password/email/secret fields are filtered. Provider URLs require HTTPS, URL credentials are rejected, and redirects are rejected. |
| AI cost | Authenticated requests could invoke the provider without a local quota. | Added a best-effort 20-request/minute limit per user in each warm worker. This is **not** a durable limit across workers/restarts. Configure a persistent gateway/database quota and provider spending limit before a public launch. |
| AI architecture | Mobile already invoked the authenticated Edge Function instead of Groq/OpenAI directly. | Preserved. No provider credential or direct private AI request was moved out of the mobile app because none was found there. Private AI credentials still belong exclusively in server secrets. |
| Authentication | Forgot Password queried an anonymous email-check RPC and `profiles`, then explicitly disclosed account existence. Registration also interpreted empty identities as an existing account. | Recovery now calls Supabase Auth directly and gives the same success message for registered/unregistered addresses. Registration no longer adds that client enumeration branch. Auth server responses/settings still need review. Password reset web routes clear successful recovery tokens/code from browser history and use generic errors. |
| Logs | Many client catches logged raw auth/database/network error objects. | Client diagnostics retain constant labels only; sessions, profile responses, passwords, tokens and authorization objects are not dumped. The AI server catch no longer dumps an arbitrary error object. Removed the resulting unused catch bindings. |
| Sessions | Persistent Supabase sessions use AsyncStorage on native and localStorage on web. | Preserved automatic login, token refresh and foreground/background handling. Disabled Android backup in Expo config and the native manifest. **AsyncStorage is still unencrypted**; migration to SecureStore requires safe size handling, migration of existing sessions, rollback and phone tests. No risky storage migration was performed. |
| Seller links | Existing shared normalizer already rejected non-HTTP(S) schemes, embedded credentials, whitespace and backslashes. Telephone numbers already used a digits/optional-plus allowlist. | Retained and covered by malicious-input tests. Seller HTTP links open externally; they do not receive app credentials. Phone links allow 10–15 digits and one optional leading plus. |
| Marketplace input | Existing reservations validated stock, ownership, status, safe-integer quantity and finite positive price. | Retained. Publishing now also rejects overflow in price × quantity. Chat submission enforces the existing 800-character UI limit inside the handler. These checks do not replace database constraints or authorization. |
| Uploads | Marketplace/avatar uploads inferred image type from extensions and had no practical size cap. | Added JPEG/PNG/WebP MIME and actual signature checks, a 5 MiB limit, and a native file-size check before Base64 decoding. Actual bytes determine extension/content type. Other formats are rejected instead of relabeled as JPEG. Existing per-user paths and buckets remain unchanged. Magic-byte checks are not a complete image decoder or server-side validation. |
| ESP32 networking | Device-supplied setup addresses could point at an arbitrary public destination receiving Wi-Fi credentials. | Only RFC1918 IPv4 or a `.local` hostname is accepted; credentials, query/hash values and unexpected paths are rejected. Used the installed `expo/fetch` implementation with redirect mode `error`; its Android native code disables redirects. Device Wi-Fi passwords are cleared after success. |
| Production HTTP | Android permits cleartext traffic to retain existing local ESP32 provisioning over HTTP. | Cloud Supabase/AI/push endpoints use HTTPS. The local hardware exception remains: provisioning passwords travel over local HTTP. Native cleartext permission is still global; a firmware/TLS and Android policy solution is required to remove it without breaking setup. No certificate-validation bypass or pinning was introduced. |
| Signing | The local generated Gradle release configuration fell back to the public debug keystore. | Removed the release fallback. EAS continues to manage release signing in regenerated native projects; `/android` remains excluded from EAS. Direct local release builds now require explicit release signing configuration. |
| Git | `android/app/debug.keystore` is already staged; no private production signing key/service-account JSON was found. There are zero reachable commits in the supplied Git repository. | Added keystore and credential ignore patterns. Existing tracked/staged files are not removed by ignore rules: unstage the debug keystore before committing. No history rewrite, credential export or Git index mutation was performed. |

## Secret inventory and rotation

The redacted scan covers project source/config/scripts, native text files, `supabase`, local env files, saved `eas-archive` source, the staged Git index and reachable Git history. Dependencies/generated native outputs are not treated as project source; the actual exported JavaScript bundle, including dependencies, is scanned separately. Secret-looking literals, private key material, provider/database credential URLs, non-public JWTs and private environment assignments produce location-only findings.

- **No actual private provider/server/signing credential value found** in scanned project text or the Android JavaScript export.
- `AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSH_WEBHOOK_SECRET` and `EXPO_ACCESS_TOKEN` are **names read through `Deno.env.get` in backend code**, not bundled private values. They must stay in Supabase/Expo server credential stores.
- `android/app/debug.keystore` is the Android development keystore, referenced with the conventional public development credentials. It is not a discovered production signing secret; it must not sign release APKs or be committed with this project.
- No observed private-key exposure requires rotation based on the available files. **ROTATION REQUIRED** if a private key was included in a previous APK, remote repository, log or shared archive outside this audited checkout. That history cannot be established from a repository with zero reachable commits.
- Intentionally extractable public config: Supabase project HTTPS URL and legacy anon/publishable key; Android Firebase `google-services.json` client project/app identifiers and client API key; Expo project ID, app package/name/version. No Firebase service-account private key was found. Public keys still require RLS and appropriate Firebase API restrictions.
- No obfuscation, Base64 “secret hiding” or renamed secret variables was used as a security control. JWT decoding is used only to classify a supplied key's role.

## Database authorization remains unverified

There are no deployed RLS/storage policy definitions or table migrations available in this workspace, and no authenticated database administration connection was available. React filters and this offline audit cannot establish the deployed policy state. **Do not infer that the tables are safe or that they are demonstrably vulnerable from client checks alone.**

Run the read-only [authorization audit SQL](../supabase/audits/pre-release-authorization.sql) in the project's Supabase SQL Editor. It reports table RLS, policies, grants, RPC metadata, triggers, constraints and storage bucket limits. It does not alter anything. Review actual RPC bodies in the dashboard, including ownership checks and fixed `search_path` for SECURITY DEFINER functions. No schemas, policies or triggers were invented or applied without the deployed definitions.

| Existing operation | Required deployed protection |
| --- | --- |
| `tanks`, `threshold_settings`, readings, ammonia, control logs | Owner access through `auth.uid()`, both USING and WITH CHECK for mutations; related tank must belong to the same authenticated user. Device/firmware writes need their own approved server authorization. |
| `iot_devices` claim/disconnect | Atomically claim only an available authorized device for an owned tank; deny stealing/disconnecting another user's device. The existing app updates rows by device UID. Device visibility/claim proof needs review, not a blanket public update policy. |
| `profiles` | Owner-only private fields. Chat needs other participants' display name/avatar, not arbitrary email/private profile access. Provide only approved public display fields through suitable grants/view/RPC; preserve current own-profile behavior. |
| `seller_profiles` | Owner-only INSERT/UPDATE by `user_id`; no ownership transfer. Public store/contact/pickup fields are intentionally displayed, matching the web dashboard's record. Review what additional columns SELECT can expose. |
| `marketplace_listings` | Seller owns create/edit/hide/activate/soft-delete; cannot transfer `seller_id`. Active product visibility plus appropriate participant access to historical reserved/sold listings. An active seller check must be server-side. |
| `marketplace_orders` | Buyer equals `auth.uid()`; seller comes from the canonical listing; reject own/unavailable listings and invalid/excess quantity; calculate/verify total price server-side; require initial pending status. Authorize later transitions and protect immutable party/listing/amount fields. |
| Reservation/cancellation listing updates | Buyers must not receive unrestricted listing UPDATE privileges. Use narrowly validated transitions or an authorized existing database trigger/RPC. The current client inserts an order and separately transitions listing status. |
| Concurrent reservations | Stock/availability checks and state changes need an atomic transaction/row lock or equivalent existing mechanism. Client locks prevent duplicate taps in one app, not simultaneous buyers or modified requests. |
| Chat threads/messages and RPCs | Only thread participants read or act; sender equals `auth.uid()`; receiver is the actual other participant; listing seller/order parties resolved server-side; no forged cross-user IDs or messages to closed threads. Enforce message limits and restrict edits to allowed read-state fields. |
| `alerts` | Only recipient reads/marks read; inserted `user_id` and `tank_id` are authorized. A modified APK must not insert alerts for other users and cause server push delivery to them. |
| `push_tokens`, `notification_preferences` | Owner-only read/write; server-only cross-user token access. Test token registration after switching accounts on the same phone: uniqueness/transfer must not weaken ownership or leave the old account receiving alerts. |
| `storage.objects` | For `marketplace-images` and `profile-avatars`, enforce authenticated ownership/per-user first folder on INSERT/UPDATE/DELETE, with checks on new names too. Public image GET may be intentional; public deletion/upload is not. Configure 5 MiB bucket size limits and JPEG/PNG/WebP MIME allowlists. Review permissive policies together, because a broad policy can bypass an added narrow one. |

Inspect `get_or_create_marketplace_chat_thread`, `close_marketplace_chat_thread`, `reopen_marketplace_chat_thread`, and `hide_marketplace_chat_thread` using their actual deployed signatures. Verify caller membership even when passed arbitrary thread/order/listing IDs. Review/restrict the now-unused `check_profile_email_exists` RPC's anonymous/public EXECUTE access using its actual signature; removing the mobile call does not revoke the deployed RPC.

The AI function now verifies tank ownership and bounds/minimizes context, but reading/threshold context is still supplied by the client. It is advisory data, not a server-verified measurement or permission to apply a change. Stronger integrity would require fetching and evaluating canonical readings/thresholds on the server. Database ownership/constraints must independently authorize any later threshold update; the AI function does not control hardware or apply it.

## Validation results

| Check | Result |
| --- | --- |
| `node scripts/check-release-security.cjs` | No private value findings. Includes current `.env`, saved archive and staged index. No reachable Git commits to inspect. |
| `node scripts/check-build-client-config.cjs` | Current local HTTPS URL/public anon key pass. No configuration values printed. |
| `node scripts/check-security-hardening.cjs` | Pass: private-key rejection, seller schemes, malicious numeric values, actual recovery/Wi-Fi handlers, redirect-capable native implementation, invalid/oversized images, safe diagnostics, backup/build exclusions. |
| `node scripts/check-ai-guide.cjs` | Pass: foreign/missing tank denied before provider, body/context bounds, HTTPS, per-worker quota, existing answer/error/session refresh/duplicate-send behavior. |
| `node scripts/check-marketplace.cjs` | Pass: existing categories, listings, seller profile, reservations, chats, history, both themes and navigation. |
| `node scripts/check-mobile-notifications.cjs` | Pass: persistent login/refresh, push lifecycle, sender authentication, canonical recipients, preferences and token retirement. No live push delivery tested. |
| `node scripts/check-sensor-monitoring.cjs` | Pass: current sensor correctness and alert/threshold semantics preserved. |
| `node scripts/check-mobile-ui.cjs` | Pass: 24 screens in both themes, Android transforms, navigation/keyboard/mutation locks. |
| ESLint | Zero errors and warnings in the checked mobile/backend source and audit scripts. |
| Expo Android export | Actual Metro transformation/export succeeds. A readable JavaScript export is used to inspect bundled credentials; this is not an APK build or a change to release Hermes configuration. |
| Exported bundle scan | No private credential findings or private server credential-name references in the inspected app bundle. Public Supabase config is expected to be present. |
| `npm audit` | No valid vulnerability result. Sandbox registry request failed; the required online approval could not run because the automatic approval reviewer hit its usage limit. No dependency upgrades or `npm audit fix --force` were applied. |
| `npx expo-doctor` | Initial download attempt failed with EACCES. Running the already cached official Expo Doctor 1.20.4 locally completed **16/18** checks. Expo schema validation and React Native Directory metadata validation could not complete because network access failed. These failures are not a full clean doctor result. |
| Expo installed version compatibility | Offline `expo install --check` reports dependencies up to date, with its explicit warning that offline validation is unreliable. |

## Exact actions required before final APK

1. **Keep the public EAS build configuration current.** The 2026-10-05 build follow-up below supplies the verified public Supabase URL and client key in each `eas.json` profile, so ignored `.env` files are no longer needed for cloud builds. EAS environment variables can also be managed in the existing Expo project; keep any overlapping values consistent with the profile. Only client-public settings belong in these profiles. Never copy server/provider secrets. The build check still rejects missing/private/unapproved public configuration.
2. **Run the read-only SQL audit, review actual policies/functions, and complete two-user authorization tests**. Resolve missing/broad policies, immutable-field/transition checks, stock races and storage ownership before signing off. Keep reserved/sold transaction history and existing web/mobile behavior. Do not blindly apply a replacement policy set.
3. **Deploy the hardened AI function** to the intended Supabase project after reviewing the diff. Confirm its server-only `AI_API_URL` is HTTPS and `AI_API_KEY`/`AI_MODEL` are set in Edge Function secrets. Test unauthenticated and other-user tank requests return 401/403 without a provider call. Configure durable request/cost limits. Mobile client keys do not belong in a service-role slot, and private keys do not belong in EAS public variables.
4. **Finish push backend setup** described in [mobile-notifications.md](mobile-notifications.md). The earlier read-only deployment probe found the prepared push sender absent; this audit did not recheck/deploy it. Verify deployed sender, webhook secret, FCM v1 credentials, alert/chat/order webhooks and independent sensor alert production. A passing mock test does not prove closed-app delivery.
5. **Remove the already staged debug keystore from Git's index**, keeping the local debug file: `git rm --cached -- android/app/debug.keystore`. Check status before committing. The ignore pattern protects future additions, not the existing index. Keep release signing managed by EAS; do not export its keystore/service-account credentials into this repository. No production key rotation is indicated by the scanned files; rotate any private credential known to have escaped outside this checkout.
6. **Rerun online `npm audit` and `npx expo-doctor`** when network/approval capacity is available. Review real advisories and apply only compatible fixes; do not blindly change Expo SDK or force upgrades. Re-run the existing regression scripts after changes.
7. **Review the local HTTP provisioning exception and session-storage residual risk**. Use a trusted ESP32 hotspot/local network for current provisioning. Eliminating plaintext credentials needs firmware/TLS or an approved alternative and corresponding Android policy. AsyncStorage stays in the app sandbox, is not encrypted, and must not be treated as protected on a compromised device. A SecureStore migration needs separate migration/size/session tests. Android backup is disabled, but OEM transfer behavior should be tested on target phones.
8. **Perform the phone/API checklist below**. Build the release APK only after the release-blocking checks above are resolved and a subsequent APK build is requested.

## Short manual phone/API test checklist

- With users A and B, verify A cannot read/update/delete B's tanks, thresholds, alerts, orders, chats, private profile fields, seller profile or storage files through direct authenticated requests. Confirm anonymous private reads/mutations fail. Public active products and intended public store/images remain usable.
- Attempt forged order parties/price/status, cross-thread sender/receiver IDs and seller ownership transfers; server must reject them. Reserve simultaneously from two phones and verify stock/state consistency. Cancel normally and confirm sales/orders/history remain intact.
- Upload a normal photo; try an oversized file and disguised SVG/non-image. Try deleting another user's image through a modified storage request; server must reject it.
- Try malicious seller schemes and a public ESP32 setup URL; no unsafe navigation/credential POST. Verify ordinary local hotspot setup still works and a test redirect does not receive Wi-Fi credentials.
- Verify login survives normal app close/reopen and refresh; logout switches users cleanly. Registered/unregistered recovery submissions show the same success text. Successful web recovery removes code/tokens from the address bar/history.
- Ask a valid tank question and try another user's tank ID; authorized AI works and unauthorized access fails. Confirm threshold suggestions still need confirmation and do not directly control hardware.
- Allow notifications on a physical Android device and test chat/reservation/sensor events in background and after swiping away. Verify recipient/privacy after account switch and check Expo delivery receipts. Android Force Stop requires reopening the app; no live delivery guarantee was established here.

## Files changed

The following manifest records only this security-hardening task. Previous Marketplace/UI work is preserved. Most screen/helper changes remove raw diagnostic payloads without changing queries or behavior. Temporary export/test files are outside the workspace; dependencies and `package-lock.json` were not modified.

49 files (9 new):

- .easignore
- .env.example
- .gitignore
- android/app/build.gradle
- android/app/src/main/AndroidManifest.xml
- app.json
- app/index.tsx
- app/reset-password.tsx
- docs/pre-release-security-audit.md
- eas.json
- package.json
- scripts/check-ai-guide.cjs
- scripts/check-build-client-config.cjs
- scripts/check-mobile-notifications.cjs
- scripts/check-release-security.cjs
- scripts/check-security-hardening.cjs
- src/components/ui/NotificationBell.js
- src/context/ThemeContext.js
- src/lib/clientConfig.js
- src/lib/supabase.js
- src/screens/auth/ForgotPasswordScreen.js
- src/screens/auth/LoginScreen.js
- src/screens/auth/RegisterScreen.js
- src/screens/auth/ResetPasswordScreen.js
- src/screens/main/AddMarketplaceListingScreen.js
- src/screens/main/AddTankScreen.js
- src/screens/main/AiGuideScreen.js
- src/screens/main/AmmoniaReaderScreen.js
- src/screens/main/DashboardScreen.js
- src/screens/main/DeviceWifiSetupScreen.js
- src/screens/main/MarketplaceChatScreen.js
- src/screens/main/MarketplaceProductDetailsScreen.js
- src/screens/main/MarketplaceScreen.js
- src/screens/main/ReportsScreen.js
- src/screens/main/SettingsScreen.js
- src/screens/main/TankDetailsScreen.js
- src/screens/main/settings/DefaultThresholdsScreen.js
- src/screens/main/settings/EditProfileScreen.js
- src/screens/main/settings/SecurityScreen.js
- src/screens/main/settings/SellerProfileScreen.js
- src/services/aiGuideService.js
- src/utils/ammoniaReadings.js
- src/utils/ammoniaScanner.js
- src/utils/deviceUrls.js
- src/utils/sensorAlertRules.js
- src/utils/thresholdSettings.js
- src/utils/uploadSecurity.js
- supabase/audits/pre-release-authorization.sql
- supabase/functions/craythrive-ai-guide/index.ts

## EAS build failure follow-up — 2026-10-05

The post-install hook failed because `.env` was correctly excluded from the build archive but the build profiles did not supply the required public Supabase settings. The `NODE_ENV` message came from Expo's local dotenv loader; it was not the configuration rejection itself.

- `eas.json`: supplied only the locally verified HTTPS public Supabase endpoint and public client key in development, preview and production profiles. These settings are already intentionally embedded in the mobile client; no private key or `.env` file is uploaded.
- `scripts/check-build-client-config.cjs`: cloud checks use the provided build environment directly. Local dotenv loading is silent. Missing endpoint/key, malformed or credential-bearing URLs, private keys and unapproved public variables produce specific errors without exposing values.
- `scripts/check-security-hardening.cjs`: added subprocess checks for all three actual profiles with `EAS_BUILD=true` and no `NODE_ENV`, plus rejected-config/redaction cases. Cloud-mode checks deliberately ignore the local `.env`.
- `docs/pre-release-security-audit.md`: recorded this repair and updated the public build-configuration prerequisite. The earlier 49-file manifest describes the original security task; this follow-up changed only these four files.

No APK build, remote environment mutation, database change or function deployment was performed by this repair. The other release verification items above still require their documented checks.

Validation passed: the actual npm post-install command, syntax checks for both changed scripts, all three cloud-mode profile checks and seven rejected-config cases, the installed EAS CLI configuration schema, security-hardening regressions, scoped ESLint (zero errors/warnings), and the redacted credential scan (zero private-value findings).

## References

- [Expo public environment variables](https://docs.expo.dev/guides/environment-variables/): `EXPO_PUBLIC_*` values are included in application code.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): publishable/legacy anon keys are client-safe; secret/service-role keys bypass RLS and belong on servers.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control): database/storage policy enforcement is required regardless of mobile checks.
- [Expo SDK 54 fetch](https://docs.expo.dev/versions/v54.0.0/sdk/expo/) and the locally installed native implementation were checked for redirect handling. This avoids depending on the legacy React Native XMLHttpRequest fetch behavior for credential-bearing provisioning requests.
- [Android Auto Backup](https://developer.android.com/identity/data/autobackup): backup configuration and device-specific transfer behavior require care with persisted sessions.
