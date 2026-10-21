# AI provider request budget fix — October 6, 2026

## Confirmed cause

Read-only live diagnostics showed multiple requests reaching `provider_response`, with provider HTTP 413 and `AI_PROVIDER_RATE_LIMIT` (provider error code `rate_limit_exceeded`), subsequently mapped to generic `AI_PROVIDER_UNAVAILABLE`. Example request: `06785488-c720-4327-9803-cd9e1610af28`. No private prompt, response, credential, or account data was printed.

The request serialized the same current water record twice, repeated long metric reasons/raw statuses across ten sensor rows, supplied verbose alert/control histories, pretty-printed the context, and replayed long rule-fallback messages as conversation history. Small-context QA had passed earlier; it did not reproduce the full-history size of the failing session.

An isolated authenticated QA user/owned tank reproduced failures for both threshold review and comparison using a large synthetic context/history against deployed version 5. The provider was reached, but both Edge requests returned HTTP 502 / AI_PROVIDER_UNAVAILABLE. The helper's exit status alone is not the proof: the saved before-results explicitly contain FAIL rows.

## Fix

- The server now sends a compact provider context: current water and ammonia records remain separate, with original timestamps/values, saved thresholds, overall rule status, up to four separate recent water/scan events, and small alert/control summaries. It removes duplicate `latest_reading`, diagnostic status reasons and raw metadata from the provider request.
- Context is compact JSON, capped at 5,000 characters, with bounded scalar strings. Available-history counts and truncation metadata prevent implying that omitted history was fully inspected. At least two events per source are retained when present for comparisons.
- Provider conversation history is capped at 1,600 characters. Fallback/error replies are excluded on both the client and server, including older-client fallback text. Relevant user questions and recent genuine AI replies remain available for follow-ups.
- HTTP 413 is classified as AI_CONTEXT_TOO_LARGE, with a specific client explanation instead of a generic unavailable response. No blind retry, model/key change or paid-plan change was made. Ordinary provider rate limits still apply.
- The public alerts schema was independently inspected. It has `type` and no `alert_type`. Mobile sensor/scan alert insertion now uses the actual column. No database schema change was needed. This mobile change requires a subsequent app update for installed APKs.

## Live result

The same large synthetic context/history was retested against deployed version 6:

| Question | Before (v5) | After (v6) |
| --- | --- | --- |
| Review my current thresholds. | HTTP 502, provider unavailable | HTTP 200, real AI answer, response_validation |
| Compare the latest and previous readings. | HTTP 502, provider unavailable | HTTP 200, real AI answer, response_validation |

No rule fallback was counted as a real AI answer. A non-owned tank continued to return HTTP 403. Only newly created isolated QA users/tanks were removed; cleanup passed for both runs. No farmer readings, alerts, orders, hardware or push messages were created/changed. Function metadata verifies `craythrive-ai-guide` ACTIVE, version 6, `verify_jwt: true`.

The server repair applies to existing APK requests immediately. Client history filtering/error copy and corrected mobile alert insertion are workspace changes that an existing installed APK will receive only in a later app build/update. Native phone retesting of this repair remains unverified.

## Checks

- `node scripts/check-ai-request-budget.cjs`: full context size, preserved values/timestamps/thresholds, independent sensor/scan history, comparison coverage, fallback exclusion, specific 413 error, no blind retry, malformed array handling.
- Existing AI service/conversation, ammonia and sensor-monitoring suites passed.
- Expo Android production export passed: 1,444 modules, 44 assets, Hermes bundle.
- Expo ESLint, scoped test/Edge ESLint, and cached Deno TypeScript check passed.
- No APK build. No provider secrets or schema changes. The existing harmless terminal-color tooling warning appeared during export.

## Notification query

`supabase/audits/test-my-notification.sql` contains a read-only account/token check and one labelled test-alert INSERT for manual use. Replace YOUR_LOGIN_EMAIL with the actual CrayThrive mobile login email. Supabase SQL Editor does not provide the mobile user's auth.uid(). The script was prepared, not executed.

The linked project's deployed-function list still contains only the AI function, so `send-craythrive-push` is absent. The query can exercise in-app alerts/the bell, but automatic phone push also requires the existing sender, server secret and database webhook setup documented in `docs/mobile-notifications.md`.

## Files changed

1. `supabase/functions/craythrive-ai-guide/index.ts`
2. `src/services/aiGuideService.js`
3. `src/utils/sensorAlertRules.js`
4. `scripts/check-ai-request-budget.cjs` (new)
5. `scripts/check-ammonia.cjs`
6. `supabase/audits/test-my-notification.sql` (new, not executed)
7. `docs/ai-guide-release-fix.md`
8. `docs/mobile-notifications.md`
9. `docs/ai-provider-request-budget-fix.md` (new)
