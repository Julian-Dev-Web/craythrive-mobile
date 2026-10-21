# AI Guide release fix ? 2026-10-05

October 6 follow-up: [provider request budget fix](ai-provider-request-budget-fix.md). Live farmer-session diagnostics exposed HTTP 413/rate_limit_exceeded. A large synthetic context reproduced the failure; compacting the provider payload fixed both live threshold-review and comparison tests. The current deployed version is 6; the version-4 results below describe the earlier release.

## Outcome and limits

The server fix is deployed to the linked CrayThrive project, abtzkqfrwzcocyrwcrfc. craythrive-ai-guide is ACTIVE, version 4, with verify_jwt still true. Required secret names AI_API_URL, AI_API_KEY and AI_MODEL were confirmed present immediately before deployment; no values were printed or added to the client.

All 12 exact Filipino/English prompts and three contextual follow-ups returned real provider answers through the deployed Edge Function and updated mobile service. Adobo returned HTTP 200/scope denied. A non-owned tank returned HTTP 403. These live tests used an isolated, temporary authenticated QA user and owned tank, synthetic reading context and no paired hardware. They did not use the farmer's account, a phone, actual sensor uploads or real tank conditions. Both temporary-account test runs reported successful cleanup of their created account and tank.

A final read-only check confirmed the latest QA user was removed and zero fixture rows remained in profiles, threshold_settings and tanks. The live function also rejected a missing-JWT request with HTTP 401.

A new APK is required for the mobile changes. The currently installed APK receives the deployed scope/parser improvements on its next server call, but does not yet have the new session checks, legacy parser recovery, fallback labels or friendly error messages. Installed-phone behavior is not verified here. No EAS/APK/native build was run.

## Confirmed root causes and evidence

1. The old mobile screen converted every caught failure into the same service-unreachable message. HTTP/provider failures, scope limitations, malformed responses and auth problems were indistinguishable on the phone.
2. Live server logs before deployment contained 5 HTTP 200 and 7 HTTP 502 AI invocations in the bounded preceding 24-hour window. Deployed version 3 did not log provider-error classifications or request stages for those non-success responses, so the historical phone question #3 cannot be uniquely correlated to its exact provider subreason. It would be inaccurate to call that historical request simply an APK/network failure.
3. After deployment, a rapid real-provider test reproduced HTTP 429 failures. Matching redacted server diagnostics explicitly showed stage=provider_response, provider_status=429 and error_type=AI_PROVIDER_RATE_LIMIT. Thus actual external-provider rate limiting, rather than a universal connectivity problem, is confirmed. Some requests worked while subsequent requests hit that limit. The paced retest below passed every prompt without rate-limit errors. No provider plan/quota/secrets were changed.
4. Deployed version 3 already allowed ?Ano ang dapat kong gawin muna?? in the supplied tank context. That exact prompt succeeded against the real provider in both post-fix live runs. The old scope guard did reject ?Bakit?? and ?Ano muna??; those separate follow-up defects are fixed.
5. The actual downloaded version-3 source was executed with an isolated malformed-optional provider-output fixture. It returned HTTP 200 with raw structured text as its answer, which matched the old APK's malformed-answer rejection guard despite an intact answer string. The updated parser recovered the answer, discarded malformed action data and returned recommendation_only. This reproduces a real deployed-code failure path; it does not claim that this fixture was the private output of the historical phone request.

Example confirmed rate-limit diagnostic: request 7722bf31-f4ca-4657-a58e-734da1bb965f, provider_response, provider_status 429, AI_PROVIDER_RATE_LIMIT. No prompt, context, provider response body, credential or stack trace is logged by the new diagnostics.

## Request path and changes

Quick Prompt and typed composer both call the same handleSendAi function, which loads the selected tank context and calls askCrayThriveAi. The service verifies getSession/access_token, refreshes a near-expired session, verifies getUser and invokes craythrive-ai-guide through the existing Supabase SDK. One HTTP 401 refresh/retry remains bounded; provider errors are not automatically retried by the application.

The function verifies the authenticated user and tank ownership, bounds question/context/history data, constructs canonical tank identity, performs scope classification, calls the HTTPS provider with redirects rejected and a 45-second timeout including response-body reading, parses provider output and validates optional actions. The client invocation timeout remains 60 seconds. Existing per-worker request protection is retained.

The scope guard combines the question, selected tank context and recent conversation. Short relevant follow-ups require context. Explicit recipes, politics, celebrities, unrelated programming and unrelated homework remain normal structured denials before a provider call.

The parser accepts plain JSON, JSON fences, harmless surrounding text and plain answers. A complete answer string can survive malformed/truncated optional fields; all unvalidated action data is dropped. Missing/bad numeric values, booleans, unknown parameters and invalid ranges cannot create an Apply card. Both allowed and denied responses include the existing contract fields, including suggestion_id and suggestion_saved.

Temporary provider, timeout, network and rate-limit failures can produce a clearly labelled rule-based answer for supported selected-tank questions. The fallback recomputes existing deterministic tank rules from attached latest saved readings and current thresholds. Missing water readings remain No Data; unpaired water devices remain Unpaired. Following the October 5 ammonia audit, `latest_sensor` and `latest_ammonia` remain separate in the context; the fallback states ammonia's own scan timestamp or No Scan, and preserves Critical scan conditions independently of sensor pairing. It does not invent threshold adjustments, generate an Apply card, perform historical comparisons or execute hardware. Threshold/history requests without a safe supported fallback receive a readable retry message.

The mobile uses the existing production Supabase client. Its persisted session and foreground AppState refresh behavior were retained. No provider endpoint or provider key is embedded in mobile source. The only http:// match in the relevant source search was the existing private-device URL helper for ESP32 setup, not an AI endpoint.

## Live tests after deployment

Each row below used the real current deployed function, a real QA login session and the updated mobile service. PASS means the expected scope and readable normalized answer were returned; it is not expert validation of the model's husbandry advice.

| Question/check | Result | HTTP | Final stage | Request ID |
| --- | --- | --- | --- | --- |
| Ano ang current condition ng tank na ito? | PASS | 200 | response_validation | `7d123434-f3fa-492e-b026-685e7826b0d3` |
| Pwede ba akong magpakain ngayon? | PASS | 200 | response_validation | `88cad603-7974-4207-b928-a027612952dc` |
| Ano ang dapat kong gawin muna? | PASS | 200 | response_validation | `55ad0edc-354e-42af-88a9-9168abf5ea3a` |
| May reading ba na kailangan bantayan? | PASS | 200 | response_validation | `7790f657-53e9-47aa-8e82-412ec0ef745b` |
| Review my current thresholds. | PASS | 200 | response_validation | `bc3d620e-044b-498d-a964-d6506703989c` |
| Compare the latest and previous readings. | PASS | 200 | response_validation | `146fe0a3-6cac-4300-8f3e-eadec722b80b` |
| Bakit mababa ang pH ng tank ko? | PASS | 200 | response_validation | `df3d5e44-f5f2-45da-9b5b-9de1cb8cfedd` |
| Ano ang pwede kong gawin kapag mababa ang water level? | PASS | 200 | response_validation | `ba819927-515a-4392-829a-2c9e2702b38f` |
| Safe ba ang readings ng crayfish tank ko? | PASS | 200 | response_validation | `f726fe57-8d1a-4056-bca1-1917166102d4` |
| Ano ang recommended action base sa latest readings? | PASS | 200 | response_validation | `5d85ee20-95cb-4b0b-9ebc-884050b46e04` |
| Base sa current readings ng tank ko, ano muna ang dapat kong unahin? | PASS | 200 | response_validation | `8b154326-ea67-4c41-8b31-b84259a0cc68` |
| What should I do first? | PASS | 200 | response_validation | `f73b85c8-a8c5-4995-b615-81adbdd8573c` |
| Bakit? | PASS | 200 | response_validation | `d0bc589b-db96-4260-bc57-b4ef3dcb30ee` |
| Ano muna? | PASS | 200 | response_validation | `0f0ca6bf-ee33-46d0-9a11-b73dc1ae6f7e` |
| Ano muna dapat kong gawin? | PASS | 200 | response_validation | `c7ec4be7-c5d9-4bf9-a25f-9571fa7b222b` |
| Paano magluto ng adobo? | PASS (normal denial) | 200 | scope_check | `b4ea8e1d-fa4e-4d9a-b778-c865f887a960` |
| Non-owned tank authorization | PASS | 403 | auth | `06ad2c8b-6c75-4fe7-8e7f-499d6863fa00` |

The live threshold-review answer was recommendation_only. A model should not be forced to invent a threshold adjustment merely to show an Apply card. Structured threshold suggestions, malformed optional fields and the Apply confirmation/duplicate guard were verified separately with controlled fixtures and rendered UI interactions.

The earlier rapid live run produced 5 real provider answers, 8 labelled rule-based fallbacks, 2 readable rate-limit errors (threshold review and an action wording subsequently added to supported fallback), and the expected unrelated denial. After expanding supported action/readings wording, the fallback regression matrix covers all ten supported non-threshold/non-comparison exact prompts for 429/502/504. The paced live retest above then returned real AI answers for all fifteen valid questions. Provider limits still apply to burst traffic.

## Required UI and safety matrix

| Check | Result | Evidence |
| --- | --- | --- |
| Quick prompt: Current condition | PASS | Actual rendered quick/manual equivalence and real-provider question 1 |
| Quick prompt: What should I do first? | PASS | Actual rendered quick/manual equivalence and real-provider question 3 |
| Quick prompt: Can I feed now? | PASS | Actual rendered quick/manual equivalence and real-provider question 2 |
| Quick prompt: Reading to watch | PASS | Actual rendered quick/manual equivalence and real-provider question 4 |
| Quick prompt: Review thresholds | PASS | Actual rendered quick/manual equivalence and real-provider question 5 |
| Quick prompt: Compare readings | PASS | Actual rendered quick/manual equivalence and real-provider question 6; missing prior data may be explained |
| Manual Filipino free-form | PASS | Exact free-form question returned HTTP 200 |
| Manual English free-form | PASS | What should I do first? returned HTTP 200 |
| Short follow-up: Bakit? | PASS | Multi-turn fixtures and real-provider HTTP 200 |
| Short follow-up: Ano muna? | PASS | Multi-turn fixtures and real-provider HTTP 200 |
| Unrelated adobo | PASS | HTTP 200 denied; scope guard makes no provider request |
| Provider-error fallback | PASS | Real burst-rate fallback plus deterministic 429/502/504 fixtures; visibly labelled CrayThrive Rules |
| Structured threshold suggestion | PASS | Valid parameter/range survives; malformed optional fields retain answer without Apply |
| Apply Threshold flow | PASS (controlled UI/service checks) | Confirmation, synchronous save lock and already-applied guard retained; no real threshold or hardware change during this audit |

## Quality checks

- check-ai-guide.cjs: PASS ? syntax/imports, Expo transformations, session renewal, retry/duplicate guards, ownership/bounds, HTTPS/provider failures and ESLint.
- check-ai-conversations.cjs: PASS ? exact prompts, context/history, unrelated denials, parser recovery, safe diagnostics, valid suggestions, deterministic fallbacks, session preflight and rendered quick/manual equivalence.
- check-mobile-ui.cjs: PASS ? all 24 screens in light/dark themes, narrow widths, keyboard/Back handling and Apply confirmation/duplicate protection.
- check-prerelease-qa.cjs: PASS ? 16 behavior groups, including long AI answers and threshold/recommendation rendering.
- check-marketplace.cjs: PASS ? 15 behavior groups; existing Marketplace behavior retained.
- check-security-hardening.cjs: PASS ? safe config, payload-free client logging and release archive guards.
- npm run lint: PASS ? zero errors and warnings.
- npm run eas-build-post-install: PASS ? HTTPS/public-only build config.
- Deno check --node-modules-dir=none --no-lock: PASS. Dependencies stayed in Deno's isolated cache; no Expo package/provider SDK was added.
- expo export --platform android: PASS ? production-oriented preview-profile public configuration, NODE_ENV=production, dotenv disabled; 1,444 modules, 44 assets, 5.04 MB Hermes bundle. Output in the system temporary directory, craythrive-ai-android-20261005.
- An additional --no-bytecode export was used solely to inspect parsed string literals. Both exports contain the verified production Supabase URL/public key. The JS literal scan found no provider configuration names, provider keys, Supabase secret keys, management tokens, private keys or service-role JWTs. No build profile was changed to disable bytecode.

The deployment uploaded the entrypoint and both shared pure helpers. The downloaded deployed entrypoint matched the tested local source byte-for-byte. The CLI's safe download guard rejected extraction of shared helper source outside its functions folder; actual deployed calls and diagnostics independently verified those imports execute successfully. This is a source-download tooling limitation, not a failed deployment.

Remaining notices: Node's NO_COLOR/FORCE_COLOR notice and the intentional --no-bytecode inspection warning are nonblocking. There are no syntax, import, transformation, lint or Deno type errors. Live provider rate limits remain and cannot be removed by changing app parsing. Per-worker throttling remains best-effort, not a durable distributed quota. Native installed-phone QA is still required after a new APK is built.

## Exact workspace files changed

- `src/screens/main/AiGuideScreen.js` ? Friendly classified errors and clearly labelled CrayThrive Rules bubbles; existing quick/manual send, retry and Apply flows preserved.
- `src/services/aiGuideService.js` ? Session presence/expiry checks, bounded auth renewal, legacy-response recovery, safe response/error normalization and rule-based fallback.
- `src/utils/aiScope.js` ? Shared credential-free, context-aware domain guard; explicit unrelated topics remain denied.
- `src/utils/aiResponseParsing.js` ? Shared JSON/fence/prose parsing and complete-answer recovery that drops malformed optional actions.
- `src/utils/aiFallback.js` ? Labelled deterministic recommendations using existing tank rules, saved readings and thresholds.
- `supabase/functions/craythrive-ai-guide/index.ts` ? Contextual scope, robust answer normalization, stricter numeric validation and redacted request-stage/provider diagnostics; deployed.
- `scripts/check-ai-guide.cjs` ? Reusable auth/provider fixtures and updated regression checks for the production flow.
- `scripts/check-ai-conversations.cjs` ? Exact prompt matrix, rendered quick/manual equivalence, parsing, fallback, diagnostics and release-session regressions.
- `scripts/check-mobile-ui.cjs` ? AI service overrides for real rendered interaction tests; retained existing screen and Apply regressions.
- `docs/ai-guide-release-fix.md` ? This evidence, deployment, test and release report.

No package/config files, database schema, provider secrets or unrelated app screens were changed in this fix. Live QA helper programs and redacted result metadata were kept in the system temporary directory; private credentials were passed in memory only.

## Phone checklist after a separately authorized APK build

1. Sign in, select your own tank and check the latest saved readings. Tap each of the six Quick Prompts, then type the same text and confirm equivalent behavior.
2. Ask the Filipino and English free-form questions; follow a tank answer with Bakit?, Ano muna? and Ano muna dapat kong gawin? Confirm tank/history context is retained.
3. Ask Paano magluto ng adobo? Confirm a normal scope-denial bubble, not a service error.
4. If a temporary provider limit occurs, confirm supported questions show CrayThrive Rules and a labelled fallback. Threshold/history requests should show a readable wait/retry message rather than a false AI answer.
5. On a valid threshold suggestion, cancel confirmation first. Then confirm once and check the saved threshold. Repeated taps must not save twice. Ordinary or malformed suggestions must not show Apply; recommendations must not claim hardware was executed.
6. Background and reopen the app, then repeat a question. Confirm the saved login remains and session refresh works. This audit did not operate the installed phone.

## Documentation references

Supabase documents [server-side admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [function invocation](https://supabase.com/docs/reference/javascript/functions-invoke), [Edge Function deployment](https://supabase.com/docs/reference/cli/supabase-functions-deploy) and [bounded Management API log queries](https://supabase.com/docs/guides/observability/advanced-log-filtering). Those official interfaces were used for the isolated QA login, deployed function and redacted log inspection.
