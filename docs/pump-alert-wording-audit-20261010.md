# Drain/refill wording audit — 10 October 2026

Mobile and Supabase changes are complete and verified. The React + Vite web
repository was not present in the current workspace or the likely local project
folders inspected. Its path was requested. Web frontend changes and browser tests
remain pending; do not treat this report as a completed web UI audit.

## Confirmed source

The live Supabase project is `abtzkqfrwzcocyrwcrfc`.

Both misleading pump messages originated in SQL function
`public.create_actuator_alert_from_command()`, attached to `device_commands` by
`trg_create_actuator_alert_from_command`. Its success branches formatted
`round(coalesce(new.duration_ms, 0) / 1000.0)` as actual runtime for both
`DRAIN_FOR` and `REFILL_FOR`. `duration_ms` is requested command timing; it does
not establish actual relay runtime. The refill title was `Refill completed`.

The second SQL source is `public.create_alert_from_control_log()`, attached to
`control_logs` by `control_log_alert_trigger`. It generated generic activity
titles and used `new.notes` for the message, so misleading or generic notes could
reach notifications. It did not propagate the existing activity metadata.

The mobile app did not generate the original drain/refill success wording:

- `NotificationBell.js`, `AlertItem`: rendered stored alert title/message.
- `ReportsScreen.js`, `AlertRow`: rendered stored alert title/message.
- `ReportsScreen.js`, `ControlLogRow`: rendered action type/status and raw notes.
- `send-craythrive-push/index.ts`, `deliveriesFor`: forwarded stored alert text.

Tank Details has no separate drain/refill activity renderer in this mobile
repository. Its header notification feed uses `NotificationBell`. No separate
local pump-notification scheduler was found; remote push content is generated
by the Edge sender. The source of any web-only `Completed successfully.` card
cannot be identified without the web source folder.

## Corrected behavior

- Successful drain: `Drain completed` / `The drain pump was activated.`
  Requested and actual drain durations are never shown in these descriptions.
- Successful refill: `Add Water completed`. An explicit positive
  `actual_duration_ms` or `actual_duration_seconds` supplies its runtime.
  Examples: `1 second`, `2 seconds`, `0.2 seconds`, `1.25 seconds`.
- Unknown refill runtime: `The refill pump was activated.` No requested duration,
  `run_seconds`, or `pulse_ms` is presented as proven runtime.
- Rejected/failed states remain rejected/failed. Explicit execution status takes
  precedence over historical success titles. Pending/unknown activity is never
  described as completed. The alert read/resolution status `active` is not an
  actuator execution status.
- Historical mobile alerts and activity notes are formatted at rendering time;
  stored rows are not rewritten.
- Manual and automatic/rule-based actions share the same formatting. No origin
  branch introduces different success wording.
- New database-generated alerts have corrected text, benefiting web consumers
  that display the stored text. Web historical rendering, Recent Tank Actions,
  Tank Details activity, and toasts still require frontend inspection.

## Database and deployment

Applied `supabase/setup/fix-pump-alert-wording.sql`: a non-destructive SQL function
update, not a table/column/schema or threshold migration. It adds the pure
formatter `public.craythrive_pump_action_wording(jsonb)` and updates the two
existing alert generators. Their execution-status guards, deduplication,
recipients, severities, and non-pump behavior remain intact. No new tables or
columns were created.

New command alerts retain command type, execution status, and requested
`duration_ms` in metadata. Activity alert metadata retains the original metadata
alongside control log ID, action type/status, and notes. The application script
checked for source drift before replacing either function. Before/after hashes
of **every existing row** in `alerts`, `device_commands`, and `control_logs`
matched inside the transaction before commit, including all duration fields and
metadata. There was no historical rewrite or command execution.

Deployed `send-craythrive-push` with the wording formatter. Webhook authentication,
canonical database recipient lookup, token handling, notification preferences,
and delivery deduplication remain intact. Identifiable pump events now use the
existing `pump_alerts` preference even when their legacy type is
`actuator_command` or `control_log`.

The mobile and Edge formatter files are byte-identical copies because EAS
excludes `/supabase`, while Edge deployment packages its own function source.
The wording check enforces equality without importing server paths into the APK.

## Validation

No real pump commands or live test notifications were sent. Manual/automatic
results below are synthetic flow tests, not physical hardware verification.

| Requirement | Result |
| --- | --- |
| Web manual drain | Corrected SQL-generated alert text verified; browser/activity rendering pending web folder |
| Mobile manual drain | PASS formatter, historical feed and report rendering, light/dark themes |
| Automatic/rule-based drain | PASS isolated SQL command/control-log generators and shared formatter |
| Drain rejected | PASS; remains rejected, no completion text |
| Drain failed | PASS; remains failed, no completion text |
| Manual refill, actual 1 second | PASS; singular `1 second` |
| Refill, actual 2 seconds | PASS; plural `2 seconds` |
| Automatic refill | PASS explicit actual runtime and unknown-runtime fallback |
| Duration metadata | PASS fixture immutability and live historical row-hash preservation |
| Web/mobile same meaning | SQL, mobile and push match 29 fixtures; web frontend rendering not yet tested |

Checks completed:

- `node scripts/check-pump-wording.cjs`: 29 wording fixtures; mobile feed and
  report render checks in both themes; actual Edge delivery formatting;
  deployment-copy equality; no mutation of input metadata/statuses.
- 29 matching SQL formatter fixtures in a rolled-back transaction, and again
  against the deployed pure formatter.
- `scripts/pump-wording-sql-fixtures.cjs`: 22 isolated trigger cases using
  temporary command/activity/alert tables and a stub notification helper.
  Covered successful, rejected, failed, manual/automatic cases, actual refill
  durations, metadata retention, and unchanged-status deduplication. Rolled back.
- `node scripts/check-mobile-notifications.cjs`: PASS, including sender
  authentication, preferences, recipient lookup, error handling and login.
- `node scripts/check-mobile-ui.cjs`: 68 syntax/import/Expo transformations;
  all 24 screens rendered in both themes; no hook or undefined-variable failures.
- `npm run lint`: PASS; no errors or warnings.
- Cached Deno check for the Edge sender: PASS.
- Expo Android Hermes export: PASS, 1,445 modules and 44 assets, written to the
  temporary directory. This is not an APK build.

The export emitted only the existing harmless `NO_COLOR`/`FORCE_COLOR`
environment warning. No APK was built. Installed APK historical rendering still
needs a future build containing the mobile changes. New server-generated alerts
and future pushes use the backend wording immediately.

## Exact workspace files changed

Mobile:

1. `src/components/ui/NotificationBell.js`
2. `src/screens/main/ReportsScreen.js`
3. `src/utils/pumpActionWording.js` (new)

Supabase:

4. `supabase/functions/send-craythrive-push/index.ts`
5. `supabase/functions/_shared/pumpActionWording.js` (new)
6. `supabase/setup/fix-pump-alert-wording.sql` (new, applied)

Checks and documentation:

7. `scripts/check-mobile-notifications.cjs`
8. `scripts/check-pump-wording.cjs` (new)
9. `scripts/pump-wording-sql-fixtures.cjs` (new)
10. `docs/pump-alert-wording-audit-20261010.md` (new)

Web frontend files changed: none; repository path is still required.

No actuator/sensor firmware, GPIO mapping, threshold logic/migration, AI Guide,
execution status logic, Add Tank, or unrelated screen was modified.

## Remaining phone/web checks

After the next authorized mobile build, check an existing successful drain in
the bell feed and Reports: no seconds; rejected/failed drains retain their
status. Check a refill with explicit actual runtime and one with only requested
runtime. During the next normal manual or automatic action, confirm its new
alert and any enabled background push use the same wording. These checks should
not require changing pump timing or issuing extra test commands.

Provide the web repository path to finish Recent Tank Actions, historical alerts,
Tank Details activity, toast inspection, and web browser validation.
