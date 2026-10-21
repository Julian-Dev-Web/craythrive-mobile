# Fix #4 — tank-specific sensor recommendations

Update — October 12, 2026: Fix #3 was approved and the local recommendations now use configured Critical boundaries and saved per-parameter reading-age policies. Arbitrary derived Critical limits are removed. Live SQL/Edge rollout and verified numeric configuration remain pending. See [the current implementation report](classification-and-activity-20261012.md). Details below describe the original Fix #4 implementation before that update.

Implemented in the available Expo application on October 11, 2026. The separate React + Vite source is unavailable; its Dashboard/Tank Details floating button and responsive panel remain pending. The neighboring Craythrive project inspected is a Flutter project, not the requested Vite dashboard. Exporting Expo web does not complete that separate application.

## Findings and dependencies

The application already had one numeric status evaluator, effective per-tank threshold resolution, dynamic safe-range labels, Manila timestamp utilities, database-derived time, and an authenticated `craythrive-ai-guide` Edge Function. Tank Details displayed sensor values/statuses but lacked structured recommendations for all five parameters and a selected-tank route into AI Guide. Its existing load path also synchronizes alerts, making it unsuitable as a read-only recommendation refresh path.

Reused these utilities after inspecting Tank Details, Dashboard, AI Guide, settings, alert synchronization, the AI service/Edge request contract, and the schema/function audit from Fix #3. No new database inspection/migration was needed. Existing safe inheritance remains: canonical owned-tank row -> account row if no tank row -> existing system defaults. No changes to inheritance or stored values.

**Fix #3 is not implemented or approved.** The existing classifier still derives Critical from offsets/multipliers rather than separately configured verified boundaries. Fix #4 uses its existing result and safe-range explanation; it does not invent, configure, or activate new critical limits. Critical recommendations explicitly identify that separate verified critical boundaries are missing. Full critical-boundary consistency with database alerts/firmware remains the dependency documented in `classification-proposal-20261011.md`.

No approved freshness windows are configured either. No arbitrary sensor timeout or manual-ammonia expiry was added. The recommendation utility supports an explicitly supplied per-parameter `maxAgeSeconds` policy for future approved configuration; the current UI supplies none. Consequently:

- Safe saved values show neutral **Recency unverified**, with their recorded safe-range evaluation and a request for a new measurement. They are not certified as currently Normal.
- Unsafe saved values retain **Warning/Critical at saved reading**, receive prioritized verification actions, and clearly state that the saved result cannot establish the current condition.
- Explicit stale/error/unknown/waiting flags, invalid/missing timestamps, future timestamps relative to available server time, and last-good metadata produce neutral stale/unverified recommendations, never Normal.
- When an approved freshness policy is supplied, valid in-window values can show Normal; expired values are neutral Stale. Missing server time cannot validate recency.
- Ammonia always uses its separate saved manual scan, timestamp and unit. It is never described as a live water sensor reading.

Source checks cover status fields, the inspected firmware's `raw_payload.water_state`, `raw_payload.analog_state`, and `raw_payload.sensor_health`, plus the equivalent nested health flags. Finite-value parsing reuses existing measurement utilities; negative depth/voltage/results are not treated as valid water measurements. No biology/calibration range was invented.

## Behavior

Tank Details now contains an inline Recommendations section. Each of its five cards includes tank name, parameter, latest saved value/unit, effective safe range/limit, severity/validity label, reason, suggested action and source timestamp explicitly formatted in Asia/Manila. Critical items sort before Warning, unavailable/unverified items and Normal. An informative no-attention message is available when all measurements are valid/current/Normal under a supplied freshness policy; the present unconfigured recency policy is not falsely treated as that state.

Actions explain inspection and verification: independent thermometer/heat-source checks; actual water depth/leak/probe checks; calibrated pH retest and source-water inspection; voltage/clarity probe/filtration checks; or a new ammonia test and waste/filtration inspection. Recommendations do not dose chemicals, execute equipment, or apply settings. Critical wording prioritizes immediate inspection and measurement verification.

An independent hook authenticates the user and reads only that tank's latest sensor row, latest ammonia scan, effective settings, pairing and server time. It subscribes to reading/setting events, polls every 60 seconds while active, refreshes on foreground return, coalesces overlapping refreshes and cleans up subscriptions/timers. Polling covers threshold tables not published to realtime. Network/read failures keep cached values visibly unavailable rather than generating healthy recommendations from fallback data. A tank change suppresses the previous tank's cached rows immediately. The builder also independently rejects cross-tank source rows.

**Explain with AI Guide** is opt-in and reuses the existing authenticated AI service/Edge Function. It supplies the deterministic snapshot and asks for an explanation without changing its status. Only returned answer text is displayed. Action/threshold suggestion fields do not enter an Apply or equipment path. Repeated taps share one request; results from obsolete snapshots/unmounted panels are discarded. Provider errors leave deterministic cards available.

**Open AI Guide** navigates to the existing full Guide with the same tank selected. Existing full AI Guide features retain their existing explicit confirmation behavior; this task does not change them. Recommendation refresh/explanation introduces no alert creation, hardware command, automatic threshold write, frontend secret, or new provider endpoint.

The panel uses existing theme colors, wrapped/scalable text, neutral unavailable states, accessible button labels and minimum 44 dp targets. Its inline placement does not overlay monitoring controls. Physical phone scrolling/layout still requires manual review.

## Files changed (9)

New:

- `src/utils/sensorRecommendations.js` — deterministic recommendation builder, source validity checks and Manila source timestamps.
- `src/hooks/useTankRecommendationData.js` — scoped read-only data/threshold refresh lifecycle.
- `src/components/tank/TankRecommendations.js` — five-parameter panel and optional read-only AI explanation.
- `scripts/check-sensor-recommendations.cjs` — offline recommendation/data/interaction acceptance tests.
- `docs/sensor-recommendations-20261011.md` — this report.

Modified:

- `src/screens/main/TankDetailsScreen.js` — mount panel and accept AI Guide navigation callback.
- `src/screens/main/AiGuideScreen.js` — optional initial tank ID; existing selection/load behavior retained.
- `app/index.tsx` — selected-tank navigation from recommendations to AI Guide.
- `scripts/check-mobile-ui.cjs` — optional data-hook override for testing actual AI panel interactions.

No SQL migration, database update, Edge deployment, firmware edit, hardware action or APK build was performed. Existing evaluator formulas, alerts, safe ranges, sensor values, automation interlocks and thresholds remain unchanged.

## Verification

Passed:

- `node scripts/check-sensor-recommendations.cjs`: all five parameters/units/threshold directions; Warning reasons and existing Critical behavior; sorting; safe-setting updates and tank isolation; source scan/sensor timestamps; stale/invalid/missing/unknown/unpaired/unavailable cases; no implicit freshness default; supplied-policy Normal/Stale behavior; five host timezones including New York/Tokyo/London/Manila/UTC; scoped read-only Supabase fixtures; refresh failure/tank switch/cleanup; light/dark 320 dp panel; selected-tank Guide entry; opt-in single-flight AI, ignored action/Apply fields, unchanged deterministic output, obsolete response rejection and provider failure.
- `node scripts/check-safe-ranges.cjs`: existing dynamic bounds, actual screens, account/tank isolation and refresh lifecycle.
- `node scripts/check-sensor-monitoring.cjs`: existing numeric policies/transforms, queries/cards, scoped lint and alert fixtures.
- `node scripts/check-ai-guide.cjs`: existing service/screen/Edge auth, response, failure and confirmation behavior, using mocks.
- `node scripts/check-mobile-ui.cjs`: transforms/imports for 75 source files, 24 screens in light/dark mode, navigation/keyboard/accessibility regressions, full mobile lint with zero errors/warnings.
- Expo Android and web exports completed successfully to the temporary directory `craythrive-recommendations-export`. This was a bundle/export check, not an APK or deployment.

No live AI request or real equipment/notification test was performed. The same deterministic inputs generate identical recommendation data across host timezones; actual Vite/Expo parity is pending access to Vite.

## Manual verification and remaining work

1. Open two tanks in Mobile Tank Details. Confirm each panel's name, values, bounds and timestamp match that tank's saved Supabase rows; ammonia must show its own scan time.
2. Update a safe setting through an existing authorized settings workflow. Within 60 seconds or after Refresh recommendations, verify only applicable inherited/overridden tanks change. No recommendation control should execute equipment or apply settings.
3. Disconnect the network and refresh: the panel should show an error and neutral unavailable recommendations. Reconnect and retry. Test stale/error source cases using offline fixtures or a test environment, without rewriting production readings.
4. Tap Explain with AI Guide: verify explanation text appears while deterministic cards remain unchanged. Refresh/change the snapshot during a pending response; an obsolete response must not remain. Open AI Guide and confirm the selected tank.
5. Change the device timezone and compare the same reading ID: its Manila display must remain identical. Review small-phone scrolling, screen-reader labels and font scaling.
6. Supply/approve Fix #3 critical boundaries, calibration interpretation and freshness policies before claiming validated current Normal/Warning/Critical classification. No invented boundaries were added here.
7. Provide/access the separate React + Vite application to implement its floating panels and verify actual web/mobile parity. That portion remains pending.
