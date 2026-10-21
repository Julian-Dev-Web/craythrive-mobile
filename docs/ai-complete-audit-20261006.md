# AI flow audit — October 6, 2026

## Changes

The first quick question is now **Preview threshold change**. It asks which parameter and values the user wants, then requests a proposal. It supplies no preset range, performs no save, and is disabled while sending. The six existing questions remain available. A short reply such as `temp 25 to 30` or `25–30°C` stays in scope only with a selected tank and a recent user threshold conversation. Ambiguous parameters still require clarification.

Static provider instructions were reduced from 6,457 to 3,835 characters (41%). This is a character reduction, not a claimed exact token reduction. Scope, manual ammonia handling, timestamps, hardware restrictions, output JSON, parameter bounds and confirmation rules remain explicit. Current sensor and ammonia snapshots remain separate. Up to four events per source are retained, with at least two when available for comparisons; the compact context remains bounded to 5,000 characters.

The 1,600-character conversation budget now retains the two most recent user questions (up to 600 characters each) and two assistant replies (up to 200 each), in original order. Previously, a long assistant reply could cause an earlier question to be discarded when the budget loop stopped. Errors and rule-based fallback text remain excluded. Older history can still be omitted; the model is told to ask for missing details rather than invent them.

The existing output limit remains **800 tokens**, preserving room for structured proposals. Current questions retain the existing 2,000-character limit. The sender still avoids automatic repeats of billable provider failures; authentication can refresh once. Existing per-worker user request throttling, timeouts and labelled rule-based fallbacks are preserved. These bounds reduce request size; they do not override the provider's account quotas or guarantee service availability.

Validated numeric `prompt_tokens`, `completion_tokens` and `total_tokens` are now returned as response metadata and logged with the request ID. No provider body, question, answer, key, or JWT is included in this usage log. Missing/malformed usage metadata does not break an otherwise valid answer. Token counts are not estimated from character counts.

## Local checks

- AI conversations and all six existing quick/manual questions; new quick question at 320 dp in both themes.
- All five threshold proposal contracts; invalid, unchanged and unsupported proposals produce no Apply action.
- Actual rendered preview -> Cancel writes nothing; confirmed Apply changes only the current account's temperature and cannot save twice.
- Context/history budgeting, long-answer follow-ups, repeated-role history, numeric-only usage, malformed usage and no blind provider retry.
- Auth/session refresh, missing/non-owned tank, scope denials, timeout/stalled body, rate limit, HTML/network and malformed JSON handling.
- Manual ammonia: separate histories/timestamps, No Scan, real zero and Critical scan cases.
- All 24 screens rendered in both themes; complete mobile ESLint passed. Changed scripts and Edge code also passed ESLint with zero errors/warnings.
- Deno type checking passed. Android Expo/Hermes export passed: 1,444 modules, 44 assets. A terminal environment warning reported both `NO_COLOR` and `FORCE_COLOR`; it did not affect export.
- Security hardening and release private-value scans passed.

## Live checks

The updated backend is ACTIVE version 11 with JWT verification enabled. The paced isolated QA matrix completed with **18 API checks passed, zero errors and zero fallback responses**. Sixteen permitted questions returned real AI answers; the unrelated question returned a normal scope denial and the non-owned tank was rejected. It used a temporary account and owned tank, synthetic context, and no hardware/sensor writes. No actual farmer thresholds changed.

| Check | Result |
| --- | --- |
| Six existing quick questions plus six other care/readings questions | 12 real AI answers, HTTP 200 |
| Contextual `Bakit?` follow-up | Real AI answer, HTTP 200 |
| New threshold preview quick question | Clarification, no fabricated proposal/save, HTTP 200 |
| `temp 25 to 30` after clarification | Valid structured temperature proposal, nothing saved, HTTP 200 |
| No ammonia scan | Real AI answer without treating missing scan as zero/Normal, HTTP 200 |
| Unrelated adobo question | Normal structured denial, HTTP 200 |
| Non-owned tank | HTTP 403 |
| Actual mobile threshold save service under the QA account | Saved 25–30°C; other parameters preserved |
| QA cleanup | Created threshold row, tank and account removed successfully |

All 16 provider-backed requests had numeric usage logs: **1,145–1,262 input tokens**, maximum **531 output tokens**, and average **1,480 total tokens** per answer. No provider 429, context-size error, timeout, malformed response or authentication failure occurred in this paced run. These are measured counts for the synthetic QA context, not a guarantee for every future question/account quota. Fault handling was separately exercised with controlled fixtures.

## Phone checklist

1. Reload the local Expo app/browser and select a tank. Find **Preview threshold change** as the first quick question.
2. Tap it; answer with the parameter and desired values, for example `temperature 25 to 30`. Expect clarification first, then a current/proposed card when valid and different from active settings.
3. Tap Apply -> Cancel; verify Settings is unchanged. For a complete save test use a separate QA account, since thresholds belong to the account rather than only one tank.
4. Ask a current-condition question and `Bakit?`; compare readings and confirm ammonia shows its own scan date or No Scan.
5. Check the light/dark themes, keyboard, and rapid taps. During a network/provider failure, expect a labelled supported fallback or readable retry message, never a fabricated Apply action.

The backend changes can serve the existing APK. The newly added quick-question button needs the next mobile build (or an already configured compatible update); this audit did not build an APK or publish a mobile update. Physical phone taps/rendering are still a manual check.

## Files changed in this audit

- `src/screens/main/AiGuideScreen.js`
- `src/utils/aiScope.js`
- `supabase/functions/craythrive-ai-guide/index.ts`
- `scripts/check-ai-conversations.cjs`
- `scripts/check-ai-request-budget.cjs`
- `docs/ai-complete-audit-20261006.md`

Server token usage was inspected via the console log source described in [Supabase's log field reference](https://supabase.com/docs/guides/observability/log-field-reference).
