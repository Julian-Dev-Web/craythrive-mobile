# Per-tank threshold audit — October 10, 2026

**Status: mobile and Supabase implementation completed; actual React/Vite web verification remains outstanding.** The web repository has not been located or supplied. No claim is made that a mobile Apply has been observed on the actual web UI. No APK was built.

## 1. Mobile threshold reads

`src/utils/thresholdSettings.js` delegates authenticated reads to `src/utils/thresholdResolution.js`:

1. `tank_threshold_settings` filtered by both authenticated `user_id` and selected `tank_id`.
2. Only when that row is absent, `threshold_settings` filtered by authenticated `user_id`.
3. Only when both rows are absent, application defaults.

A canonical query failure throws; it does not masquerade as an absent row. Existing JSON camelCase values, snake_case values, and scalar columns are supported. Empty JSON no longer hides populated scalar columns. Defaults remain temperature 20–30 C, pH 6.5–8.5, clarity minimum 2.5 V, water minimum 4.5 cm, and ammonia maximum 0.25 ppm.

Dashboard, Reports and AI Guide batch-load thresholds for their owned tanks and attach `monitoring_thresholds` to each tank. Tank Details and Ammonia Reader pass their actual tank ID. Sensor alert threshold resolution also passes the tank ID; no alert wording or evaluation rules changed. The mobile threshold settings screen remains view-only, with a tank selector and refresh of persisted values.

## 2. Mobile AI Apply writes

`AiGuideScreen.handleApplyThreshold` requires a selected tank, a valid proposal and explicit confirmation. It captures that tank ID, blocks a change of selection during confirmation, and prevents repeated Apply taps. A recommendation alone or Cancel performs no write.

`aiGuideService.applyAiThresholdSuggestion` re-reads the selected tank's effective thresholds, validates the proposal, and sends only the proposed parameter through `thresholdSettings.applyTankThresholdPatch`:

```js
supabase.rpc('apply_tank_thresholds', {
  p_tank_id: selectedTankId,
  p_patch: { water_level_min: 3.5 },
  p_scope: 'single_tank',
  p_source: 'ai_recommendation',
});
```

The helper refetches the selected tank after the RPC. The UI updates only that tank's values and marks the proposal applied after success. Single-tank Apply does not update the legacy account row. A failed refetch is reported as a failure to complete the operation rather than optimistic success; a committed write can already exist if that network read fails.

## 3. Web read/write path

**Not verified from source.** The deployed database exposes `get_tank_threshold_settings()` returning the authenticated account's legacy and canonical rows, and `apply_tank_thresholds(...)` accepting both camelCase and snake_case patches. These interfaces are compatible with the intended web flow, but their existence does not establish what the actual web components read or cache.

The exact React/Vite web folder path was requested. Still required: inspect its resolver and Apply handler; check selected-tank state and refetches after Apply, selection changes and refresh; run the mobile-to-web and web-to-mobile scenarios on the same tank. No web files have been edited.

## 4. Canonical source and backward compatibility

`public.tank_threshold_settings` is the canonical source for updated mobile code and AI server context. `public.threshold_settings` is retained with `UNIQUE(user_id)` for fallback and the explicit Apply All mirror. No table, constraint, column or RLS policy was dropped or restructured.

## 5. Resolver implementation

The deployment-safe resolver is in `src/utils/thresholdResolution.js`. Its identical copy in `supabase/functions/_shared/thresholdResolution.js` is packaged with the Edge Function. The regression test compares the files to prevent divergence. A batch read queries canonical rows once and queries the legacy fallback only when an owned tank lacks a canonical row.

The AI Edge Function independently resolves the authenticated selected tank's thresholds after checking ownership. It overrides older client-supplied thresholds. If those differ, it omits client-derived condition labels and rule summaries that may have used the legacy values, retaining the original numeric readings and timestamps. Ammonia remains a separate manual scan and history source.

## 6. RPC, activity and security changes

Applied `supabase/setup/unify-per-tank-thresholds.sql` to project `abtzkqfrwzcocyrwcrfc` after rollback-only integration tests.

- Preserves the existing `apply_tank_thresholds(uuid,jsonb,text,text)` signature and SECURITY INVOKER behavior.
- Requires authentication and verifies selected tank ownership; retains owner serialization and row locks.
- Whitelists the seven threshold fields; accepts snake_case/camelCase aliases, rejects conflicting aliases, nonnumeric values, invalid ranges and unknown fields.
- Accepts an explicit mobile AI proposal without requiring a previously stored pending recommendation. Empty-patch acceptance of an existing pending recommendation remains supported for older web clients.
- Applies only the supplied patch to each tank's own baseline for Apply All; it no longer copies unrelated selected-tank values over other tanks.
- Mirrors only that patch to the legacy account row for Apply All, preserving unrelated legacy threshold values.
- Retains real old/new threshold activity with status `updated`, source and scope. AI acceptance says “AI recommendation accepted by user.” Manual updates identify “Manual.” Changed tanks receive their own activity; unchanged effective values do not create fabricated changes.

The deployment checked exact live function definitions before replacement and verified hashes of every existing canonical, legacy and control-log row within the deployment transaction. All existing records were unchanged. Initial deployment-helper attempts failed and rolled back; the corrected guarded deployment succeeded.

The AI Edge Function was deployed as **version 15, ACTIVE, verify_jwt=true**. Existing authentication, ownership checks, provider limits, bounded context, timeouts and no-automatic-write behavior remain in place. No provider secret was changed and no billable provider request was needed for these tests.

## 7. Existing account values

Read-only audit of Julian Breeder Tank found:

| Source | Water minimum | Last update (UTC) |
| --- | --- | --- |
| Canonical selected tank | 3.5 cm | 2026-10-09 17:04:21.039727 |
| Legacy account fallback | 4.5 cm | 2026-10-09 17:08:56.525 |

The tank ID is `7a1c992b-54b5-41df-974a-c0595c57cdde`. The values were still 3.5 and 4.5 after deployment. Earlier activity records included a manual 4.5 → 4.0 change at 16:47:19 UTC and Apply All to 4.5 at 16:41:29 UTC. The inspected activity did not prove the later 3.5 change was an accepted mobile AI action; that attribution is not invented.

Different canonical and legacy values are valid when only one tank changes. Updated clients must use the selected tank's canonical 3.5, rather than treating the newer legacy row as more authoritative.

## 8. Reconciliation

**No existing data was reconciled or overwritten.** The intended tank already has 3.5 cm in the canonical table. No guessed bulk copy or fake user activity was created. If the actual web still shows 4.0, its source or cached state must be inspected; the backend record already contains 3.5.

## 9–11. Exact source files changed for this task

Mobile implementation (10):

- `src/utils/thresholdResolution.js` — new resolver.
- `src/utils/thresholdSettings.js` — selected-tank reads and canonical RPC helper.
- `src/utils/sensorAlertRules.js` — tank ID in threshold reads.
- `src/services/aiGuideService.js` — canonical context and selected-tank Apply.
- `src/screens/main/DashboardScreen.js` — per-tank monitoring thresholds.
- `src/screens/main/ReportsScreen.js` — per-tank report thresholds.
- `src/screens/main/TankDetailsScreen.js` — selected-tank threshold read.
- `src/screens/main/AmmoniaReaderScreen.js` — selected-tank scan threshold read.
- `src/screens/main/AiGuideScreen.js` — per-tank state, explicit confirmation and isolated updates.
- `src/screens/main/settings/DefaultThresholdsScreen.js` — tank selector and persisted refresh.

SQL / Edge Function (4):

- `supabase/functions/_shared/thresholdResolution.js` — identical Edge resolver.
- `supabase/functions/craythrive-ai-guide/index.ts` — server canonical context.
- `supabase/setup/unify-per-tank-thresholds.sql` — function-only update.
- `supabase/audits/test-per-tank-thresholds.sql` — rollback-only authenticated integration tests.

Checks / documentation (6):

- `scripts/check-per-tank-thresholds.cjs` — resolver, loaders, settings selector, Apply and Edge regression checks.
- `scripts/threshold-test-client.cjs` — in-memory Supabase fixture for the actual mobile service code.
- `scripts/check-ai-guide.cjs` — canonical Edge query fixtures.
- `scripts/check-ai-conversations.cjs` — real selected-tank RPC Apply fixtures.
- `scripts/check-ammonia.cjs` — per-tank UI fixture state.
- `docs/per-tank-threshold-audit-20261010.md` — this report.

Web source files changed: **none**, because the repository path is unavailable. This list excludes earlier tasks' changes already present in the workspace. Expo export output is an ignored verification artifact under `.expo/threshold-audit-export`, not an APK or source change.

## 12. APK requirement

**A new APK is required** to install the updated mobile read/write path. The currently installed APK is not rewritten by deploying SQL or the Edge Function. A legacy-only APK cannot represent different values per tank and can still use its old account-wide Apply code. Existing tables remain compatible, but true per-tank behavior requires the updated client. No APK build was started for this task.

## 13. Validation and remaining work

| Required scenario | Automated / database result | Actual web result |
| --- | --- | --- |
| 1. Confirm mobile-style AI Apply A = 3.5 | PASS: real mobile service and confirmation checks; deployed RPC persists canonical A and attributes AI acceptance | Not tested |
| 2. B remains unchanged | PASS: B and legacy row unchanged after A Apply; actual mobile loaders keep A/B separate | Not tested |
| 3. Web-style manual A = 3.7 → mobile read | PASS: camelCase manual RPC patch persists 3.7; updated mobile resolver/settings refresh reads persisted values | Actual web click not tested |
| 4. Apply All = 4.0 + legacy mirror | PASS: all synthetic owned tanks and legacy = 4; foreign tank untouched; unrelated pH values preserved | Actual web control not tested |
| 5. Recommend, no Apply | PASS: real card does not write; Cancel writes nothing; database preview creates no rows/activity | Not tested |
| 6. Reload persisted values | PASS: independent client resolver and database read retain saved canonical values | Actual app/browser reload still required |
| 7. Another owner's tank | PASS: deployed RPC rejects under authenticated role, RLS hides foreign row, anonymous Apply rejects | Backend verified |

Live SQL tests used synthetic users/tanks and **rolled back all synthetic data and activity**. No real account thresholds, hardware commands or test notifications were sent. They validate the database contract, not a physical phone or browser.

Other passing checks: `check-per-tank-thresholds.cjs`, `check-ai-guide.cjs`, `check-ai-conversations.cjs`, `check-ai-request-budget.cjs`, `check-sensor-monitoring.cjs`, `check-ammonia.cjs`, `check-mobile-ui.cjs`, ESLint, cached Deno type checking, and Android Expo export (1446 modules, 44 assets). Expo emitted only terminal color environment warnings (`NO_COLOR`/`FORCE_COLOR`), not application transform failures.

Still required before declaring end-to-end success:

1. Supply the React/Vite web workspace path and audit/fix its selected-tank resolver, RPC calls and refresh state.
2. On updated mobile and the actual web, select the same owned Tank A, confirm Apply and observe its saved value after web refresh; verify B remains unchanged.
3. Change A from the web and confirm mobile refresh uses it; verify Apply All and reload on the actual UIs.
4. Build/install a new APK only when requested, then repeat on the phone. No APK is needed to perform the source and development-client checks first.
