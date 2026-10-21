# Fix #7 monitoring synchronization — October 12, 2026

Implemented in the available Expo application: Dashboard, Tank Details, Reports, AI Guide and Tank Details recommendations use the same scoped reading service and evaluator. **The separate React + Vite source is unavailable**, so its environment, queries, rendering and realtime behavior cannot be verified or changed. Expo web export is validation of this application, not a substitute for fixing the separate Vite dashboard.

## Audit and root causes

The mobile public endpoint points to Supabase project `abtzkqfrwzcocyrwcrfc`. A read-only Management API metadata/aggregate audit of that project verified the actual columns, pairing roles, indexes and realtime publication. See [audit-monitoring-sync.sql](../supabase/audits/audit-monitoring-sync.sql). No individual account data, measured values or credentials are included in this report.

Confirmed mobile causes of inconsistent/stale presentation:

1. Dashboard, Reports and AI Guide loaded monitoring values on screen load/manual refresh, while recommendations independently refreshed their own readings. Two panels could observe different database versions. They now share the lifecycle in [useMonitoringSync.js](../src/hooks/useMonitoringSync.js); Tank Details recommendations share its guarded screen snapshot.
2. Sensor queries selected by user/tank without consistently constraining the currently paired sensor. A former device's newer upload could be selected. [sensorMonitoring.js](../src/utils/sensorMonitoring.js) now checks the owned, claimed sensor binding, its UID and the returned device ID.
3. Latest-selection paths lacked a common stable ID tie-breaker, and AI context used its own query/array selection. All current-reading paths now use `created_at DESC, id DESC`. No timestamp ties were found in the audited data; this was a selection vulnerability, not an observed tie incident.
4. Numeric fallback could revive a legacy alias when an authoritative canonical field was explicitly null/invalid. [thresholdSettings.js](../src/utils/thresholdSettings.js) preserves canonical nulls. The audited rows had no canonical-null/legacy-nonnull cases; this protects future incomplete/error uploads rather than claiming those cases caused the reported mismatch.
5. Cached tank props and delayed loads could outlive a tank/account selection or a newer refresh. Tank Details starts without cached measurements; request versions, tank identity, auth epochs and cleanup prevent obsolete responses from replacing accepted monitoring state.

These are proven differences in the available mobile paths. The exact cause of a specific Web-versus-Mobile mismatch remains unproven until the Vite endpoint, tank/device identity and selected reading IDs can be compared.

Audit observations: 1,167 sensor rows; no missing `device_uid` or `iot_device_id`; no timestamp ties or ambiguous claimed sensor pairings at audit time. Device roles include sensor, actuator and camera hubs. `sensor_readings` and `ammonia_readings` are realtime-published. Threshold tables and `iot_devices` are not currently published; active polling provides recovery for those changes. Existing tank/time and user/time indexes are retained.

## Authoritative query and mapping contract

The strategy is **one latest eligible sensor row**, not latest-valid-per-parameter backfilling. An incomplete newest row stays incomplete; a pH value from an older row is never silently joined to a newer timestamp. Ammonia is the explicit exception: a separate saved test event, with its own ID, timestamp and source description.

Sensor queries require the signed-in `user_id`, exact `tank_id` and current sensor `device_uid`. Returned rows also undergo owner/tank/device and explicit timestamp validation. An `iot_device_id` that disagrees with the paired registry ID is rejected. No unique sensor binding, or multiple sensor bindings, yields no current sensor measurement; an actuator/camera is not selected as a sensor. Pairing/claim behavior itself is unchanged.

Ammonia queries require the same owner/tank and use the same ordering, independent of any camera/device pairing. Numeric zero is valid; missing/invalid values remain missing. Composite display objects are never saved as historical rows. The database currently does not persist which phone/manual input method was used by current inserts: the UI says that the input method was not recorded instead of guessing. Explicit available manual/phone/legacy-device source metadata is respected.

| Parameter | Canonical field | Unit / interpretation | Legacy aliases only when canonical property is absent |
| --- | --- | --- | --- |
| Temperature | `temperature_c` | °C | `temperature`, `temp_c`, `temp` |
| pH | `ph_value` | pH, no voltage unit | `ph`, `pH`, `phLevel` |
| Turbidity / clarity | `turbidity_voltage` | V; lower is unsafe in existing calibration | `turbidity_v`, `turbidity` |
| Water | `water_depth_cm` | cm of depth | `water_level` |
| Ammonia | `ammonia_readings.ammonia_level` | ppm, saved test; higher is unsafe | existing numeric scan aliases |

`ph_voltage`, `water_distance_cm`, raw ADC columns and `raw_payload` remain diagnostic/source-health metadata; they do not become calculated pH, depth or turbidity voltage. Explicit canonical nulls/invalid values do not fall through to aliases. Values and status presentation retain the shared two-decimal formatter and Asia/Manila timestamp utilities. Sensor cards show the reading time; ammonia shows its own scan time/source. Original database values and timestamps remain unchanged.

## State, thresholds and realtime

`useMonitoringSync` subscribes to owner-filtered changes, checks the changed tank, and rereads authoritative scoped rows on INSERT/UPDATE. It also handles deletion notifications where delivered. It does not trust event arrival order or merge an event payload into a different tank. Reads are serialized/coalesced; a response invalidated by a queued event, navigation, auth change or unmount cannot commit. Explicit loader versions protect against slower initial/manual responses. A newer authoritative empty result is allowed, so removal/unpairing is not masked by retained cache.

Reconnect (`SUBSCRIBED`), foreground resume, authentication changes and an active-only 60-second fallback refresh recover missed changes. Repeated renders do not add channels. Channels, timers and auth/AppState listeners are cleaned up. Failures show a readable message; failed recommendation refreshes cannot establish a current Normal condition. Periodic/realtime observation does not reload profiles, alerts, controls or the full page, and never issues hardware commands or alert writes. Existing explicit-load alert reconciliation is retained.

Effective safe settings continue to use Fix #2's owned tank row → account row → existing system defaults. Optional Critical/age settings retain Fix #3's field-level tank/account inheritance. Cards, AI context and deterministic recommendations use the existing shared evaluator. There are **no new biological boundaries or default age windows**. Unconfigured Critical limits require configuration; safe saved values without an age policy remain recency-unverified. Uploaded error/stale/last-good flags and configured expiry remain neutral. Server time and the shared Philippine formatter are retained.

Reports use the same eligible source for current readings and separate event histories for the selected Philippine reporting window. Current values are not limited to that report window. Existing bounded history retrieval remains capped at 1,000 rows per source/tank; exhaustive high-frequency history pagination remains outside this change.

## Modified files

Web (separate Vite application): none; source unavailable.

Mobile:

- `src/utils/sensorMonitoring.js`: canonical scoped service, stable selection, source identity, separate ammonia, request-version merges.
- `src/utils/thresholdSettings.js`: canonical-null handling and ammonia source metadata in the existing evaluator.
- `src/hooks/useMonitoringSync.js` (new): shared read-only synchronization lifecycle.
- `src/hooks/useTankRecommendationData.js`: wrapper around that lifecycle.
- `src/screens/main/DashboardScreen.js`, `TankDetailsScreen.js`, `ReportsScreen.js`, `AiGuideScreen.js`: shared reads/refresh and stale-response guards.
- `src/components/tank/SensorReadingCard.js`: source/time display; `TankRecommendations.js`: shared Tank Details snapshot.
- `src/services/aiGuideService.js`: same authoritative current/history reading service.

Database/query artifacts:

- `supabase/audits/audit-monitoring-sync.sql` (new, read-only audit).
- `supabase/setup/configurable-classification.sql`: the **previously pending Fix #3 draft** now selects the same current sensor identity and preserves canonical nulls in alert reconciliation. Its isolated PostgreSQL tests pass. It has **not been applied live**.
- No new deployed migrations, live DDL, RLS changes, historical updates or calibration changes.

Validation files: new `scripts/check-monitoring-sync.cjs`; existing fixtures updated in `check-sensor-monitoring.cjs`, `check-ammonia.cjs`, `check-sensor-recommendations.cjs`, `check-philippine-time.cjs` and `check-classification-sql.cjs` to identify the paired sensor and reflect the shared hook state.

## Validation and remaining work

Offline checks pass:

- Monitoring sync: exact owner/tank/device filtering, stable timestamp/ID selection, canonical nulls/raw-field separation, independent zero/older ammonia, immutable measurements, ambiguous pairing, INSERT/UPDATE, response coalescing, reconnect, resume, threshold polling, errors, auth races and cleanup.
- Sensor monitoring and ammonia integration: actual screen loaders/cards and AI context agree; no cross-tank/current-history mixing or fake scan timestamp.
- Classification, safe ranges and per-tank thresholds: boundary equality, configuration-required/neutral states, inheritance and isolation.
- Recommendations, AI Guide and AI request budget: deterministic evaluation, optional explanation, safe context and existing request behavior.
- Activity history and Philippine-time tests: unchanged history outcomes, server-time authority and timezone/day boundaries.
- Isolated PostgreSQL (`check-classification-sql.cjs` with temporary `PGLITE_MODULE`): pending migrations apply/reapply, JS/SQL parity, ownership/inheritance, incident deduplication and recovery. No live Supabase writes.
- ESLint: zero errors/warnings. Expo transforms and responsive mobile UI checks cover both themes.

Android and Expo web exports pass at `%TEMP%\craythrive-monitoring-sync-20261012`; this is a JS/assets export, not an installed APK. All 24 screens pass the offline light/dark UI render check. Physical phone/browser reconnection and automation acceptance have not been executed against hardware.

Pending: obtain the Vite source and compare its public endpoint/reading IDs against this documented contract; review/apply the previous Fix #3/#6 SQL drafts and deploy the prepared AI Edge changes; configure verified Critical boundaries/reading ages; then validate both actual clients against the same live rows. Until rollout, existing live alert producers remain the previous backend implementation. Firmware, pump/feeder interlocks, wiring, sensor calibration, authentication and marketplace flows are unchanged by Fix #7.
