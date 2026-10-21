# ESP32 WiFi switching and recovery

The existing Expo app and WiFi screen were updated. Authentication, navigation,
Supabase RLS, monitoring, reports, alerts, marketplace, AI Guide and ammonia scan
retain their existing implementations. No database migration or dependency was added.

## Files changed

- `src/screens/main/DeviceWifiSetupScreen.js`: status, switching, reconnect, confirmed forget, recovery instructions and cancellation.
- `src/screens/main/TankDetailsScreen.js`: Unpair wording/confirmation and heartbeat-based device badges and availability.
- `src/utils/deviceUrls.js`: ordered, deduplicated local URL candidates.
- `src/utils/deviceWifi.js`: device identity checks, bounded local requests, cloud snapshots and heartbeat polling.
- `scripts/check-device-wifi.cjs`: offline request, heartbeat, cancellation and screen interaction regressions.
- `scripts/check-security-hardening.cjs`: exercise the new WiFi request helper instead of the obsolete screen implementation.
- `scripts/check-mobile-ui.cjs`: provide native abort/time/fetch mocks, WiFi overrides, and support skipped state tuple entries.
- `docs/esp32-wifi-recovery.md`: implementation notes and hardware test procedure.

## Previous problems

The screen chose only one stored URL, posted only to `/save`, and did not verify
which device answered or confirm a subsequent heartbeat. A stale stored address
could prevent setup AP recovery. The badge trusted `connection_status` indefinitely.
There were no status/reconnect/forget controls or device-specific recovery steps.
Tank Details called the database unclaim operation “Disconnect”, which confused
tank assignment with WiFi settings.

## New flow and API behavior

Open Tank Details → Wi-Fi Setup. Check WiFi Status, enter the new network, and tap
Save & Switch WiFi. Join an internet network on the app phone after the request
is accepted. The ESP32 reboots and the app waits for cloud confirmation.

Local requests try the normalized `wifi_config_url`, then `local_ip`, then
`http://192.168.4.1`, with duplicates removed and a four-second timeout per address.
The existing private-address/`.local` URL restrictions remain. Redirects are rejected
using the installed `expo/fetch` implementation. Before each command,
`GET /api/wifi/status` must return the exact selected `device_uid`. A different
device answering the same setup IP never receives the command.

- **Status:** shows Connected / Setup Mode / Unreachable, current SSID, RSSI,
  local IP, primary/backup SSIDs and firmware version. Only whitelisted fields enter
  UI state. Password inputs stay masked and saved WiFi passwords are never shown.
- **Save:** URL-encoded `POST /api/wifi/save`. Acceptance clears the password input
  and explains that the new primary network is saved and the previous network is
  retained as backup. Acceptance alone never produces a connection-success message.
- **Reconnect:** `POST /api/wifi/reconnect`, followed by the same cloud wait. An
  unreachable local server shows recovery instructions and receives no command.
- **Forget:** a destructive confirmation precedes `POST /api/wifi/forget`. The app
  explains that only WiFi profiles are cleared, then directs the user to the correct
  setup hotspot with password `craythrive123` and address `http://192.168.4.1`.
- **Browser fallback:** `/wifi` remains accessible through both the candidate setup
  page button and an explicit `192.168.4.1` button. The app does not automatically
  replay a failed mutating request or silently downgrade to the legacy `/save` route.

The cloud wait reads `iot_devices` for the exact UID about every three seconds for
up to 45 seconds. It uses the existing `craythrive_server_time` RPC and monotonic
elapsed time, rather than trusting the phone clock. Confirmation requires a recent
heartbeat after the command was accepted, advancement beyond the baseline
`last_seen`, and a valid local address in the newly read row. An unchanged DHCP
address is allowed alongside the new heartbeat; an old IP alone proves nothing.
Read requests are bounded, and leaving the screen aborts requests and polling.
After a timeout, Retry Connection Check starts another bounded read-only check.

A cloud heartbeat confirms the device is online, not that the requested hotspot
was chosen: firmware may use a backup. The success message tells the user to
check local WiFi status for the actual SSID. A dropped POST reply is reported as
unconfirmed because the device may already have rebooted; the app does not resend it.
Cloud outages and a still-missing heartbeat have separate messages.

Device badges use a two-minute heartbeat window. A paired device with an old
heartbeat shows Reconnecting / Stale; missing heartbeat data shows Setup / Offline.
A local setup-mode response takes precedence. Badges age while screens are open.
Sensor reading freshness remains independent of device WiFi freshness.

## Unpair, Android and installation

**Unpair** only updates `iot_devices.user_id=null`, `tank_id=null`,
`is_claimed=false` through the existing authenticated client/RLS. Its confirmation
says: “This removes the device from this tank. It does not erase the ESP32 WiFi
settings.” It makes no local WiFi request. **Forget WiFi** clears firmware WiFi
profiles and leaves tank pairing unchanged.

No Android configuration change was needed. `app.json` already configures
`expo-build-properties` with `android.usesCleartextTraffic=true`, and the existing
main Android manifest already sets the same flag. This change adds no broader
network permission. Local credential destinations remain restricted in JavaScript;
Supabase continues to require HTTPS.

A new standalone APK must be built and installed to deliver these JavaScript
changes to installed release/preview apps: the current Android manifest disables
Expo Updates. A running development client can load the changes from Metro.
No native dependency/configuration rebuild is required specifically for this work.
Both ESP32 boards must run firmware implementing the supplied `/api/wifi/*`
contract, cloud address publication and `last_seen` heartbeats.

## Hardware test procedure: two phone hotspots, both devices

Use Phone A as hotspot `CrayTest-A` and Phone B as hotspot `CrayTest-B`, with known,
different passwords and 2.4 GHz enabled. Use an app handset/tablet that can join
either hotspot or the ESP32 AP; a third handset makes simultaneous hotspot testing
straightforward. Keep hotspot client isolation disabled if the phones offer it.
Keep the other ESP32 off for the first run, then repeat with roles reversed.

| Run | Device UID | Setup hotspot |
| --- | --- | --- |
| 1 | `CRAYTHRIVE-SENSOR-001` | `CrayThrive-Sensor-Setup` |
| 2 | `CRAYTHRIVE-ACTUATOR-001` | `CrayThrive-Actuator-Setup` |

Perform every step below for each row:

1. Install the updated app and required board firmware. Pair the selected device
   to a test tank using the existing flow. Have it online on `CrayTest-A`, with the
   app handset also on A. Record the tank, UID, firmware and last heartbeat.
2. Open Tank Details → Wi-Fi Setup → Check WiFi Status. Confirm the selected UID,
   Connected state, SSID A, RSSI, current IP and firmware. Ensure no WiFi password
   appears in status. Note any existing backup SSID names.
3. Turn on B. Enter SSID B and its correct password and tap Save & Switch WiFi.
   Immediately verify the password clears, the saved/restarting notice appears,
   and the screen says Waiting for ESP32 to reconnect. There must be no immediate
   connection-success message. Switch the app handset to B for cloud access.
4. After a new heartbeat, verify the online-again notice. On B, Check WiFi Status
   must show connected SSID B, primary B and A retained among backup profiles.
   Confirm tank pairing is unchanged. If cloud confirmation times out due to
   firmware heartbeat cadence, tap Retry Connection Check and inspect `last_seen`.
5. Turn B off briefly, then on. With the app handset back on B and the board
   reachable, tap Reconnect Saved WiFi. Verify the requested/restarting state
   precedes a fresh-heartbeat confirmation. Also let the board recover without
   tapping to verify firmware recovery after a hotspot drop.
6. Turn off BOTH A and B so no saved test hotspot is available. Wait through the
   firmware’s failed reconnect attempts until the selected setup hotspot appears.
   Check that a stale database `connection_status=online` cannot keep the badge
   Online after the last heartbeat ages beyond two minutes. Tap Reconnect before
   joining the AP: it must show reachability/recovery guidance, never success.
7. Tap Open WiFi Settings on Android. Join the setup hotspot from the table using
   `craythrive123`; keep the connection despite “no internet”. Return to the app
   and Check WiFi Status. It must find `192.168.4.1`, match the selected UID and
   show Setup Mode with saved SSID names still present. Turn B on, save its details
   again, move the app handset to B, and verify a fresh cloud heartbeat.
8. Exercise wrong credentials: keep A available as backup, save B with a deliberately
   wrong password, and read the result. If the board falls back to A, cloud success
   must only say online again; Check WiFi Status on A reveals SSID A. With all
   usable backups unavailable, expect a bounded wait/Retry and setup recovery.
   Recover by entering B’s correct details from the setup AP.
9. Check backup behavior: after valid switching, make the primary unavailable while
   leaving its saved backup active. Verify firmware joins the backup and local
   status shows the actual connected SSID plus primary/backup names. To test two
   backup slots with these same two phones, rename A to `CrayTest-A2`, save A2,
   then inspect primary A2 and backups B/A (according to firmware ordering).
10. Tap Forget WiFi / Setup Mode and cancel. Confirm no reboot/profile change.
    Open it again and confirm. Verify the board exposes the correct setup hotspot,
    the app explains password/address, and tank pairing remains intact. Join the
    AP, confirm saved profiles are cleared, and save B correctly to recover.
11. Leave the WiFi screen during the reconnect wait. Verify navigation works and
    no later WiFi alert or ongoing screen polling appears. Retry with the app
    handset on an internet-free setup AP: cloud confirmation must time out with
    its separate cloud-unavailable guidance, not mark the board connected.
12. Finally, on a working hotspot, return to Tank Details → Unpair. Verify its
    confirmation mentions WiFi is retained, then confirm. The database assignment
    clears, while the ESP32 stays on WiFi. Re-pair through the existing flow.

With both boards powered, also open the Sensor’s WiFi screen while connected only
to the Actuator setup AP, and then reverse the test. Status should report a
different device; save/reconnect/forget must send no command to that wrong board.
For a deterministic test, make the selected board’s LAN address unreachable so
only the other board’s setup IP answers.

## Automated validation

- `node scripts/check-device-wifi.cjs`: candidate/identity/timeout/encoding,
  heartbeat/clock/deadline/cloud/cancellation, and actual screen interaction checks.
- `node scripts/check-security-hardening.cjs`: existing security regressions plus
  the WiFi checks and redirect-rejecting native fetch verification.
- `node scripts/check-mobile-ui.cjs`: all 24 screens in light/dark mode,
  syntax/import/icon/Android-transform checks and complete mobile ESLint.
- `EXPO_OFFLINE=1` with `node node_modules/expo/bin/cli export --platform android
  --output-dir .expo/wifi-qa --max-workers 2`: Android JavaScript/Hermes export.

These are offline checks and a bundle export, not an APK build or physical
ESP32/hotspot validation. Complete the hardware procedure before release.
