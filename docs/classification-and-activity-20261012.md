# Fix #3 and Fix #6 implementation — October 12, 2026

Update: [Fix #7 synchronization](monitoring-sync-20261012.md) now centralizes mobile reading queries, paired-sensor identity, response guards and realtime refresh. The pending classification SQL draft was aligned with the same source selection/canonical-null rules; it remains unapplied live.

The approved Fix #3 application changes and Fix #6 activity timeline are implemented and tested in the available Expo project. **Live activation is pending review/application of the two concrete SQL drafts below.** The AI Edge Function changes are prepared but not deployed. No live database writes, historical backfill, hardware commands, firmware changes, APK build, or installation were performed.

The separate React + Vite project is unavailable. Expo Android and web exports pass, but exporting Expo web does not implement the separate Vite Dashboard/Tank Details. Those changes and actual cross-application acceptance remain pending.

There is no separate readable Fix #5 specification in the available context. Existing deterministic recommendations and optional AI explanation are retained. AI explanations do not execute controls or apply settings.

## Findings

- Mobile previously derived Critical boundaries using offsets/multipliers from safe values. Database alerts used uploaded firmware classifications and fixed ammonia cutoffs. These policies could disagree.
- No verified separate Critical boundaries or approved per-parameter reading-age windows were found. Downloaded firmware constants do not establish biological validity or the installed firmware version. None were adopted as new defaults.
- Safe settings already support canonical owned-tank rows, account fallback and existing system defaults. Turbidity is voltage: lower voltage is unsafe. Ammonia is a separate manual/scan event in ppm, with higher values unsafe.
- Activity is spread across control logs, commands, raw automation logs, notifications and ammonia tests. An automation mirror can map unfamiliar outcomes to `done`. A command's saved completion or an alert title does not establish physical water flow or food delivery.
- Some existing command/control SELECT policies are broad; automation tables lack RLS. The new history endpoint explicitly checks tank ownership and projects allowed fields. Its draft also adds restrictive authenticated read guards for commands/control logs. It does not claim to repair legacy anonymous device access or every automation-table policy.

Read-only schema/function audits were used to prepare these changes. See the original [classification audit/proposal](classification-proposal-20261011.md), [classification audit SQL](../supabase/audits/audit-classification-policy.sql), and [activity audit SQL](../supabase/audits/audit-activity-history.sql).

## Classification and inheritance

The portable classifier and shared sensor evaluator now serve cards, recommendations, AI context and alert fixtures. The SQL draft implements the same effective values and boundary comparisons for notification producers.

| Input | Display/evaluation |
| --- | --- |
| Valid, current, within inclusive safe bounds | Normal / green |
| Outside safe bounds, before configured Critical boundary | Warning / yellow-orange |
| At or beyond configured unsafe Critical boundary | Critical / red; lower `<=`, upper `>=` |
| Outside safe bounds without that direction's Critical boundary | Requires configuration; no invented cutoff |
| Missing, invalid, explicitly stale, unpaired sensor, or expired | Neutral; cannot establish current Normal |
| Safe saved value without an age policy | Neutral Recency unverified |

Unsafe saved values without an age policy explain that the result is from a saved reading and current recency is unverified. Configured expiry takes precedence over numeric severity: an expired scan is Stale, not a live Critical/Normal measurement. Uploaded source error/stale/last-good flags override presentation validity, while raw directional firmware statuses remain unchanged in storage.

Safe values retain the existing **row-level** resolution: tank row, otherwise account row, otherwise existing system defaults. The new optional fields use **field-level** resolution: tank numeric override, otherwise account numeric value, otherwise unconfigured. These fields are water safe maximum, supported lower/upper Critical boundaries, and the five maximum-reading-age settings. Clearing a tank field inherits its account value; clearing an account field leaves it unconfigured unless a tank overrides it.

Creating the first tank-specific row preserves existing safe values and stores only explicitly entered optional overrides. Account optional fields remain inherited. Subsequent legacy safe-only writes retain the optional settings. Invalid ordering, nonfinite values and nonpositive ages are rejected; lower Critical must be below safe minimum and upper Critical above a configured safe maximum. No biological values or expiry times are prefilled.

Settings > Tank monitoring settings exposes This tank / Account defaults with units, effective values and inheritance sources. Saving calls an authenticated owner-checked RPC. Until the SQL is applied it reports that the database update is pending and saves nothing. Existing realtime, 60-second fallback polling and foreground refresh update affected tank displays; errors do not masquerade as absent settings.

Ammonia remains a separate saved test with its own timestamp. Unsaved scanner results are neutral, explicitly labelled previews. Saving returns the database-generated timestamp; the phone does not supply `created_at`. An old test cannot obtain a current timestamp from a newer water upload.

## Alerts and compatibility

After SQL rollout, database triggers and an owner-checked reconciliation RPC classify the latest owned readings using database time. Client-generated condition alert creation/resolution is removed. The server draft gates legacy client/server condition producers so older applications cannot create their conflicting derived condition alerts. Pump, feeder and marketplace alert producers are outside this gate.

One tank + parameter + unsafe-direction incident is updated as values fluctuate. Initial openings and eligible Critical escalations notify through the existing preference-aware helper. The existing one-hour notification cooldown is reused; numeric hysteresis is not invented. Valid current safe readings resolve new-policy incidents. Missing/stale/invalid readings do not claim recovery. Source faults remain separate operational fault alerts; they do not certify Critical water chemistry.

New transition control events retain original reading IDs, timestamps, values, effective threshold snapshots, direction, severity and reason. Current incident records can update their latest state; transition snapshots are not rewritten by later settings changes. Existing legacy historical alerts/readings are not reclassified or backfilled. Legacy active alerts may therefore remain as originally recorded during rollout.

Until the migration is applied, existing live backend alert producers still use the old policy. The new app does not fall back to duplicate phone-generated alerts. End-to-end live alert consistency is consequently pending deployment, configured verified limits/ages, and live validation.

Raw ESP32 statuses, pump/feeder thresholds, safety interlocks, cooldowns, pins and actuator commands are unchanged. Firmware can still make decisions from its separate directional/calibration rules. New UI/notification severity must not be treated as authorization for hardware actions. Installed-version confirmation and physical interlock testing remain necessary for any later firmware work.

## Activity timeline

Tank Details contains a read-only activity section with event-type filters, Philippine-date selection, newest-first ordering, refresh and bounded loading. Reports uses the same truthful event presentation for control logs. Timestamps use Asia/Manila; database record time and device-provided execution time are separately identified.

The reviewed endpoint combines owned control events, commands, raw automation logs, alerts and saved ammonia tests. Explicit command/control/automation IDs deduplicate mirrors; equal messages or numeric readings alone do not. Dates use inclusive start/exclusive end. Query windows are bounded to 31 days and source limits to 500. The default UI window is seven Philippine days and starts at 100 rows per source.

Requested, Started, Skipped and Failed retain recorded meanings. A manual command's `done` becomes Unknown / Unconfirmed when there is no execution proof. Only the inspected raw automation feedback phrase `Expected water movement confirmed.` supports Completed (device-reported), with an explicit explanation that fresh sensor movement is indirect confirmation rather than a flow measurement. Alert resolution alone is not labelled sensor recovery. Historical snapshots remain historical; current thresholds are never substituted for missing historical values.

Until the history migration is applied, the screen safely shows owned saved alerts and ammonia tests with a partial-history notice. It never bypasses the endpoint by directly reading the broadly accessible command/automation tables. Network failures show an error and identify cached coverage. Tank changes suppress prior tank data, and auth/ownership failures clear cached history. Realtime for alerts/scans plus active polling/foreground refresh cover changes; the history path creates no commands or events.

The downloaded actuator sample writes scheduled feeding progress to serial/preferences without corresponding Supabase event rows. No historical scheduled-feed outcomes can be reconstructed from a schedule. Device online/offline transition history is also unavailable where only current `last_seen` exists. These remain explicit firmware/data-source gaps; no events are fabricated.

## SQL review and rollout

Review these exact drafts before live application, in this order:

1. [configurable-classification.sql](../supabase/setup/configurable-classification.sql): nullable JSON contract, validation, scoped configuration RPC, server classifier/reconciliation, notification triggers, legacy condition-alert gate, transition snapshots, compatible safe-setting writes and threshold audit snapshots.
2. [tank-activity-history.sql](../supabase/setup/tank-activity-history.sql): owner-checked read endpoint, metadata allowlist, restrictive authenticated command/control read guards and indexes.
3. Deploy the prepared `craythrive-ai-guide` Edge Function/shared modules after the database contract is installed. Keep frontend public credentials and server AI secrets in their existing roles.

Each SQL file is transactional and tested for reapplication. Neither changes database timezone, deletes historical records, edits sensor values/statuses, supplies Critical defaults, or changes actuator behavior. Applying these drafts is deliberately separate from the already approved local implementation: the original proposal explicitly requested review of the concrete migration before application.

Then configure only verified tank/account Critical limits and approved maximum reading ages, reload clients, and validate owned-tank/account scenarios, notification preferences and new transition history. Without those values the UI intentionally reports missing configuration/recency rather than pretending the whole classification rollout is complete.

## Modified files in this implementation

Application policy and persistence:

- `src/utils/classificationPolicy.js` (new)
- `src/utils/thresholdResolution.js`
- `src/utils/thresholdSettings.js`
- `src/utils/sensorAlertRules.js`
- `src/utils/sensorRecommendations.js`
- `src/utils/ammoniaReadings.js`
- `src/services/aiGuideService.js`

Application presentation/history:

- `src/components/tank/ClassificationSettings.js` (new)
- `src/components/tank/SensorReadingCard.js`
- `src/components/tank/TankRecommendations.js`
- `src/components/tank/TankActivityTimeline.js` (new)
- `src/utils/activityHistory.js` (new)
- `src/services/tankActivityService.js` (new)
- `src/hooks/useTankActivity.js` (new)
- `src/screens/main/settings/DefaultThresholdsScreen.js`
- `src/screens/main/AmmoniaReaderScreen.js`
- `src/screens/main/TankDetailsScreen.js`
- `src/screens/main/ReportsScreen.js`

Server drafts:

- `supabase/functions/_shared/classificationPolicy.js` (new; portable policy parity)
- `supabase/functions/_shared/thresholdResolution.js`
- `supabase/functions/craythrive-ai-guide/index.ts`
- `supabase/setup/configurable-classification.sql` (new, not applied)
- `supabase/setup/tank-activity-history.sql` (new, not applied)
- `supabase/audits/audit-activity-history.sql` (new read-only audit)

Validation and documentation:

- `scripts/check-classification.cjs` (new)
- `scripts/check-classification-sql.cjs` (new)
- `scripts/check-activity-history.cjs` (new)
- `scripts/check-ai-guide.cjs`
- `scripts/check-mobile-ui.cjs`
- `scripts/check-per-tank-thresholds.cjs`
- `scripts/check-safe-ranges.cjs`
- `scripts/check-sensor-recommendations.cjs`
- `scripts/check-sensor-monitoring.cjs`
- `scripts/check-pump-wording.cjs`
- `scripts/check-philippine-time.cjs`
- `scripts/check-ammonia.cjs`
- This report and dated status notes in the original classification, recommendations and safe-range reports.

## Validation

All of these checks pass:

```text
npm.cmd run lint
node scripts/check-classification.cjs
node scripts/check-classification-sql.cjs
node scripts/check-activity-history.cjs
node scripts/check-per-tank-thresholds.cjs
node scripts/check-safe-ranges.cjs
node scripts/check-sensor-recommendations.cjs
node scripts/check-sensor-monitoring.cjs
node scripts/check-ai-guide.cjs
node scripts/check-ai-request-budget.cjs
node scripts/check-ammonia.cjs
node scripts/check-pump-wording.cjs
node scripts/check-philippine-time.cjs
node scripts/check-mobile-ui.cjs
npx.cmd expo export --platform android --platform web --output-dir <temporary export directory>
```

The SQL script uses isolated PostgreSQL through [PGlite](https://pglite.dev/docs/) installed in a temporary directory, with `PGLITE_MODULE` pointing at that installation. It tests both actual migrations applying/reapplying, JS/SQL boundary parity, scoped ownership, inheritance/clearing, safe-edit preservation, invalid configuration rejection, incident deduplication/escalation/recovery, notification preferences, source-fault separation, legacy producer gating, immutable transition snapshots and restrictive read guards. Synthetic limits/ages are test fixtures only.

Other tests cover equality/near-boundary cases across all five parameters, stale/invalid/future/missing timestamps and server-clock authority, per-tank refresh, saved-scan timestamp provenance, optional AI explanations without actions, AI request budgets, safe history fallback, explicit-ID deduplication, truthful hardware outcomes, Philippine day boundaries/timezone changes, narrow 320px light/dark renders and refresh cleanup. Lint passes with zero errors/warnings. Existing pump wording cases pass; no hardware execution occurs in these fixtures. Final Android/web exports are at `%TEMP%\craythrive-classification-activity-final-20261012`.

These checks do not prove real concurrent database sessions, deployed push delivery, actual device connectivity, physical safety interlocks, calibrated biological limits, installed-app behavior, or separate Vite equivalence. Live deployment and configured-policy acceptance remain pending as described above.
