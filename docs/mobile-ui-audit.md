# CrayThrive mobile UI audit — 2026-10-05

Completed a client UI/stability pass across the 24 actual screens, reusable UI, existing custom navigation in `app/index.tsx`, and relevant client helpers. Existing Supabase tables, policies, storage, Edge Functions, authentication architecture, hardware commands, and dependency versions were preserved. No APK build or live database writes were performed.

## Findings and fixes

- **Responsive navigation:** five fixed navigation widths could exceed a 320 dp phone. The active width now follows the available screen width, each target remains at least 44 dp, and the bar clears the bottom safe inset. Tabs hide while the keyboard is visible and return when it closes.
- **Headers, text and buttons:** compact phones use a smaller header title and omit its decorative icon to give text room beside the action buttons. Header text wraps. Small labels were raised to 12 dp with appropriate line height, short touch targets to 44 dp, and shared buttons can grow vertically for long labels. Loading buttons expose disabled/busy accessibility state and visibly dim.
- **Light/dark themes:** authentication, Landing, Splash, Edit Profile, Security, notification modals and older reusable cards now follow ThemeContext. Fixed pale error/success text and white translucent surfaces were replaced with theme values. Light-theme text accents and semantic warning/success colors were darkened for readable contrast; bright primary fills retain CrayThrive teal with dark foreground text.
- **Keyboard/forms:** added Android height avoidance to existing auth/chat keyboard wrappers, and shared keyboard avoidance to Add Tank, Wi-Fi Setup, Marketplace reservation forms, Add Listing, Product Details, Seller Profile, Edit Profile and Security. Authentication uses safe-area-context; auth wave widths follow the window rather than a startup snapshot.
- **AI composer:** its context and conversation header now scroll with messages while the tank selector stays available above the conversation. The composer reserves room for native bottom navigation. When typing, tabs and the large AI page header/mode selector yield room to the composer; the explanatory disclaimer returns when the keyboard closes. Long AI content uses readable wrapping text. Send/retry behavior and the existing CrayThrive-only Edge Function remain intact.
- **Repeated actions:** a shared synchronous promise lock prevents repeated Login/Register/password recovery, Add Tank, Wi-Fi save, profile/security saves and AI threshold application. It also coalesces read-only Dashboard/Reports/AI refreshes. Device pairing/disconnection and chat close/reopen/hide share per-screen mutation locks. Notification preference saves no longer race with a second rapid toggle.
- **AI threshold application:** the lock starts before confirmation. All apply buttons disable during confirmation/save, successful suggestion IDs are remembered, and an old callback cannot apply the same saved suggestion again. Cancel/failure releases the lock.
- **Edit Profile:** Expo SDK 54's deprecated main filesystem entry throws for the old base64 reader. The existing upload flow now imports `expo-file-system/legacy`; the picker uses `mediaTypes: ["images"]`. A failed initial profile fetch cannot be followed by a destructive save of fields that were never loaded.
- **Marketplace images:** failed remote photos now show a themed fallback without losing the image's reserved dimensions. New image URIs can load after a failure; images use cover sizing. Browse, Chats, Listings, Sales, Orders, Details/Back, seller links, Reserve, buyer/seller chat and history-preserving listing actions remain intact.
- **Dashboard/status:** all four required measurements appear, including Water Clarity and neutral placeholders when a tank has no saved reading. Cards use two metric columns. The nested View Tank touchable was replaced with a visual button inside the existing clickable card, leaving one action per tap. Tank names get two lines; Tank Details shows the full name and selectable full device UID.
- **Data correctness:** AI Guide's object spread allowed a stale `tanks.has_paired_device` field to overwrite the actual claimed-device result. Actual pairing now wins, including neutral Unpaired evaluation. The numeric measurement normalization and saved-threshold evaluation remain unchanged.
- **Threshold presentation:** removed the invented `waterLevelMin + 1.7` upper limit. Water Level shows the actual minimum (`≥ … cm`) and a plain-language explanation; Water Clarity retains the voltage-direction explanation. This changes display only.
- **Alerts/reports:** long alert and activity text can wrap fully. Alerts use a themed safe-area modal, readable network errors, retry, guarded mark-as-read actions, and cleanup of existing realtime/polling subscriptions. Report severity labels are capitalized Normal/Warning/Critical; informational alerts use a neutral badge. Unknown/missing reusable metric values cannot inherit a healthy default.
- **Android Back:** forms and tank/report/guide/settings details now register their existing back destinations through AppScreen. Busy forms intercept Back while saving. Existing Marketplace Details, Chat, Add Listing and Seller Profile handlers were retained; no navigation architecture replacement was made.
- **Minor quality fixes:** removed unused imports/variables, including the four pre-existing mobile lint warnings. Removed password-reset session/user dumps. Hook dependency lint is clean; no hook warning remains in the checked mobile source.

Feed Now/Fill/Drain controls were not present as executable controls in the inspected screens. Existing recommendations and control-history displays were preserved; no hardware action was invented.

## Validation

| Check | Result |
| --- | --- |
| `node scripts/check-mobile-ui.cjs` | Passed: syntax/imports/icons/Expo Android transforms across 60 files; all 24 screens render in both themes; navigation at 320/360/412/600 dp; keyboard transitions; image failure/replacement; Android Back; real form double taps; AI apply confirmation and stale-callback guard. |
| `node scripts/check-marketplace.cjs` | Passed all 15 behavior groups, including categories, legacy listings, general products, breeder trio, seller fields, orders, local reservation locking, chat roles and tab/detail callbacks. |
| `node scripts/check-ai-guide.cjs` | Passed provider timeout/errors/session renewal, duplicate send/retry, and existing Edge Function domain restriction checks. |
| `node scripts/check-sensor-monitoring.cjs` | Passed measurement aliases, null/zero handling, voltage/depth direction, current saved thresholds, cross-screen readings, stale pairing flags, badges and alert lifecycle. |
| `node scripts/check-mobile-notifications.cjs` | Passed offline saved-login, permission/token lifecycle, notification tap routing and sender behavior checks. |
| ESLint across `src`, `app` and changed checks | **0 errors, 0 warnings.** |
| Android Metro/Expo export with Hermes | Passed: **1,427 modules**, Android `.hbc` bundle and 44 assets exported to a temporary directory. This is a JavaScript/asset export, not an APK. |
| `expo install --check` in offline mode | Passed against available SDK metadata: dependencies up to date. Expo prints that offline dependency validation is limited. No dependencies were installed/upgraded. |
| `expo-doctor` | Not locally installed; not run. |

Mock render checks validate behavior and theme values, not native pixel layout. No physical phone/emulator test was performed in this pass.

## Remaining verification and existing limitations

- Test real Android keyboard resizing, gesture/three-button safe areas, font scaling, camera/picker permissions and live Supabase flows on a phone.
- Closed-app push delivery was not tested or deployed during this UI pass. The server notification setup and closed-app alert source still require verification described in [mobile-notifications.md](mobile-notifications.md). Expo Go is not the installed Android app notification test environment.
- Client reservation guards do not provide a transaction across different buyers racing on separate devices. The existing whole-listing reservation behavior remains. Guaranteed cross-buyer atomicity requires a separate server/database change; database changes were excluded from this task.
- No known syntax, import, transformation, mobile ESLint or hook dependency errors remain from this pass.

## Exact files changed in this pass

Compared with the workspace snapshot taken before this UI audit, **42 files** changed: 35 modified files and 7 new files. Earlier Marketplace, AI, sensor, notification, native/config or user edits are not counted as new work here. The root navigation was inspected but did not need an edit.

| File | Change |
| --- | --- |
| `src/components/tank/SensorReadingCard.js` | Two-column compact metrics and readable reason text. |
| `src/components/ui/AppBackground.js` | Theme-aware auth background. |
| `src/components/ui/AppButton.js` | Wrapping label, flexible height, contrast and loading/disabled accessibility. |
| `src/components/ui/AppHeader.js` | Compact-width layout, wrapping title and disabled action behavior. |
| `src/components/ui/AppScreen.js` | Shared optional keyboard avoidance and Android Back routing. |
| `src/components/ui/BottomNav.js` | Responsive widths, safe inset, keyboard visibility and accessible tabs. |
| `src/components/ui/MetricCard.js` | Theme and neutral missing-data/status presentation. |
| `src/components/ui/NotificationBell.js` | Themed readable modal, safe inset, retry and guarded requests. |
| `src/components/ui/ResilientImage.js` **(new)** | Remote-image failure fallback with stable dimensions. |
| `src/components/ui/StatusPill.js` | Themed labels; neutral default instead of Good. |
| `src/constants/theme.js` | Readable light-theme accent/semantic/muted colors. |
| `src/hooks/useAndroidBack.js` **(new)** | Back-handler registration and busy interception. |
| `src/hooks/useKeyboardVisible.js` **(new)** | Keyboard visibility and listener cleanup. |
| `src/hooks/useSingleFlight.js` **(new)** | Synchronous request/mutation coalescing. |
| `src/hooks/useThemedStyles.js` **(new)** | Memoized styles from existing ThemeContext. |
| `src/screens/LandingScreen.js` | Theme, safe area and readable text. |
| `src/screens/SplashScreen.js` | Theme-aware splash content and typography. |
| `src/screens/auth/ForgotPasswordScreen.js` | Theme, responsive wave, keyboard/Back and submission lock. |
| `src/screens/auth/LoginScreen.js` | Theme, responsive wave, keyboard/Back and submission lock. |
| `src/screens/auth/RegisterScreen.js` | Theme/modal, safe area, wave, keyboard/Back and submission lock. |
| `src/screens/auth/ResetPasswordScreen.js` | Theme, keyboard, submission lock and removed sensitive debug dumps. |
| `src/screens/main/AddMarketplaceListingScreen.js` | Keyboard handling, image fallback and touch/text polish. |
| `src/screens/main/AddTankScreen.js` | Keyboard/Back, create lock through success transition and touch/text polish. |
| `src/screens/main/AiGuideScreen.js` | Composer/keyboard, text contrast, refresh/apply locks and actual pairing flag. |
| `src/screens/main/AmmoniaReaderScreen.js` | Android Back and readable labels/touch targets. |
| `src/screens/main/DashboardScreen.js` | Four metric cards, missing-data placeholders, refresh lock and one card action. |
| `src/screens/main/DeviceWifiSetupScreen.js` | Keyboard/Back, save lock and readable touch/text. |
| `src/screens/main/GuideLessonDetailsScreen.js` | Android Back, typography and unused import cleanup. |
| `src/screens/main/MarketplaceChatScreen.js` | Keyboard, image fallback, timestamp contrast and thread action lock. |
| `src/screens/main/MarketplaceProductDetailsScreen.js` | Reservation keyboard, image fallback and full detail text. |
| `src/screens/main/MarketplaceScreen.js` | Reservation keyboard and product/chat image fallback. |
| `src/screens/main/ReportsScreen.js` | Refresh/Back, readable history, neutral info severity and touch/text. |
| `src/screens/main/SettingsScreen.js` | Theme-mode touch targets, preference lock and avatar fallback. |
| `src/screens/main/TankDetailsScreen.js` | Back, device action lock, full names/selectable UID and readable text. |
| `src/screens/main/settings/AboutCrayThriveScreen.js` | Back and typography. |
| `src/screens/main/settings/DefaultThresholdsScreen.js` | Back, minimum-depth display, voltage explanation and wrapping. |
| `src/screens/main/settings/EditProfileScreen.js` | Theme, keyboard/Back, picker/filesystem compatibility, save lock and load guard. |
| `src/screens/main/settings/SecurityScreen.js` | Theme, keyboard/Back, mutation locks and unused-variable cleanup. |
| `src/screens/main/settings/SellerProfileScreen.js` | Keyboard handling and readability; existing seller record/save flow retained. |
| `scripts/check-mobile-ui.cjs` **(new)** | Whole-mobile offline render and interaction checks. |
| `scripts/check-sensor-monitoring.cjs` | Real shared hooks in fixtures and stale pairing regression cases. |
| `docs/mobile-ui-audit.md` **(new)** | This report and exact change manifest. |

## Manual phone checklist

1. Use a narrow Android phone in light/dark mode and with larger system font. Open every tab; verify no clipped text/actions, and that bottom navigation clears system controls and disappears/reappears with the keyboard.
2. Test Login/Register/Forgot/Reset, Security OTP and Edit Profile. Scroll with the keyboard open, choose/change an avatar, test offline retry, and tap Save/Create twice quickly. Confirm one action and correct Back/Cancel behavior.
3. Create/open a tank; check long names and copying the full UID. Compare Temperature, pH, Water Clarity and depth against actual stored readings/current thresholds. Missing values should be `--`; unpaired tanks neutral; refresh should update the evaluation.
4. Browse every Marketplace category including an old null-category listing and a general product. Open Details, Back, store links and Chat Seller. Reserve once; check buyer Orders and seller Sales, then Cancel. Exercise Hide/Activate/Remove on suitable listings and verify transaction history remains.
5. Read/send long marketplace chat messages with the keyboard open, check unread counts and close/reopen/hide. Ask AI a long question, verify loading/retry, review a threshold suggestion, cancel or confirm once, and verify the applied state cannot be tapped twice.
6. Read a long alert and report record; mark one/all read, refresh offline then reconnect. Background/reopen the app and confirm the login persists. Test closed-app push separately with an installed Android build and verified server delivery setup.

**APK build remains stopped.**
