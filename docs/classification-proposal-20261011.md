# Fix #3 classification audit and proposal — October 11, 2026

Update — October 12, 2026: the user approved the implementation approach. Local application changes and concrete SQL drafts are now prepared and tested; live SQL application/Edge deployment still await the separate migration review requested below. See [the current implementation report](classification-and-activity-20261012.md). The remainder of this document preserves the original pre-implementation audit/proposal and is not the current deployment status.

## Scope and evidence

Inspected the available Expo application's threshold resolver, numeric evaluator, cards/screens, refresh hook, alert synchronization, ammonia scanner/storage, AI context, existing SQL setup, and live Supabase metadata/function definitions. The separate React + Vite application is unavailable in this workspace. An Expo web export is not evidence that the separate Vite dashboard has been fixed.

The live audit examined `tank_threshold_settings`, `threshold_settings`, `sensor_readings`, `ammonia_readings`, `alerts`, and `tank_automation_settings`; aggregate JSON key names; triggers; and relevant function definitions. It did not change records or retrieve individual users' threshold values. The database remains on UTC; no timestamp conversion or historical reading migration is proposed.

Two downloaded firmware samples were inspected read-only:

- `C:\Users\AMD\Downloads\ESP32_sensorhub_v1_16_1_uno_link_grace\ESP32_sensorhub_v1_16_1_uno_link_grace.ino`
- `C:\Users\AMD\Downloads\CrayThrive_Actuator_v1_23_0_combined_critical_rules\CrayThrive_Actuator_v1_23_0_combined_critical_rules.ino`

Their presence does not establish which version is flashed on the hardware. No firmware was compiled, flashed, or edited; no hardware command was issued.

## Root causes and existing thresholds

Safe ranges are already dynamic after Fix #2. Critical limits are not separately configurable in the current database/resolver. The mobile evaluator derives them from safe bounds with fixed offsets/multipliers. Supabase alerts instead use uploaded firmware status strings or fixed ammonia cutoffs. These are multiple policies, so changing only card badges would leave conflicting alerts and hardware interpretations.

Current mobile rules in `src/utils/thresholdSettings.js`:

| Parameter | Existing safe rule | Existing derived Critical rule |
| --- | --- | --- |
| Temperature, °C | `temperatureMin <= value <= temperatureMax` | `value < temperatureMin - 4` or `value > temperatureMax + 4` |
| pH | `phMin <= value <= phMax` | `value < phMin - 0.8` or `value > phMax + 0.8` |
| Water depth, cm | `value >= waterLevelMin` | `value < max(0, waterLevelMin - 1.5)`; no upper bound |
| Turbidity, V | `value >= turbidityMax` | `value < max(0, turbidityMax - 1)` |
| Ammonia, ppm | `value <= ammoniaMax` | When outside safe: `value >= ammoniaMax * 2` or `value >= 1` |

The historical name `turbidityMax` means minimum clear-water voltage, not maximum NTU. The evaluator selects Normal before checking Critical, so its ammonia formula is also conditional on being outside safe.

Existing application safe defaults are temperature 20–30 °C, pH 6.5–8.5, water depth >= 4.5 cm, turbidity >= 2.5 V, and ammonia <= 0.25 ppm. These are existing fallbacks, not newly recommended biological limits. The firmware samples use different safe settings. Legacy account-table SQL defaults for turbidity/water also differ in scale from current application defaults; their provenance must be verified before any rewrite. No such rewrite is included here.

The following values exist in the inspected sensor firmware sample. They are implementation evidence only, **not validated or approved critical limits**:

| Parameter | Sample safe settings | Sample critical settings |
| --- | --- | --- |
| Temperature | 20–28.5 °C | <= 18 °C or >= 30.5 °C |
| pH | 6.5–8.5 | <= 6.0 or >= 9.0 |
| Water depth | 3.00–4.50 cm | <= 1.99 cm or >= 5.50 cm |
| Turbidity | Clear >= 2.20 V | Critical dirty < 1.50 V; additional warning categories at 2.00/1.50 V |

All critical boundaries therefore require confirmation/configuration before adoption. Water's safe maximum is also missing from the current mobile/settings contract. The requested inclusive critical comparison differs from several existing strict comparisons, including firmware turbidity at exactly 1.50 V; this needs an explicit compatibility decision.

### Verified classification failures

Real current evaluator code reproduced these cases without modifying or inserting readings:

| Input/context | Current mobile result | Concern |
| --- | --- | --- |
| Temperature 27 °C, default safe settings | Normal | Baseline correct |
| Temperature 30.1 °C | Warning | A Warning band already exists |
| Temperature 34 °C, safe maximum 30 °C | Warning | Equality at the derived boundary is not Critical |
| pH 6.0, uploaded `CRITICAL_ACIDIC` | Warning | Firmware sample reports Critical |
| Water 4.5 cm, `SENSOR_STALE`, source `fresh=false` | Normal | Last-good numeric values bypass stale flags |
| pH 7.0, uploaded `SENSOR_ERROR` | Normal | Numeric value bypasses sensor validity |
| Ammonia 0.5 ppm, saved strip status `SAFE` | Critical | Scanner and actuator may treat this saved status as Safe |
| Missing water value | No Reading | Existing neutral handling works |

There is no general timestamp-age policy in the mobile evaluator. Ammonia is correctly presented as a manual/event-based scan with its own timestamp, but no validated expiry is configured. Do not invent an ammonia expiry or classify an old result as a current live measurement.

### Schema, resolution, and refresh

Both threshold tables contain seven safe scalar fields and `thresholds` JSON. The live JSON key audit found only the same seven safe keys, with no critical/freshness settings.

Current safe inheritance is **row-level**: an owned tank's canonical `tank_threshold_settings` row; otherwise its account's `threshold_settings` row; otherwise existing system defaults. Missing fields within the chosen row use existing normalization/default behavior rather than merging account fields. Read errors are not treated as absent settings. Preserve this contract for existing safe fields.

`apply_tank_thresholds` and `craythrive_threshold_values` whitelist/reconstruct only the seven safe keys. Adding critical JSON keys alone would not work: a later safe-settings Apply could discard them. The client and Edge resolver copies also strip unsupported fields.

Fix #2's `useThresholdRefresh` already independently refreshes affected tanks on foreground return and every 60 seconds while active, with subscriptions where available. The live threshold tables are not published to realtime, so polling provides eventual consistency. Keep that behavior. It currently recalculates display state without generating alerts; server-side reconciliation is needed when the alert policy changes.

### Alert producers

- The live `sensor_reading_alert_trigger` calls `create_alert_from_sensor_reading`, which maps uploaded directional status strings and compares the preceding reading's status. It does not evaluate effective per-tank numeric thresholds.
- `ammonia_reading_alert_trigger` calls `create_alert_from_ammonia_reading`: >= 1 ppm produces Warning and >= 5 ppm produces Critical, independently of per-tank settings.
- The scanner also saves Safe below 1, Warning from 1, and Critical from 5 ppm. Its RGB reference explicitly requires calibration against the actual LIANKAI chart under controlled lighting.
- Client `sensorAlertRules.js` separately creates alerts from the mobile numeric policy. Its one-hour duplicate check includes the full message/current value, so changing numbers can bypass deduplication. Client and database producers can create overlapping alerts.
- Uploaded `SENSOR_ERROR` currently creates a Critical operational fault alert. Neutral measurement validity must not silently suppress those fault notifications; fault severity and water-condition severity need separate handling.
- Existing helper functions can update/resolve active sensor alerts, but the current reading trigger does not call the numeric helper. Existing mobile push enqueueing is attached to alert insertion, so updating a Warning to Critical also needs an intentional escalation-notification policy.

### Hardware compatibility

The actuator sample consumes persisted directional statuses and source freshness, not mobile badge labels. Replacing raw `CRITICAL_LOW`/`CRITICAL_HIGH` with generic `Critical` would break directional drain/refill guards. Other actions also distinguish warning subcategories: `DIRTY` can cause a water exchange while `SLIGHTLY_CLOUDY` does not. Feeding and water quality rules consume pH/turbidity/ammonia states. Ammonia prioritizes saved scan status; its numeric fallback is a third policy (<= 0.25 Safe, <= 0.50 Warning, > 0.50 Critical).

The samples have dedicated freshness, stability, bounded pump timing, cooldown/cycle limits, and last-good grace rules. These remain unchanged. Their time windows are not automatically suitable as UI freshness defaults.

The sensor sample fetches `threshold_settings?tank_id=...`, but the inspected account table has no `tank_id`; canonical per-tank settings live in `tank_threshold_settings`. Several water/turbidity database-override flags are disabled. Correcting that endpoint or enabling flags could change physical behavior and requires separate review/approval. Do not bundle it into a card-classification change.

## Concrete proposal for approval

### 1. Configuration contract

Use additive optional keys in the existing threshold JSON, with corresponding client/SQL validation and preservation. Suggested keys:

| New key | Meaning/unit |
| --- | --- |
| `temperatureCriticalMin`, `temperatureCriticalMax` | Unsafe lower/upper °C boundaries |
| `phCriticalMin`, `phCriticalMax` | Unsafe lower/upper pH boundaries |
| `waterLevelMax` | Optional configured safe maximum depth, cm |
| `waterCriticalMin`, `waterCriticalMax` | Unsafe lower/upper depth boundaries, cm |
| `turbidityCriticalMinV` | Unsafe lower voltage boundary, V |
| `ammoniaCriticalMax` | Unsafe upper scan-result boundary, ppm |

No numeric critical defaults, firmware-value auto-import, or historical backfill. New optional fields resolve per field: configured owned-tank value -> configured account value -> unset. Clearing a tank field explicitly means inherit; clearing the account field leaves it unset. Preserve existing safe inheritance and show each new field's effective source in the configuration UI. This requires reading applicable account settings even when a tank has a canonical safe row.

Validate finite numbers and ordering against the effective safe settings: lower critical below safe minimum; upper critical above safe maximum; safe minimum below safe maximum when both exist. Turbidity Critical must be below its safe minimum; ammonia Critical above its safe maximum. Upper water classification requires a configured safe maximum. Reject conflicting patches with a useful message rather than silently correcting them. Respect ownership, units/calibration, and the existing explicit Apply/confirmation flow. Do not use arbitrary application input limits as biological validation.

Extend the settings RPC/normalizers and the mobile configuration screen together so safe edits preserve critical keys. AI context may describe configured values and missing limits, but must not invent or auto-apply critical settings.

### 2. Evaluation and presentation

Use one pure portable numeric classifier in Expo and the Edge context, with the same contract supplied to the separate Vite project when available. Keep raw firmware status and measurement history intact. Database alert evaluation must match the same boundary fixtures.

Evaluation order:

1. Missing, invalid, unpaired, explicitly stale/error, or outside an approved freshness window -> neutral measurement status, retain last-known value/timestamp when available, never Normal.
2. Valid/current value inside configured safe boundaries -> Normal, green.
3. Value reaches/passes a configured critical boundary in the unsafe direction (`<=` lower, `>=` upper) -> Critical, red.
4. Outside safe but before a configured critical boundary -> Warning, yellow/orange.
5. Outside safe in a direction with no critical boundary -> explicitly `Outside safe range — Critical limit not configured`; do not imply a verified noncritical condition or silently invent a cutoff. This configuration-required state must be distinct from Normal and verified Warning.

Keep Fix #2 safe labels visible and distinct from value/status. Show configured critical limits or the missing-configuration message. Aggregate tank status must carry missing/stale/configuration-required information instead of treating unavailable parameters as healthy; a valid Critical reading remains prominent.

Honor source validity/freshness flags first. Age-based expiry needs a confirmed per-parameter policy, using the existing database-derived clock; no device-clock authority and no borrowed automation timeout. For manual ammonia, retain `Latest saved scan` and its scan time; use a recency label only after its separate policy is approved. Do not infer that a historical strip result describes current water.

Rollout is configuration-first: review/record verified boundaries and freshness policy before activating the new policy for a tank. If settings later become incomplete, display the explicit configuration-required state and preserve hardware protections. Approval of the implementation approach alone does not validate any numeric boundary.

### 3. Alert consistency and deduplication

Move water-condition alert decisions to one database-authoritative evaluator using effective settings, canonical reading/scan IDs, and server time. After validating server behavior, remove overlapping client creation for those conditions; clients continue displaying/refetching alerts. Keep operational sensor-fault alerts separately identified.

Use a stable tank + parameter + unsafe-direction incident identity, not the formatted numeric message. Update an existing incident with the latest value; emit a new notification on initial opening and a verified Critical escalation. Reuse the existing one-hour anti-repeat duration as the initial notification policy, subject to approval, rather than inventing numeric hysteresis. Deduplicate ammonia by scan ID plus parameter. Resolve only on a valid/current safe reading; stale/missing/error data must not resolve an incident. Preserve notification preferences.

Threshold updates must reconcile current eligible readings for only the affected tank; account changes reconcile tanks inheriting the changed fields. Historical readings/alerts are not reclassified or rewritten. Notification cooldowns are separate from pump/feeder cooldowns. Database locking/uniqueness must prevent concurrent client/trigger duplicates during rollout.

### 4. Automation boundary

Leave existing firmware, uploaded directional statuses, pump/feeder rules, pin assignments, and automation settings unchanged. New UI/alert severity is presentation/notification policy, not a replacement actuator command. Explicitly disclose any remaining raw-hardware/new-policy mismatch. A later firmware adapter requires confirmation of installed versions, reviewed mappings and bench testing before deployment; no such deployment is authorized by this proposal.

## Expected implementation files and SQL, after approval

Application/Edge: `src/utils/thresholdResolution.js`, `supabase/functions/_shared/thresholdResolution.js`, `src/utils/thresholdSettings.js`, a portable classifier, `src/utils/sensorAlertRules.js`, `src/screens/main/settings/DefaultThresholdsScreen.js`, shared sensor cards and affected aggregate screens as needed, AI context/threshold validation code, and relevant regression scripts. Preserve `useThresholdRefresh` lifecycle and tank isolation.

Separate SQL migration: extend the JSON key contract and validation in `craythrive_threshold_values`/`apply_tank_thresholds`; add effective critical resolution and a numeric server classifier; adapt reading/scan alert triggers and incident deduplication; add scoped threshold-change reconciliation. Review a concrete migration before application. No database timezone change, destructive DDL, automatic critical backfill, raw-reading updates, or firmware changes. Existing RLS/authentication and mobile push preferences must remain effective.

Separate Vite source changes remain pending until that codebase is accessible. Precise Vite filenames cannot be established from this workspace.

## Verification completed and planned

Completed audit/baseline checks:

- Live read-only schema, JSON-key, trigger and function audit.
- Current evaluator reproduction cases listed above, including false Normal for stale/error data.
- `node scripts/check-safe-ranges.cjs` passed: five labels, tank/account isolation, existing card renders, refresh lifecycle with no mutations.
- `node scripts/check-sensor-monitoring.cjs` passed: current evaluator/transforms, screen/query fixtures and scoped lint (zero errors/warnings).

These passing checks validate the existing baseline, **not implementation of Fix #3**. No Fix #3 build/deployment or hardware acceptance test has been performed.

After approval, required tests include exact safe/critical equality, just-inside/outside each boundary in both directions, missing/invalid/explicitly stale/numeric last-good values, configured age and device-clock changes, ammonia scan age/status disagreements, tank/account isolation and persistence across safe edits, threshold refresh, client/Edge/SQL fixture parity, incident concurrency/oscillation/escalation/recovery, notification preference preservation, and unchanged automation safety fixtures. Cross-application comparison and physical interlock tests remain manual until the Vite project and installed firmware are available.

## Approval and missing inputs

Requested approval: implement the configuration-first application/database approach above, keeping pump/feeder/firmware behavior unchanged and reviewing the actual migration separately before applying it.

Still needed: verified critical boundaries and units for all supported unsafe directions; water safe maximum if upper classification is required; approved freshness/recency policies for live sensors and manual ammonia; calibrated strip interpretation; installed sensor/actuator firmware versions; and access to the separate Vite project. Unverified downloaded constants will not be adopted automatically.

Actual files added for this audit:

- `supabase/audits/audit-classification-policy.sql` — read-only inspection, not a migration.
- `docs/classification-proposal-20261011.md` — findings and proposed implementation for approval.
