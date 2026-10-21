# Mobile sensor correctness audit

Ammonia correction (October 5, 2026): the earlier audit below is superseded for ammonia source, history and device-pairing behavior by [the mobile ammonia audit](ammonia-mobile-audit.md). Ammonia is a manual scan event from `public.ammonia_readings`, never a continuous sensor measurement.

The mobile display now follows one path: newest usable numeric reading → current saved account thresholds → evaluated severity → matching badge, icon and theme color. `evaluateMonitoring` in `src/utils/thresholdSettings.js` supplies the results. Dashboard, Tank Details, Reports, AI Tank Check, AI context, the ammonia result card and mobile sensor-alert decisions share this evaluator. No sensor readings or firmware status fields were rewritten in Supabase. No database migration, live deployment or APK build was performed.

## Exact files changed in this audit

1. `src/utils/thresholdSettings.js`
2. `src/utils/sensorMonitoring.js` — new
3. `src/utils/tankRules.js`
4. `src/utils/sensorAlertRules.js`
5. `src/components/tank/SensorReadingCard.js` — new
6. `src/components/ui/NotificationBell.js`
7. `src/screens/main/DashboardScreen.js`
8. `src/screens/main/TankDetailsScreen.js`
9. `src/screens/main/ReportsScreen.js`
10. `src/screens/main/AiGuideScreen.js`
11. `src/screens/main/AmmoniaReaderScreen.js`
12. `src/services/aiGuideService.js`
13. `scripts/check-sensor-monitoring.cjs` — new
14. `docs/sensor-monitoring-audit.md` — new

Marketplace, navigation/root, hardware scanning calibration, storage, tables and authentication were preserved. Existing sensor alert insertion/deduplication/resolution remains part of the app's normal refresh behavior, with corrected evaluation.

## Incorrect mappings and decisions fixed

| Parameter | Previous problem | Current mapping |
|---|---|---|
| Temperature | AI context sometimes preferred `temperature` over `temperature_c`; firmware status could override the current number. | First valid `temperature_c`, then `temperature`. Existing numeric `temp_c`/`temp` aliases remain last fallbacks. |
| pH | Shared threshold helpers and AI context preferred `ph` over `ph_value`; saved pH labels overrode new thresholds. | First valid `ph_value`, then `ph`; legacy numeric `pH`/`phLevel` fallbacks remain. Numeric value stays separate from the reason. |
| Turbidity | Tank Details/shared helpers could compare raw ADC values with voltage thresholds. Reports displayed firmware clarity labels as the value and treated voltage text as status/color input. | `turbidity_voltage`, then existing voltage aliases `turbidity_v`/`turbidity`. Raw ADC/NTU values are never treated as volts. Numeric volts display with a simple primary badge and Clear/Dirty/Critical Dirty context. Higher voltage still means clearer water. |
| Water | Multiple normalizers accepted ultrasonic distance as depth; tank rules used an inverse distance window and could recommend draining low-depth water. | First valid `water_depth_cm`, then normalized `water_level`. Below `waterLevelMin` is unsafe low depth. No distance fallback or inverse safe window. |
| Ammonia | Dashboard omitted phone scans; the earlier merge incorrectly compared scan timestamps against embedded sensor ammonia. | Only the latest `ammonia_readings` row supplies ammonia, evaluated against current `ammoniaMax`, with its own scan timestamp. Embedded sensor ammonia is ignored. Missing scan is neutral No Scan. Scanner calibration and raw saved scan status remain unchanged. |
| Missing values | `Number(null)` and `Number('')` produced zero; invalid strings could render as readings; missing metrics affected condition scores incorrectly. | Null, undefined, blank, boolean, object, NaN, infinity and nonnumeric strings are missing. Show `--` with neutral No Reading. Valid numeric zero is preserved. Missing values do not count as unsafe readings or as measured zero in scores. |

## Stale firmware status use removed

- Dashboard: overall status derived from four firmware status strings, including unsafe substring handling, was replaced with numeric evaluation. Snapshot cards now share the same evaluated badge/color/reason.
- Tank Details: sensor `MetricItem` labels/colors previously came from raw statuses. Its tank analysis also combined raw statuses with conflicting water-distance rules. Five measurement cards now use the shared evaluator and card.
- Reports: latest cards and report/weekly analysis preferred firmware statuses, fixed default ranges and a separate score policy. The turbidity card also used voltage text for its color. Current saved thresholds now drive the same measurement and overall evaluation.
- AI Tank Check: `MiniSensor` displayed raw statuses while its overall check used different rules. Both now use current evaluated results. AI context rereads thresholds and pairing, recomputes recommendations from the fetched readings, and exposes raw statuses only under explicit diagnostic `raw_statuses`/`raw_status` metadata.
- Shared threshold helpers: status-first safe checks and firmware/score-based critical overrides were removed.
- Sensor alert rules: raw status fallbacks could create or resolve alerts with no numeric reading. Alert creation and safe-resolution now follow the same numeric evaluation.
- Ammonia Reader: primary result status/color formerly came from the fixed scanner reference scale. Its displayed result now uses the saved ammonia maximum; invalid scans and threshold-loading states stay separate and neutral. Raw scanner output is unchanged.

A search of active mobile source (`src` and `app`) finds no farmer-facing `temperature_status`, `ph_status`, `turbidity_status` or `water_status` access. The remaining named accesses are diagnostic raw metadata in `aiGuideService.js`. The shared merge retains raw ammonia status metadata without using it for severity.

## All distance misuse removed

`water_distance_cm` was used as a depth fallback in seven files:

- `src/utils/thresholdSettings.js`
- `src/utils/tankRules.js` — also had an incorrect inverse distance safe window
- `src/screens/main/DashboardScreen.js`
- `src/screens/main/TankDetailsScreen.js`
- `src/screens/main/ReportsScreen.js`
- `src/screens/main/AiGuideScreen.js`
- `src/services/aiGuideService.js` — both sanitization and combined-reading paths

All eight fallback occurrences were removed. Generic `distance_cm` depth fallbacks were removed too. These hardware columns remain untouched in Supabase.

## Final badge/color policy

| Primary status | Theme color | Icon |
|---|---|---|
| Normal | `colors.success` — green | `checkmark-circle-outline` |
| Warning | `colors.warning` — amber | `warning-outline` |
| Critical | `colors.danger` — red | `alert-circle-outline` |
| No Reading / No Data / Waiting | `colors.muted` — neutral | `help-circle-outline` |
| Unpaired | `colors.muted` — neutral | `link-outline` |

Current pairing comes from claimed non-camera `iot_devices`, not historical reading device IDs or a stale tank flag. Unpaired water cards show historical values with neutral Unpaired badges; missing water values remain neutral No Reading. Manual ammonia scans are evaluated independently of device pairing, with No Scan for absence. A Critical/Warning ammonia scan stays visible even without a paired device. Overall sensor condition and ammonia scan condition are stated separately. No-reading and unpaired overall scores show a placeholder.

The prior numeric alert policy supplies critical margins: temperature farther than 4 °C outside its range, pH farther than 0.8 outside its range, voltage below `max(0, clearMinimum - 1)`, depth below `max(0, safeMinimum - 1.5)`, and unsafe ammonia at least twice its maximum or at least 1 ppm. Values outside the safe range but short of a critical margin are Warning. Saved firmware severity never changes this result.

Each load/refresh retrieves saved thresholds again. A failed threshold request surfaces a retry/error state rather than silently evaluating against defaults. Defaults apply only when no saved threshold record exists. Latest sensor/scan queries are scoped to each owned tank; Reports keeps a separate seven-day history query so an older latest reading remains visible. Trend bars and condition indicators also follow evaluated severity.

## Validation and remaining warnings

`node scripts/check-sensor-monitoring.cjs` verifies syntax, imports, Expo Android Babel transformations, both theme colors, actual card output, mock Supabase screen loading, current threshold refreshes and NotificationBell lifecycle. It covers the requested cases:

- Depth 0.6 cm with safe minimum 4.5 cm → Critical/red.
- pH 4.8 with safe minimum 6.5 → Critical/red and numeric 4.8.
- Temperature 26 °C in the 20–30 range → Normal/green even with a stale critical firmware status.
- Invalid/missing data → `--`, neutral; distance-only/raw-ADC-only rows do not become measurements.
- Change the same fixture's depth minimum to 0.5 and pH minimum to 4.5, without inserting a reading → Normal immediately after refresh/reevaluation.

These are offline fixtures using the project's default thresholds and explicit alternate saved settings; actual farmer account thresholds and physical sensor calibration were not inspected live. Existing AI, Marketplace and mobile notification regression scripts also pass. No hardware, live provider or push delivery test was performed.

Changed files and the new checker have zero ESLint errors/warnings. Mobile `src`/`app` lint has zero errors and four unrelated existing unused-variable warnings:

- `src/screens/auth/LoginScreen.js:21` — `RADIUS`
- `src/screens/main/DeviceWifiSetupScreen.js:9` — `ActivityIndicator`
- `src/screens/main/GuideLessonDetailsScreen.js:19` — `RADIUS`
- `src/screens/main/settings/SecurityScreen.js:66` — `passwordStrong`

Dashboard, Reports and Tank Details load effects now use stable callbacks. The existing NotificationBell hook warning was safely fixed by stabilizing the alert loader and putting polling/realtime setup inside its effect. Its dependency list is complete, polling stays at 20 seconds, cleanup is preserved, and leaving during async setup no longer creates a leaked subscription.

## Manual phone checklist

1. With a paired tank, compare Temperature, pH, Water Clarity, Water Depth and Ammonia across Dashboard, Tank Details, Reports and AI Tank Check. Confirm numeric values, badges and colors agree in both themes.
2. Use a tank with an existing low-depth or acidic reading. Verify it is unsafe under the saved threshold even if the old firmware status says safe. Do not edit hardware readings to manufacture a test.
3. Save different thresholds through the existing settings/web flow, then refresh each screen without waiting for a new ESP32 upload. Verify the same saved values receive the new status/color.
4. Check a tank with no readings, a tank with only an ammonia scan, and an unpaired tank. Missing measurements must show `--`/neutral; unpaired status must stay neutral. Verify an older-than-one-week reading remains visible in Reports.
5. Save a valid phone/manual ammonia result. Confirm its numeric value and current-threshold badge agree after returning to Tank Details. Invalid scans must remain unsavable. Check the notification bell still loads alerts and unread counts after leaving and returning.

APK build remains deferred.
