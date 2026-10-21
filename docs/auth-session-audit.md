# Mobile authentication session audit

Implemented October 13, 2026. Scope: this Expo mobile repository only.

## Findings

- There is one application Supabase client, `src/lib/supabase.js`. Native persistence already used AsyncStorage with `persistSession: true`, `autoRefreshToken: true`, and URL session detection disabled. Persistence was retained without changing its storage key, so existing installations can restore their saved login.
- Ordinary logout called `signOut()` without a scope. Supabase defaults to global sign-out, so that operation could revoke the same account's web refresh session. Settings performed logout and then invoked the root logout handler, resulting in a second logout and push-token cleanup.
- Native AppState handling existed, but it ran before asynchronous Supabase initialization finished. The installed SDK starts a native refresh ticker during initialization, which could restart refreshing after an early background stop. Native auth operations also lacked the SDK's supported process lock.
- Startup already called `getSession()` and gated initial navigation. Error handling treated every restoration failure as retryable, including confirmed invalid sessions. Retrying rebuilt the navigation auth subscription. Login success callbacks could enter the main shell independently of session state.
- Monitoring performed a server `getUser()` lookup on resume and cleared the owner/readings for any lookup error. A temporary connection failure therefore looked like missing authentication. A null `INITIAL_SESSION` could also clear monitoring despite a recoverable refresh failure.
- The dashboard loaded its profile and tank list only on mount or manual refresh. If its initial offline load produced no tank IDs, no monitoring subscription existed to trigger recovery. Some early asynchronous profile/error/loading writes lacked the existing generation guard.
- No mobile login code intentionally revokes another platform's session. The deployed project's single-session policy cannot be established from this repository: its local Supabase config contains function settings, not the hosted Auth configuration.

The audit covered the shared client; root navigator/layout; Splash and Landing; Login, Register, Forgot Password and Reset Password; Settings logout; monitoring, threshold and activity hooks; Dashboard, Tank Details and Reports; alert/marketplace subscriptions; push registration/cleanup; and the AI service's supported SDK refresh calls. Existing screen subscriptions have distinct data responsibilities and cleanup; they are not competing token refresh loops. MainShell stays keyed by authenticated user ID and unmounts on logout/account change, clearing screen state and subscriptions. No separate AuthContext was introduced.

## Final behavior

`useAuthSession` owns one navigation auth subscription and an explicit initial `getSession()` read. Splash/loading remains visible until that read completes or an authoritative auth event supplies the result. Startup failures caused by storage/network/server problems show the existing retry UI; foregrounding also retries. Retry requests coalesce without registering another auth listener. Revision guards prevent older restore responses from undoing a new login or logout. Confirmed invalid/revoked refresh sessions require login; recoverable failures retain the current identity and do not call sign-out or erase storage.

Supabase continues to store and refresh its own session through native AsyncStorage. The native client uses `processLock`. One client-level AppState listener resumes auto-refresh when active and stops it when inactive/backgrounded, applying the current state after SDK initialization. Fast Refresh disposal removes the listener and stops the old ticker, including an initialization that completes after disposal. Screen-level AppState listeners refresh data; they do not start token timers.

The root navigator owns ordinary sign-out and push-token deactivation, coalesces repeated taps, and uses `{ scope: 'local' }`. Settings delegates to it. Password recovery completion also signs out its current recovery session locally. A signed-out main shell is no longer rendered while navigation state catches up. Login/registration callbacks cannot enter the dashboard without an authenticated session.

Monitoring uses the SDK's current session to identify the owner; database reads remain constrained by user/tank/device IDs and existing RLS. Recoverable identity errors retain saved snapshots and report unavailable refresh. Backgrounding removes the current monitoring channel; resuming recreates it and rereads current sensor/ammonia data. Realtime's existing reconnect/status handling and foreground polling recover interrupted connections. Generation guards discard obsolete account/tank responses.

The dashboard retries profile/tank loading on foreground entry. Its one-minute foreground retry runs only while a dashboard load has failed; a healthy screen retains the existing monitoring-only polling. Additional guards prevent stale profile, error, and loading updates after cleanup. These refreshes do not issue equipment commands or change sensor calculations.

Web and mobile independently sign in with the same account and user ID, keeping separate SDK sessions in their own storage. No tokens are transferred between them. The mobile repository's existing browser password-recovery URL behavior was preserved. The separate web dashboard, database policies/schema, hardware logic, calibration, and thresholds were not changed.

## Changed files

| File | Change |
| --- | --- |
| `src/lib/supabase.js` | Native process lock and initialization-safe refresh lifecycle |
| `src/hooks/useAuthSession.js` | Session restoration, auth events, recoverable state, retry and cleanup |
| `app/index.tsx` | Session-driven navigation and single local logout handler |
| `src/screens/main/SettingsScreen.js` | Delegate logout once and coalesce repeated taps |
| `src/screens/auth/ResetPasswordScreen.js` | Local recovery-session sign-out with error handling |
| `src/hooks/useMonitoringSync.js` | Preserve identity/readings on connection errors and recreate monitoring channel on resume |
| `src/screens/main/DashboardScreen.js` | Foreground/failed-load recovery and additional stale-response guards |
| `scripts/check-auth-sessions.cjs` | Offline auth SDK, lifecycle, navigator and dashboard regression tests |
| `scripts/check-monitoring-sync.cjs` | Updated session fixtures, resume subscription count and connection-failure regressions |
| `scripts/check-mobile-ui.cjs` | Allow the harness to use installed SDK error type helpers |
| `docs/auth-session-audit.md` | Audit, validation results and manual acceptance checklist |

## Validation

- `node scripts/check-auth-sessions.cjs`: passed. Exercises startup gating, retry coalescing, offline recovery, late restore/login/logout races, invalid-session handling, token events, listener cleanup, native client persistence/configuration, AppState ordering, actual navigator transitions, local logout coalescing, dashboard recovery and owner-scoped queries. Uses the installed Supabase SDK against an offline fixture server to verify independent device sessions, reopening persistent storage, access-token expiry refresh, local logout preserving web refresh, and confirmed revocation removing the saved session.
- `node scripts/check-monitoring-sync.cjs`: passed. Covers realtime INSERT/UPDATE, request coalescing, tank/account isolation, reconnect/polling, foreground refresh, retained snapshots on connection errors, obsolete responses and subscription cleanup. No live device/database operations.
- `node scripts/check-mobile-ui.cjs`: passed, including 83 source transforms/import checks, all 24 screens in light/dark mode, interaction/rapid-tap checks and mobile ESLint with zero warnings/errors.
- `node scripts/check-security-hardening.cjs`: passed, including public configuration guards, credential-free logs, password recovery and EAS configuration checks.
- `npm run lint`: passed.
- `node scripts/check-build-client-config.cjs`: passed without printing configuration values.
- `expo export --platform android --output-dir dist/auth-session-check --max-workers 1`: passed; 1,460 modules bundled and a Hermes Android artifact produced. This verifies release JavaScript bundling, not native APK installation or execution.
- `tsc --noEmit`: still fails on pre-existing typing issues: the startup `AppScreen` call's inferred required `onBack` prop, the AI Guide's inferred null-only `initialTankId` prop, and Deno Edge Function/archived server sources included by the broad mobile tsconfig (missing Deno globals and HTTPS module types). The new auth hook's session type is annotated; there are no additional auth type errors in the final check. These unrelated type/configuration issues were not expanded into this task.

## Required live acceptance tests

Use an authorized test account and an Android preview/release installation. Fixture tests do not establish the hosted project's policy or physical-device behavior.

1. Inspect hosted Supabase Auth session settings. Report whether **Single session per user** is enabled. Independent simultaneous sessions require a policy that permits them; do not bypass that setting or alter token/security protections. This setting was not remotely inspected or changed here. The separate web application's logout scope also remains outside this task.
2. Sign in on mobile, then sign in on the existing web dashboard with the same account. Verify both remain authenticated and can refresh data. Repeat with web signed in first. Verify the account's profile and owned tanks match on both.
3. Force-close and reopen mobile, then restart the phone and reopen it. Verify a still-valid stored session opens Dashboard without a Login flash. Repeat after the access token expires while the refresh session remains valid.
4. Background and resume the app, including leaving it backgrounded past access-token expiry. Verify refresh resumes, current sensor/ammonia readings reload, and only one monitoring channel per mounted hook remains active.
5. Switch between Wi-Fi and mobile data. Disconnect temporarily during use and during startup. Verify no premature logout; an expired offline startup stays recoverable, and retry/foreground restores it when connected. Check an initially failed empty-dashboard load recovers automatically.
6. Sign out on mobile through Settings. Verify mobile returns to Landing and clears user data/subscriptions, its push token is deactivated when reachable, and the existing web session can still refresh. Signing out while offline can report a retryable failure; it does not silently erase a session that could not be revoked.
7. Revoke only the test mobile session through authorized Supabase administration, then trigger expiry/refresh. Verify it requires reauthentication and previous account results cannot reappear. Sign in as another test account and verify profile, tanks, alerts, marketplace and AI state belong to that account.
8. Build/install the Android preview and release APKs with the existing EAS profiles. Check login, registration/email verification, password recovery, local logout, notifications, monitoring, marketplace, AI Guide and equipment controls on device. No cloud build or live hardware action was submitted by this audit.

Reference behavior: [Supabase local sign-out scope](https://supabase.com/docs/reference/javascript/auth-signout), [React Native persistence and AppState](https://supabase.com/docs/guides/auth/quickstarts/react-native), and [hosted session policies](https://supabase.com/docs/guides/auth/sessions). Implementation details were also checked against installed `@supabase/auth-js` 2.105.0 source.
