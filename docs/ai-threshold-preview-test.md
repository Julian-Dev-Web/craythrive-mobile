# AI threshold preview test — October 6, 2026

The screenshot's first answer was `recommendation_only`; the UI correctly hides Apply when no validated threshold proposal exists. The next question referenced testing the Apply button without repeating a domain keyword. The exact-match scope rules rejected that legitimate follow-up before the provider ran.

The shared scope rule now accepts a short Apply-button test/preview follow-up only with a selected tank and a recent user threshold question. Unrelated topics still take precedence. The server still verifies authentication and tank ownership before scope checks or provider requests.

The provider instructions now distinguish an explicitly requested threshold preview from a care recommendation. The user must supply a supported parameter and valid changed values, either directly or in the recent threshold conversation. The AI must not invent a change to show a button, claim the preview fixes critical readings, or claim anything was saved. Existing range validation, unchanged-value rejection, Apply confirmation, current-account database filters and duplicate-save protection remain intact.

## Phone test

1. Select a tank in AI & Guide and send:

   > For testing the CrayThrive Apply Threshold button, preview a temperature threshold change to 25–30°C. Do not save it. This is a user-requested preview, not a care recommendation.

2. Expect a current/proposed threshold card and **Apply Threshold**, provided 25–30°C differs from the active setting and the provider returns a valid proposal. Plain advice without a proposal does not have an Apply button.
3. Tap Apply, then **Cancel**. The preview and cancellation must not save anything.
4. For a full save test, use a separate QA account: thresholds belong to the account, not just the selected tank. Confirm Apply, check the saved temperature range in Settings, and verify other threshold parameters did not change. Repeated taps must not save twice.

The server fix works with the existing mobile Apply UI; no APK build is needed for this backend update. No actual farmer thresholds or hardware were modified during testing.

## Local validation

- Exact screenshot follow-up reaches the authenticated provider path; missing context/history, assistant-only history and unrelated topics remain denied.
- A controlled 25–30°C response renders the real mobile Apply button.
- Cancel performs zero writes. Confirmed Apply runs the actual mobile save service against an isolated database fixture, changes only temperature, filters by the current account and rejects duplicate saves.
- AI conversation, request-budget, syntax/import and Expo Android transformation checks passed.
- Deno type check and ESLint passed with zero errors/warnings.

## Live validation

The updated `craythrive-ai-guide` is ACTIVE version 10 with JWT verification enabled. Its prior deployed source matched the local source before this fix; unrelated backend changes were preserved.

Using a temporary authenticated QA user and owned tank, the real provider returned HTTP 200 with the requested structured 25–30°C proposal and `suggestion_saved: false`. The exact screenshot follow-up also returned an allowed HTTP 200 AI response. The existing mobile save service then persisted 25–30°C in the QA account's `threshold_settings`; other threshold values were preserved. A non-owned tank still returned HTTP 403. The created QA threshold row, tank and user were removed successfully.

The first live QA run verified both AI questions but stopped before saving because its test adapter omitted the database query method. That adapter was corrected; the subsequent complete run passed. This was a test-harness issue, not a mobile application change. No unresolved errors remain in these checks. Physical phone rendering and taps still need the manual test above.

Changed files: `src/utils/aiScope.js`, `supabase/functions/craythrive-ai-guide/index.ts`, `scripts/check-ai-conversations.cjs`, and this report.
