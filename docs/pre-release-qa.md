**CrayThrive mobile pre-release QA — 2026-10-05**

**READY for a new EAS preview build for controlled physical-phone QA.** The final post-install, Android export, Expo Doctor, ESLint and executable regression checks pass. This verdict covers build health and the tested client logic. Live Supabase authorization, deployed AI/push services, real device layout and notification delivery still require the checks below before release approval. No EAS cloud build or APK compilation was started.

Testing used the existing Expo SDK 54 project, Babel/VM mocks and lightweight Node checks. No testing framework or dependencies were installed. No account was created, password changed, live database row written, schema changed, Edge Function deployed or pump/feeder command executed. Network access was used for Expo Doctor's diagnostic metadata only. Existing Marketplace, navigation, themes, monitoring, session persistence and Supabase flows were preserved.

**Commands actually executed and final outcomes**

On Windows, `npm.cmd` and `npx.cmd` were used to avoid the sandbox PowerShell execution-policy restriction on `.ps1` wrappers. Exports were placed in the Windows temporary directory, outside the workspace.

| Check | Final result | Evidence / limitations |
| --- | --- | --- |
| `npm.cmd pkg get scripts` | PASS | Inspected scripts; there is no `test` script or Jest dependency. |
| `npm.cmd run eas-build-post-install` | PASS | HTTPS Supabase endpoint and public client key accepted; private/unapproved client config remains rejected. Passed before and after fixes. |
| `npx.cmd expo-doctor` | PASS | Final network-enabled run: **18/18 checks passed**. No checks were disabled. |
| `npx.cmd expo export --platform android --output-dir <temporary directory>` | PASS | Actual Metro/Hermes Android export, **1,441 modules**, 44 assets, approximately 5.02 MB `.hbc`. No `--no-bytecode` workaround. Baseline and final exports both passed. |
| `npm.cmd run lint` | PASS | Existing Expo lint command returned exit code 0 before and after fixes. |
| `node node_modules/eslint/bin/eslint.js scripts/check-prerelease-qa.cjs` | PASS | New QA script also passes ESLint. Existing suites explicitly assert zero errors and warnings in their scopes. |
| `npm test` | N/A | No existing test script; ran executable suites below instead. |
| `node scripts/check-sensor-monitoring.cjs` | PASS | Mapping, thresholds, missing values, ammonia chronology, four-screen consistency, shared cards, alerts and lifecycle checks. |
| `node scripts/check-marketplace.cjs` | PASS | **15 behavior groups**, import/syntax/Expo transforms and scoped lint. |
| `node scripts/check-ai-guide.cjs` | PASS | Client errors/retry/session renewal, server scope/ownership checks with mocked provider, bounded requests and apply flow preserved. |
| `node scripts/check-mobile-notifications.cjs` | PASS | Mocked session restoration/logout, token lifecycle, sender authorization/recipient logic, permission and tap handling. |
| `node scripts/check-mobile-ui.cjs` | PASS | **64 source files** parse/import/transform checks; **24 screens** render in both themes; navigation at 320/360/412/600 dp, keyboard, image fallback and busy-action checks. |
| `node scripts/check-security-hardening.cjs` | PASS | Public-key guard, URL/image/destination protection, redacted logging, recovery privacy, actual three cloud profiles and rejected-config tests; zero scoped lint errors/warnings. |
| `node scripts/check-prerelease-qa.cjs` | PASS | **16 focused groups**, including actual auth/ammonia/chat/cancel handlers and Marketplace filter interactions. |
| `node scripts/check-release-security.cjs` | PASS | **Zero private-value findings** in scanned files/index/available history. No secret values printed. Available repository history contains zero reachable commits. This scanner does not decode the exported Hermes bytecode. |
| Mobile-only `rg` search for requested secret names/prefixes | PASS | No matches in `src/` or `app/`; `rg` returns 1 for no matches, which is expected. Server-side symbolic environment references remain outside the client. |

The initial sandbox `npx expo-doctor` attempt failed with registry/network `EACCES`. The already installed Doctor could run 16 local checks, but its two online checks also lacked network access. A network-enabled rerun resolved this environmental restriction and passed 18/18; the final requested `npx.cmd expo-doctor` rerun also passed 18/18. The SDK and dependency versions were not changed. [Expo Doctor documentation](https://docs.expo.dev/develop/tools/#expo-doctor) describes its config and dependency checks.

**Area-by-area results**

PASS below means the listed client/fixture checks passed. It does not imply that a physical Android phone or deployed service was exercised.

| Requested area | Result | Tested behavior |
| --- | --- | --- |
| Baseline / build health | PASS | Scripts, configuration, navigation, Supabase session storage, transforms, full Android export, Doctor and lint. |
| Authentication | PASS, mocked | Login/register/reset empty and malformed inputs, password/name/terms validation, readable incorrect-credential feedback, rapid taps and loading release. Existing notification suite exercises saved-session startup, offline restoration retry and failed/successful logout. AI suite exercises expired-session refresh and terminal auth failures. Real verification/recovery emails remain a phone/service test. |
| Dashboard / tanks | PASS, fixtures | Empty/missing data, paired/unpaired state, latest reading queries, mapping and Android Back; no synthetic zero for missing metrics. |
| Normal / Warning / Critical | PASS | Exact current/default and alternate threshold fixtures, consistent labels/icons/colors, partial readings and neutral operational states. No stale farmer-facing status/distance usage in the monitored paths. Marketplace/order states are preserved. |
| Tank Details | PASS for existing monitoring; control coverage N/A | Shared sensor cards, condition, device/pairing and navigation render checks pass. **Feed Now, Fill and Drain executable controls do not exist in the current mobile screens** (also recorded in the prior UI audit). There is no mobile hardware command handler to validate. No new hardware controls were invented. |
| Ammonia | PASS | Latest usable sensor/scan selection, distinct scan/sensor timestamps, configured maximum, null/missing neutral states, valid zero, invalid input rejection, duplicate save prevention and retry after a failed save. |
| Marketplace | PASS, mocked | Legacy null/missing category, all eight categories, search by brand/SKU/location, stage filter/reset, all five tabs, general/crayfish cards, Details/Back/Chat callbacks, reservation validation/locking, listing state/history protection, cancellation constraints and recipient unread updates. |
| Seller Profile / Add Listing | PASS, mocked | Shared `seller_profiles` upsert by `user_id`, all shared fields, failed-load protection, required contact/pickup fields, each store URL, dialable mobile limits, all categories, general product fields and breeder trio payload. Live web/mobile shared-record consistency remains a two-client check. |
| AI Guide | PASS, mocked | CrayThrive question and unrelated-question denial, loading/retry/errors, session renewal, long answer and threshold card rendering, apply confirmation/duplicate guard/already-applied guard. Server-only scope/ownership restrictions were preserved. No real provider was called or function deployed. |
| Reports | PASS, fixtures | Same readings and thresholds as Dashboard/Tank Details/AI, newest saved readings independent of report week, paired/unpaired state, no data and both-theme rendering. Chart appearance/long rows on a real phone remain manual. |
| Settings | PASS, mocked rendering/handlers | Both themes, Back destinations, busy form interception, profile/seller load guards, password form guards and persistent-session/logout coverage. Actual OTP delivery/password mutation were not attempted. |
| UI / responsiveness | PASS for automated coverage; native inspection pending | Light/dark render checks, static icons/imports/styles, five bottom navigation targets at four widths, keyboard handling and image fallback. Marketplace category/search interactions additionally run at 320/360/412 dp in both themes. These are mocked trees/style checks, not native Yoga pixel measurements or screenshots. |
| Security sanity | PASS for static/mocked scope | No true private credential found; client-public Supabase URL/key allowed, server secret references excluded from mobile source, raw credentials/tokens not logged. Deployed RLS, storage/RPC authorization, concurrent reservations and real backend rate limits were not assessed live. |
| Automated logic tests | PASS | Existing lightweight runners reused; no Jest/testing-stack installation. Focused regressions reproduce the bugs below and pass after fixes. |
| Final retest | PASS | Post-install, network-enabled Doctor, real Android export, Expo lint, all existing suites and focused QA rerun after runtime fixes. |

**Confirmed bugs and fixes**

1. Login, Register and Forgot Password only checked for `@`, allowing malformed addresses such as `@` or `farmer@` to reach Supabase. Added a shared basic email validator and connected all three forms. Tests confirm zero auth calls for malformed inputs and one request for valid rapid submissions.
2. `classifyManualAmmonia` converted blank/whitespace/null/boolean/array inputs into numeric zero through `Number(...)`. It now rejects missing and nonnumeric input types before conversion. Genuine numeric zero remains valid.
3. Ammonia Save depended on asynchronously updated `saving`/`saved` state. Two rapid presses inserted two readings. Wrapped Save in the existing synchronous single-flight hook and retained the saved result identity to reject stale successful callbacks. Tests cover duplicate presses, stale callbacks and failure/retry.
4. `saveAmmoniaReading` trusted `shouldSave` without checking the actual measured ammonia value. It now rejects null, nonnumeric, negative or nonfinite measurements before auth/database calls, while preserving actual zero and the existing table/payload.
5. Seller Profile accepted letters and arbitrary-length digit sequences because it only counted a minimum of ten digits. Validation now permits common phone formatting and matches Product Details' 10–15 digit dialer limits with an optional leading `+`. Existing normal local and international formatted numbers remain valid.

The new QA tests reproduced these issues before fixing them and were rerun after the fixes. The harness initially lacked the runtime `URL` global, producing false failures for valid store URLs; this test-only gap was corrected before diagnosing production links. There was no production external-link regression.

**Monitoring/data correctness**

- Temperature prefers `temperature_c`; pH prefers `ph_value`; water depth prefers `water_depth_cm` with the existing `water_level` alias. `water_distance_cm` is never used as actual depth.
- With the tested minimum of 4.5 cm, 0.6 cm depth is unsafe; pH 4.8 below the tested pH minimum is unsafe. Firmware labels cannot make them Normal/green. In-range temperature is Normal and uses the shared success color.
- Missing/invalid values render `--` with neutral No Data/No Reading state. Unpaired/Waiting remain neutral; actual zero is distinguished from absent data.
- All four monitoring consumers fetch the same latest sensor/scan data and current saved thresholds. Changing thresholds reevaluates display severity without changing measurements. Ammonia uses its actual measurement and its own timestamp.
- Scanner reference/calibration status metadata is preserved; farmer-facing result severity uses the current shared evaluator. No reading rows were fabricated or rewritten.

**Exact files changed in this QA task: 11**

The manifest was compared with file hashes captured at the start of this task. Earlier Marketplace/UI/security/EAS changes are excluded from this manifest.

1. `src/utils/emailRules.js` — new shared validator.
2. `src/screens/auth/LoginScreen.js` — email validation.
3. `src/screens/auth/RegisterScreen.js` — email validation.
4. `src/screens/auth/ForgotPasswordScreen.js` — email validation.
5. `src/utils/ammoniaScanner.js` — reject absent/non-numeric manual inputs.
6. `src/utils/ammoniaReadings.js` — validate measured value before persistence.
7. `src/screens/main/AmmoniaReaderScreen.js` — single-flight Save and saved-result guard.
8. `src/screens/main/settings/SellerProfileScreen.js` — dialable mobile validation.
9. `scripts/check-mobile-ui.cjs` — export reusable harness without auto-running it on import; supply its missing `URL` global.
10. `scripts/check-prerelease-qa.cjs` — new 16-group offline QA runner.
11. `docs/pre-release-qa.md` — this report.

No `package.json`, lockfile, Expo SDK, EAS/app configuration, navigation/root file, database schema or unrelated screen was changed by this task.

**Remaining warnings and unverified checks**

- No remaining test failures, lint errors/warnings or React hook warnings in the completed checks. Metro emitted the environment-only `NO_COLOR`/`FORCE_COLOR` warning; export still succeeded. No app behavior changes were made to suppress terminal-color output.
- Native text wrapping, scrolling, camera permissions, keyboard/resizing, touch targets and image rendering still need a real Android phone. The bundled legacy logo asset is approximately 5.39 MB; this is an existing size concern, not an export failure, and was not changed.
- Feed/Fill/Drain controls are absent from the current mobile implementation. If required for this release, they need a separately specified hardware/control flow; this QA run cannot certify unavailable controls.
- This run did not validate deployed database RLS, storage policies, chat RPCs, stock atomicity or immutable order fields. Follow [the prior security audit](pre-release-security-audit.md) and its two-user server checks. Passing client guards does not prove server authorization.
- This run did not establish whether the hardened AI or push sender is deployed. The prior notification/security reports recorded unfinished backend deployment/setup. Follow [mobile-notifications.md](mobile-notifications.md); an APK export and permission prompt do not prove closed-app push delivery.
- AsyncStorage persistence and the existing local HTTP ESP32 provisioning exception remain documented in the prior security audit. No session-storage migration or hardware firmware change was attempted.

**Manual physical-phone/service checklist before release approval**

1. On a real Android phone, test valid/invalid login, registration and verification email, recovery email, offline reopen, background/reopen and logout/account switch. Confirm failed session restoration offers retry rather than silently losing the saved account.
2. Use empty, unpaired and paired tanks. Compare an existing low-depth/acidic reading across Dashboard, Tank Details, Reports and AI Tank Check with the same saved thresholds. Missing readings stay neutral. Change thresholds through the existing supported flow and refresh each view; verify consistent reevaluation.
3. Test camera/gallery permissions, denied access, manual ammonia zero and an above-limit value. Rapidly tap Save and confirm exactly one saved row. Simulate a failed save and retry. Confirm the ammonia scan timestamp is separate from sensor timestamp.
4. With two test accounts, publish a crayfish/breeder and general product, try all categories/search/stages and Details/Back. Save Seller Profile and verify the same record in the web dashboard. Open store links and the dialer with valid formatted numbers.
5. Reserve a product, see it under buyer Orders and seller Sales, chat from Browse/Details/orders, check unread counts and send a long message with the keyboard open. Cancel, Hide/Activate/Remove eligible listings, and verify reserved/sold history remains. Attempt concurrent reservations and direct unauthorized mutations through the controlled server QA procedure.
6. Ask CrayThrive and unrelated AI questions; verify denial, understandable API errors/retry, long responses and one-time Apply Threshold confirmation. Confirm the hardened deployed function rejects unauthorized tanks; never auto-execute recommendation hardware actions.
7. Test all screens in light/dark mode on narrow and larger phones, including long tank/product/device names, Reports rows/charts, Seller Profile/Add Listing fields, settings/OTP and Back. Keyboard and bottom navigation must not cover active inputs/content.
8. After confirming push sender/webhooks/FCM configuration, allow notifications and send a real chat/order/independent sensor event in foreground, background and after ordinary swipe-away. Verify account-switch privacy and delivery receipts. Test denied permission too; do not equate Android Force Stop with ordinary app closure.

The project can proceed to a preview build for these controlled checks when requested. No cloud build was started in this QA task.
