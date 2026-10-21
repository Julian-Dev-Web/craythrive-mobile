# Mobile ammonia audit — October 5, 2026

Ammonia is a manual/event-based scan. `public.ammonia_readings` is the authoritative history. No database schema or data changes were made; no APK was built.

## Confirmed problems fixed

- The shared merge let a newer sensor upload override an older real ammonia scan with embedded sensor ammonia.
- A scan could replace the sensor `created_at`, making the water reading timestamp incorrect.
- Dashboard omitted the scan card, and the shared reading card had no ammonia timestamp.
- Missing ammonia used generic missing-reading presentation instead of explicit neutral No Scan.
- Device pairing suppressed a Critical manual scan behind Unpaired.
- Reports merged sensor and scan records into historical daily snapshots. Water trends now use only water events; a separate timestamped Reading History displays water events and scan events.
- AI serialized ammonia inside `latest_reading` and historical sensor rows. Cached tank data could also substitute for a successful empty authoritative query.
- The AI function did not accept the new independent current records or explicitly require event-based ammonia interpretation.
- Sensor alert refresh used the combined current display, replaying ammonia as a sensor alert. Scan alerts now have a stable scan timestamp and deduplicate that event without the sensor alert's hourly window.
- Tank Details/Reports could disguise a failed scan/history query as missing data. Those queries now reach the existing load-error UI.

## Current flow

Dashboard, Tank Details, Reports and AI Guide independently fetch the selected user's latest water row and latest scan row by tank, descending `created_at`, limit 1. Sensor normalization discards legacy ammonia aliases without modifying raw records. A current-display composite retains sensor `created_at` and a separate `ammonia_created_at`; it is never persisted or used as a historical event.

Each ammonia card says Manual scan and shows its own absolute scan timestamp. No scan is No Scan/neutral/null, not 0/Normal. A saved zero remains a valid measurement. An invalid saved scan is No Reading with its own timestamp. Existing saved account thresholds determine condition; no expiry/stale-duration rule was added. Overall sensor condition is stated separately from ammonia. A Critical scan remains Critical without paired sensor hardware.

The existing scan-save path was inspected and retained: it inserts only into `ammonia_readings`; nothing copies/backfills ammonia into `sensor_readings`.

## History

Water and ammonia queries retain their own timestamped records. Reports orders separate Water Reading and Ammonia Reading events newest first, displaying the latest 20 within the existing seven-day report window. The water trend uses the latest actual water row per day; ammonia does not populate sensor samples, daily sensor scores or days without water rows. Current readings remain available even when older than that reporting window.

## AI context

`latest_sensor` contains only water measurements and their timestamp. `latest_ammonia` contains the scan value, timestamp, condition and manual-scan source. `recent_sensor_readings` and `recent_ammonia_readings` remain separate. The compatibility `latest_reading` alias is sensor-only. Scan-query failure is an error; successful absence cannot fall back to cached scans.

Both context and server prompt include:

> Ammonia is manually scanned and may be older than the latest sensor readings. Never describe ammonia as a live sensor value. Mention its scan timestamp when relevant.

The Edge Function preserves these keys, strips embedded ammonia from legacy sensor payloads, uses separate supplied scan history for older clients, and explicitly requires No Scan for absent scans. The labelled rule fallback also uses the separate records and includes scan time. Existing ownership/JWT checks, domain restrictions, thresholds confirmation and hardware protections remain intact.

The existing `craythrive-ai-guide` function was deployed and verified ACTIVE, version 5, `verify_jwt: true`. No schema migration or table/reading writes were performed for this audit.

## Verification

- `node scripts/check-ammonia.cjs`: passed authoritative-source, older/zero/invalid/missing scan, timestamp separation, critical-unpaired, immutable inputs, history event rendering, daily trend, AI payload/fallback, actual screen rendering in both themes at 320px, and scan-alert dedup regressions.
- `node scripts/check-sensor-monitoring.cjs`: passed syntax/imports, Expo Android transformations, current threshold/pairing and all four data loaders.
- `node scripts/check-ai-guide.cjs` and `node scripts/check-ai-conversations.cjs`: passed auth/ownership/provider/parsing/fallback and question matrix regressions.
- `node scripts/check-mobile-ui.cjs`: 67 files transformed; all 24 screens rendered in both themes; checks passed.
- `node scripts/check-prerelease-qa.cjs`: 16 groups passed.
- `node scripts/check-marketplace.cjs`: 15 groups passed.
- `npm run lint` and scoped scripts/Edge ESLint: no errors or warnings.
- Cached Deno TypeScript check: passed. The initial npx command could not reach the registry in the sandbox; using the already installed Deno binary completed the check.
- Production Expo Android export: passed, 1,444 modules, 44 assets, Hermes bundle. Output: `%TEMP%\craythrive-ammonia-android-20261005`. This was an export, not an APK build.

Only the existing harmless NO_COLOR/FORCE_COLOR tooling warning appeared during export. No code, transform or lint errors remain in the completed checks. Native phone testing and a live authenticated provider answer with the new context were not performed; provider payload assertions used actual Edge code with a mocked provider. Deployment status was verified against Supabase.

## Files changed

1. `src/utils/sensorMonitoring.js`
2. `src/utils/thresholdSettings.js`
3. `src/utils/sensorAlertRules.js`
4. `src/utils/tankRules.js`
5. `src/utils/aiFallback.js`
6. `src/components/tank/SensorReadingCard.js`
7. `src/screens/main/DashboardScreen.js`
8. `src/screens/main/TankDetailsScreen.js`
9. `src/screens/main/ReportsScreen.js`
10. `src/screens/main/AiGuideScreen.js`
11. `src/services/aiGuideService.js`
12. `supabase/functions/craythrive-ai-guide/index.ts`
13. `scripts/check-sensor-monitoring.cjs`
14. `scripts/check-ai-conversations.cjs`
15. `scripts/check-ammonia.cjs` (new)
16. `docs/sensor-monitoring-audit.md`
17. `docs/ai-guide-release-fix.md`
18. `docs/ammonia-mobile-audit.md` (new)

## Phone checklist when the updated app is installed

1. Normal water readings with no scan: Dashboard, Tank Details and AI Guide must show sensor Normal and ammonia No Scan, neutral.
2. Save a zero scan: show 0 ppm/Normal with its own scan time. Receive another water upload: ammonia value/time must remain the saved scan's.
3. Save an above-critical scan: show Critical and its scan time; unpairing sensor hardware must not hide it.
4. Reports: water events contain no ammonia; each scan appears once at its own time. The water trend has no fabricated samples.
5. Ask AI about current condition and previous readings: ammonia is described as a manual scan with its date, separate from water readings. Repeat with a no-scan tank.
6. Refresh/reopen Tank Details: one timestamped alert per saved unsafe scan, without creating a new ammonia scan/history row.

Already installed APKs do not receive these mobile UI/logic changes without a subsequent app build/update. No APK was built in this task.
