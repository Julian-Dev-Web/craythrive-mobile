# Fix #2 — dynamic sensor safe ranges (October 11, 2026)

Update — October 12, 2026: Fix #3 now adds optional configured water safe maximum, separate Critical limits and reading ages while retaining dynamic safe-range labels. Local implementation is tested; live SQL rollout/configuration remain pending. See [the current implementation report](classification-and-activity-20261012.md). The original Fix #2 audit follows.

## Scope and findings

Completed in the available Expo mobile application. The separate React + Vite dashboard is unavailable in this workspace and remains pending; exporting the Expo web target does not verify that separate application. No APK was built.

The mobile already fetched effective per-tank thresholds and evaluated readings through the shared `evaluateMonitoring` utility. The shared sensor card displayed values, statuses and condition-dependent explanations, but lacked a consistently visible, independent safe-range line. For an out-of-range temperature/pH reading, the explanation often mentioned only the affected bound. Missing values displayed `--` alongside a neutral status. Most screens loaded settings only on entry/manual refresh, so external updates could leave card ranges stale.

Before implementation, the resolver, sensor cards, Dashboard, Tank Details, Reports, AI Ask/Tank Check, manual ammonia result, settings screen and Supabase schema were inspected. A live read-only audit confirmed that both `public.tank_threshold_settings` and `public.threshold_settings` exist with the seven supported scalar threshold fields and JSON settings. Neither threshold table is currently included in `supabase_realtime`.

## Display policy

Each evaluated metric now carries its safe-range label computed from the same normalized effective thresholds used by the existing status evaluator:

| Parameter | Configured fields | Card display |
| --- | --- | --- |
| Temperature | `temperatureMin`, `temperatureMax` | `Safe Range: minimum–maximum °C` |
| pH | `phMin`, `phMax` | `Safe Range: minimum–maximum` |
| Water depth | `waterLevelMin` | `Safe Limit: ≥ minimum cm` |
| Water clarity/turbidity | `turbidityMax` | `Safe Limit: ≥ minimum V` |
| Ammonia | `ammoniaMax` | `Safe Limit: ≤ maximum ppm` |

Despite its historical name, `turbidityMax` is the existing minimum clear-water voltage, not an NTU maximum. Water depth has no supported maximum in the schema/resolver/evaluator. Therefore a tank configured with minimum 2 cm displays `Safe Limit: ≥ 2 cm`; a tank configured with minimum 3 cm displays `Safe Limit: ≥ 3 cm`. The example upper bounds 4/5 cm are not invented. Adding an actual water upper limit would require a separate configuration/safety decision, outside Fix #2.

The safe label is separate from the current value and badge, remains visible when data is missing, wraps without truncation, and uses existing theme colors/font scaling. Missing water sensor values display `No Reading` with neutral status. Missing ammonia retains `No Scan`, never zero or Normal. Existing ammonia results remain explicitly manual scans with their own timestamp; there is no invented expiry/stale-time cutoff.

Coverage: Dashboard, Tank Details, Reports current-parameter cards, AI Tank Check, existing AI Ask context parameter tiles and the manual/camera ammonia result card. Non-sensor metadata such as the last-reading date has no safe-range label. Historical event rows retain their separate timestamped sensor/scan events.

## Inheritance and refresh

The existing resolver is reused without changes:

1. The selected owned tank's `tank_threshold_settings` row, filtered by both `user_id` and `tank_id`.
2. Only if that row is absent, the authenticated account's `threshold_settings` row.
3. Only if both rows are absent, existing system defaults.

This is row-level inheritance. Within a selected row, the existing JSON/scalar normalization and fallback defaults remain unchanged; this task does not introduce a different field-by-field merge with the account row. Read errors do not masquerade as absent settings.

The new `useThresholdRefresh` hook performs threshold reads only. It subscribes to both setting tables with the authenticated user filter, refreshes every 60 seconds while the app is active, and refreshes on foreground return. Polling supplies eventual consistency on the currently deployed database where these tables are not published to realtime. Existing screen-entry/manual-refresh paths remain available. If publication is enabled separately later, the same hook also handles setting events.

Every refresh resolves all visible tank IDs independently and merges each result only into that tank's card state. An account update affects only tanks still inheriting the account row; explicit tank overrides remain unchanged. Reports recalculate existing weekly scores with the new thresholds while retaining the originally loaded report calendar period. Settings refresh does not reload readings, generate alerts, apply thresholds, call AI, or issue pump/feeder commands. Timers, foreground listeners and channels are cleaned up on unmount/tank-set changes. Failed reads keep the last successfully loaded values and retry later.

Existing explicit AI Apply behavior remains unchanged, including selected-tank confirmation and local persisted-value refresh.

## Modified files (12)

Application:

- `src/utils/thresholdSettings.js` — presentation labels attached to the existing evaluated metrics; severity formulas unchanged.
- `src/components/tank/SensorReadingCard.js` — shared safe-range text and explicit missing-value wording.
- `src/hooks/useThresholdRefresh.js` — new read-only refresh lifecycle.
- `src/screens/main/DashboardScreen.js` — independently refresh each visible tank's thresholds.
- `src/screens/main/TankDetailsScreen.js` — refresh only the selected tank's effective thresholds.
- `src/screens/main/ReportsScreen.js` — refresh per-tank card thresholds and weekly scores for the loaded period.
- `src/screens/main/AiGuideScreen.js` — refresh per-tank thresholds and show safe labels/statuses on existing Ask context tiles.
- `src/screens/main/AmmoniaReaderScreen.js` — refresh selected-tank thresholds and display its ammonia limit on the result card.

Verification/documentation:

- `scripts/check-safe-ranges.cjs` — new offline acceptance and refresh regression checks.
- `scripts/check-mobile-ui.cjs` — update the missing-reading assertion from `--` to the requested explicit wording.
- `supabase/audits/audit-safe-range-policy.sql` — read-only metadata/publication audit, not a migration.
- `docs/safe-ranges-audit-20261011.md` — this report.

## Database changes

**None. No migration or data update is necessary for the supported safe labels.** The SQL artifact only inspects metadata. No publication, settings, readings, RLS, timestamps, default values or automation functions were changed. No server deployment was needed.

A separate metadata finding: legacy `threshold_settings` SQL column defaults remain 40 for `turbidity_max` and 35 for `water_level_min`, whereas canonical tank defaults/current app defaults are 2.5 V and 4.5 cm. This task does not rewrite those defaults or any stored account values. Cards faithfully show the effective settings returned by the existing resolver. Legacy configuration provenance/units should be reviewed separately before changing defaults or safety behavior.

## Tests

Passed:

- `node scripts/check-safe-ranges.cjs`: all five customized bounds; actual Dashboard/Tank Details/Reports/AI Ask/Tank Check/manual result renders; light/dark and compact cards; missing/zero readings; correct voltage and ammonia directions; unchanged values; no invented water maximum.
- The same script executes the actual screen refresh callbacks and the shared hook: Tank A/B isolation, inheriting Tank C, account updates, realtime callbacks, 60-second fallback, foreground/background handling, report period retention, failed reads, subscription cleanup and zero mutations.
- `node scripts/check-per-tank-thresholds.cjs`: canonical/account/default priority, isolated Apply, independent reload, actual loaders and unchanged AI ownership/confirmation checks.
- `node scripts/check-sensor-monitoring.cjs`: unchanged numeric status evaluation, monitoring flow and card behavior.
- `node scripts/check-ammonia.cjs`: separate manual scans, their own timestamps and honest missing/critical display.
- `node scripts/check-philippine-time.cjs`: prior timezone/date-filter behavior preserved.
- `node scripts/check-mobile-ui.cjs`: 72 source transforms/imports, all 24 screen renders and interaction/layout regressions.
- `npm.cmd run lint`: zero errors/warnings.
- Expo production Android and web export: passed; JavaScript/assets only, no APK. The CLI emitted only its existing terminal `NO_COLOR`/`FORCE_COLOR` warnings.

Live operations were limited to read-only schema/publication inspection. No test push, billable AI request, threshold mutation or hardware command was sent.

## Pending and manual verification

1. Supply the React + Vite source folder to implement and verify the same display units, threshold direction, resolver priority and refresh behavior there. Actual web/mobile equality for the same tank is pending.
2. In an updated mobile build, inspect all five cards in Dashboard, Tank Details, Reports and AI Tank Check. Check long values and increased phone text size on a physical device; automated rendering is not a native visual test.
3. Using existing authorized threshold controls on test tanks, change only Tank A. Refresh or wait up to 60 seconds while active; Tank B's override must stay unchanged. Update an account fallback and verify only inheriting tanks change. Network/authentication failures can delay refresh.
4. Confirm empty tanks show neutral `No Reading`/`No Scan`, while safe labels remain visible. An older ammonia scan must retain its own Philippine scan timestamp rather than looking like a continuous reading.
5. Review legacy account column-default provenance separately. A water maximum/range and any new Critical safety logic remain outside this task.

The existing installed APK will not receive these local source edits until a later authorized update/build.
