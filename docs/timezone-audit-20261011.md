# Philippine timezone audit — October 11, 2026

## Result and scope

The available Expo React Native application now formats timestamps using the explicit IANA timezone `Asia/Manila`. Report calendar days use Philippine midnight boundaries, and important client time decisions use the existing authenticated PostgreSQL clock RPC rather than the device wall clock. Stored timestamps retain their original UTC/offset instants.

The separate React + Vite dashboard source was not available in the inspected project locations. Its folder path was requested. No claim is made that this separate website has been corrected or tested. The new portable formatter module has no React Native dependencies and can be shared unchanged with that project. Exporting this Expo app for web is not verification of the separate Vite application.

No APK was built. No sensor values, thresholds, hardware pins, pump behavior, feeding schedules, authentication rules, realtime subscriptions, database timezone or existing business records were changed. The AI Edge Function prompt was deployed successfully as version 16 with JWT verification enabled.

## Confirmed causes before changes

- Screen formatters relied on implicit device-local timezone formatting. The same stored instant could therefore display differently on two devices.
- Report day grouping, weekday labels and the rolling report cutoff depended on the device's local calendar/current date. The queries lacked a consistent Philippine calendar interval with an exclusive upper bound.
- Relative ages and chat Today/Yesterday labels depended on the device clock. Chat message dates could cross different calendar days on different devices.
- Alert cooldown cutoffs, alert resolution timestamps, push-token last-seen timestamps and chat read receipts used device-generated times.
- Some merged history sorting depended on timestamp parsing without a single explicit-offset policy. Equivalent instants expressed with different offsets needed numeric chronological comparison.
- Ammonia alert message bodies contained raw canonical UTC scan timestamps, even after their surrounding alert date was formatted. They now convert only for display, preserving the saved deduplication identity.
- The AI prompt did not explicitly require Philippine time when presenting context timestamps.

## Application policy and flows

`src/utils/philippineTime.js` owns timestamp parsing, formatting, Philippine calendar keys, day arithmetic, report bounds and chronological comparisons. Formatting forces `Asia/Manila` even if a caller supplies another timezone. Invalid, date-only or timezone-less event timestamps are not guessed; they receive existing neutral placeholders. A calendar date is processed separately from an event instant.

For October 11, 2026, the query interval is:

```text
created_at >= 2026-10-10T16:00:00.000Z
created_at <  2026-10-11T16:00:00.000Z
```

This includes all of the Philippine date, including PostgreSQL microsecond precision, without including the next midnight. The existing seven-day report now covers today and the preceding six Philippine calendar dates. Sensor, ammonia, control-log and alert queries use the same boundaries; latest current readings remain independent of the report window.

`src/utils/serverClock.js` calls the already existing `public.craythrive_server_time()` and advances that verified instant using `performance.now()`. There is no device wall-clock fallback. Dashboard, tank details and AI loading attempt synchronization without blocking saved-reading display. Relative dates fall back to absolute Philippine dates if no verified clock is available. Reports require a verified server date. Clock-dependent alert writes and read-receipt updates are skipped if the RPC fails rather than writing invented times. Push registration follows its existing failure/retry path if server time cannot be obtained.

New event creation continues to omit `created_at` and use database defaults. Alert `resolved_at`, chat `read_at` and push token `last_seen_at` updates now use a fresh database-clock RPC result. They are server-derived instants supplied by the updated client, not new database triggers. Existing database update triggers remain in place.

Sensor history and manual ammonia scans remain separate events, with their own authoritative timestamps. Their values are untouched. Histories and chat timelines sort by parsed instants rather than formatted text; report alerts and activity logs retain descending database `created_at` ordering.

The AI receives original canonical timestamps and separate sensor/scan context. Its prompt requires conversion to Philippine time for presentation and forbids treating a device clock as authority or inventing a current date. Ephemeral chat UI timestamps use the synchronized clock when available. Model output still requires normal human review; a prompt is not a guarantee of every generated sentence.

## Database audit and SQL

Live metadata was inspected for project `abtzkqfrwzcocyrwcrfc`, including timestamp column types/defaults, relevant triggers and time-related functions. All inspected public timestamp columns use `timestamp with time zone`; none use `timestamp without time zone`. Inspected `created_at` columns already default to `now()`.

Relevant fields include:

| Area | Tables and timestamp fields |
| --- | --- |
| Water and manual scans | `sensor_readings.created_at`, `ammonia_readings.created_at`, `turbidity_readings.created_at` |
| Alerts | `alerts.created_at`, `alerts.resolved_at` |
| Activity and feeding/automation history | `control_logs.created_at`, `device_commands.created_at/updated_at/executed_at`, `tank_automation_logs.created_at` |
| Reports | The sensor, scan, control-log and alert fields above |
| Marketplace | `marketplace_orders.created_at/updated_at`, listing timestamps, thread `created_at/updated_at/last_message_at/closed_at` and deletion timestamps, message `created_at/updated_at/read_at` |
| Device registration | `push_tokens.created_at/updated_at/last_seen_at`; device/camera last-seen fields |
| Tank/account/settings records | Existing `created_at/updated_at` fields and `tank_threshold_settings.pending_ai_suggested_at` |

There is no dedicated feeding-history table in the audited public schema; relevant events use commands/control/automation logs. No historical timestamp reinterpretation or conversion is necessary based on the inspected column types.

The existing `craythrive_server_time()` returns `clock_timestamp()` as `timestamptz`, with authenticated/service-role execution and a restricted search path. It was reused without modification. Creation defaults use transaction `now()`; the clock RPC can advance within that transaction, which is expected.

**SQL migrations required: none. SQL migrations applied: none. Database timezone remains UTC.**

Two SQL artifacts were added separately from application code:

- `supabase/audits/audit-timestamp-policy.sql`: read-only metadata inspection.
- `supabase/audits/test-timestamp-policy.sql`: rollback-only integration checks using a synthetic authenticated account and tank. It inserts no sensor readings, alerts or commands, and rolls back all synthetic rows. This passed against the live database.

Defaults do not forbid an older or modified client from explicitly supplying `created_at`. The verified guarantee here is that the audited updated client omits event creation timestamps; strict enforcement against arbitrary writers would be a separate database policy change.

## Firmware inspection

No firmware is present inside this mobile repository. These available downloaded samples were inspected read-only:

- `ESP32_sensorhub_v1_16_1_uno_link_grace/ESP32_sensorhub_v1_16_1_uno_link_grace.ino`
- `craythrive_esp32_sensor_v1_9/craythrive_esp32_sensor_v1_9.ino`
- `CrayThrive_Actuator_v1_23_0_combined_critical_rules/CrayThrive_Actuator_v1_23_0_combined_critical_rules.ino`

The inspected sensor uploads omit `created_at`, leaving event creation to PostgreSQL. The actuator sample uses NTP (`pool.ntp.org` and `time.nist.gov`), Philippine local time for calendar/scheduled feeding decisions, and `gmtime_r` with a `Z` suffix for emitted UTC timestamps. Its Philippine daily UTC queries already use inclusive start/exclusive end. Elapsed hardware cooldowns use `millis()`. No firmware change was needed in these samples. The firmware version actually installed on the hardware has not been confirmed.

## Modified files (24)

Application and Edge Function (14):

1. `src/utils/philippineTime.js` — new portable Philippine time policy.
2. `src/utils/serverClock.js` — new existing-RPC clock wrapper.
3. `src/utils/thresholdSettings.js` — ammonia scan's own Philippine timestamp.
4. `src/utils/sensorMonitoring.js` — numeric chronological history ordering.
5. `src/utils/sensorAlertRules.js` — database-clock cooldown and resolution timestamps.
6. `src/utils/pushNotifications.js` — database-clock last-seen updates.
7. `src/components/ui/NotificationBell.js` — Philippine alert date and embedded scan timestamp display.
8. `src/screens/main/DashboardScreen.js` — synchronized relative ages and Philippine absolute fallback.
9. `src/screens/main/TankDetailsScreen.js` — Philippine display and synchronized relative ages.
10. `src/screens/main/AiGuideScreen.js` — Philippine display and synchronized ephemeral chat timestamps.
11. `src/screens/main/ReportsScreen.js` — Philippine calendar intervals, grouping, formatting and chronology.
12. `src/screens/main/MarketplaceScreen.js` — Philippine order/listing date display.
13. `src/screens/main/MarketplaceChatScreen.js` — Philippine day separators, chronology and server-derived read receipts.
14. `supabase/functions/craythrive-ai-guide/index.ts` — explicit Philippine display policy in the AI prompt.

Verification and documentation (10):

15. `supabase/audits/audit-timestamp-policy.sql`
16. `supabase/audits/test-timestamp-policy.sql`
17. `scripts/check-sensor-monitoring.cjs` — clock RPC and exclusive-bound query fixtures.
18. `scripts/check-mobile-ui.cjs` — authenticated clock RPC fixture.
19. `scripts/check-ammonia.cjs` — explicit verified report reference date.
20. `scripts/check-mobile-notifications.cjs` — server-clock fixture and last-seen assertion.
21. `scripts/check-marketplace.cjs` — portable time/clock import fixtures.
22. `scripts/check-ai-guide.cjs` — synchronized clock in the extracted-handler fixture.
23. `scripts/check-philippine-time.cjs` — new acceptance/regression tests.
24. `docs/timezone-audit-20261011.md` — this report.

## Validation

Passed:

- `node scripts/check-philippine-time.cjs`: actual utility/screen behavior, 12:00 UTC to 8:00 PM, Manila/New York/Tokyo/London/UTC process timezones, falsified device clock, exact inclusive/exclusive date bounds, leap/calendar boundaries, report queries and day grouping, chat ordering/separators/read receipts, scan history identity and alert cooldown/resolution timestamps.
- `node scripts/check-sensor-monitoring.cjs`
- `node scripts/check-ammonia.cjs`
- `node scripts/check-mobile-notifications.cjs`
- `node scripts/check-marketplace.cjs`
- `node scripts/check-per-tank-thresholds.cjs`
- `node scripts/check-pump-wording.cjs`: 29 wording cases and real mobile alert feeds; hardware behavior unchanged.
- `node scripts/check-ai-conversations.cjs`
- `node scripts/check-ai-guide.cjs`
- `node scripts/check-ai-request-budget.cjs`
- `node scripts/check-mobile-ui.cjs`: 71 source-file transforms/imports, all 24 screen renders and existing UI behavior checks.
- `npm.cmd run lint`: zero errors/warnings.
- Deno cached type check of the AI Edge Function.
- Expo production export for Android and web (JavaScript/assets only).
- Live rollback-only SQL timestamp integration checks.
- Deployed AI function version 16 active with JWT verification enabled.

No real push was sent, no billable AI-provider request was made, and no hardware command was issued for these tests.

## Remaining verification and how to reproduce

1. Provide the React + Vite project folder so its formatters, filters and event creation can be corrected using the same module. Compare the exact same sensor reading ID there and in the updated mobile app; this cross-project acceptance test remains pending.
2. On an updated mobile build, display a record with `created_at = 2026-10-11T12:00:00Z`. It must show October 11 at 8:00 PM Philippine time. Change the device timezone to New York, Tokyo and London; the displayed date/time must remain identical. Existing installed APKs do not automatically receive these local code changes.
3. Verify a report's October 11 selection includes `2026-10-10T16:00:00Z` through just before `2026-10-11T16:00:00Z`. The current mobile report UI is a seven-day view; the portable single-date helper is acceptance-tested for a date-picker integration in the missing website.
4. Change the device clock while keeping a valid authenticated session, create a test tank/scan, and inspect the returned database `created_at`. It must reflect database time. The automated rollback test already confirms the database default. Arbitrary clock changes can still affect OS TLS or authentication SDK expiry/refresh; authentication behavior was intentionally preserved.
5. Check alerts/activity logs and a chat thread spanning Philippine midnight for chronological order and consistent dates. A manually scanned ammonia result must retain its own scan time without duplication into water history.
6. Confirm actual installed firmware versions, NTP synchronization after Wi-Fi reconnect/reboot, and scheduled feeding against Philippine time. The downloaded samples are not proof of the active firmware.

Remaining `Date.now()` uses in the mobile source are local IDs/file names/channel names and existing authentication session-expiry preflight. The scanner's provisional `measuredAt` metadata is not persisted or used as a displayed authoritative event time; saved scans use the returned database `created_at`. Server-side Edge Function clocks remain server clocks. No artificial ammonia stale-time limit was introduced.
