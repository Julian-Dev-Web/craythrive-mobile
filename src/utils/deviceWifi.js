import { normalizeDeviceBaseUrl, resolveEsp32BaseUrls } from './deviceUrls';
import { parseTimestamp } from './philippineTime';

export const WIFI_POLL_MS = 3000;
export const WIFI_WAIT_MS = 45000;
export const DEVICE_RECENT_MS = 120000;

export function getSetupHotspot(device) {
  const identity = `${device?.device_type || ''} ${device?.device_uid || ''}`.toLowerCase();
  if (identity.includes('actuator')) return 'CrayThrive-Actuator-Setup';
  if (identity.includes('sensor')) return 'CrayThrive-Sensor-Setup';
  return null;
}

export function isDeviceRecent(device, now) {
  const seen = parseTimestamp(device?.last_seen)?.getTime();
  const current = parseTimestamp(now)?.getTime();
  return Number.isFinite(seen) && Number.isFinite(current) && current - seen >= -5000 && current - seen <= DEVICE_RECENT_MS;
}

export function getDeviceOnlineLabel(device, now, localStatus) {
  if (localStatus?.setup_mode) return 'Setup Mode';
  if (isDeviceRecent(device, now)) return 'Online';
  if (device?.is_claimed && device?.last_seen) return 'Reconnecting / Stale';
  return 'Setup / Offline';
}

function wifiError(code, message) {
  return Object.assign(new Error(message), { code });
}

function cancelled() {
  return wifiError('cancelled', 'WiFi check cancelled.');
}

// Bound the entire task, including response.json(), even if a native request
// ignores abort. Supabase and local requests both receive an abort signal.
export async function withWifiTimeout(task, signal, timeoutMs = 4000) {
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController();
  let timer;
  let rejectAbort;
  const onAbort = () => { controller.abort(); rejectAbort(cancelled()); };
  const abortPromise = new Promise((_, reject) => { rejectAbort = reject; });
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(wifiError('timeout', 'The device did not reply in time.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([task(controller.signal), timeout, abortPromise]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

// Whitelist fields: firmware responses must never put a password into UI state.
function safeStatus(status) {
  const text = key => typeof status[key] === 'string' ? status[key] : '';
  return {
    device_uid: text('device_uid'),
    wifi_connected: status.wifi_connected === true,
    setup_mode: status.setup_mode === true,
    connected_ssid: text('connected_ssid'),
    saved_ssid: text('saved_ssid'),
    backup_ssid_1: text('backup_ssid_1'),
    backup_ssid_2: text('backup_ssid_2'),
    local_ip: text('local_ip'),
    firmware_version: text('firmware_version'),
    rssi: typeof status.rssi === 'number' && Number.isFinite(status.rssi) ? status.rssi : null,
  };
}

export async function findEsp32Wifi(device, fetchImpl, signal) {
  if (!device?.device_uid) throw wifiError('identity', 'Select a registered device before changing WiFi.');
  let mismatch = false;
  let unsupported = false;
  for (const baseUrl of resolveEsp32BaseUrls(device)) {
    if (signal?.aborted) throw cancelled();
    try {
      const status = await withWifiTimeout(async requestSignal => {
        const response = await fetchImpl(`${baseUrl}/api/wifi/status`, {
          method: 'GET', redirect: 'error', signal: requestSignal,
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) {
          if (response.status === 404 || response.status === 405) unsupported = true;
          throw wifiError('status', 'WiFi status is unavailable.');
        }
        return response.json();
      }, signal);
      if (!status || status.device_uid !== device.device_uid) { mismatch = true; continue; }
      return { baseUrl, status: safeStatus(status) };
    } catch (error) {
      if (signal?.aborted || error.code === 'cancelled') throw cancelled();
    }
  }
  if (mismatch) throw wifiError('identity', 'A different device answered. Join the selected device’s setup hotspot and check again. No WiFi command was sent.');
  if (unsupported) throw wifiError('firmware', 'This device did not provide the new WiFi status API. Install the updated ESP32 firmware, or use its browser setup page.');
  throw wifiError('unreachable', 'The ESP32 local server is unreachable. Check that your phone is on the same WiFi, that the hotspot allows devices to communicate, and that the ESP32 has power. If the old hotspot is gone or the device is restarting, follow the setup steps below and check again.');
}

export async function postEsp32Wifi(target, action, values, fetchImpl, signal) {
  const baseUrl = normalizeDeviceBaseUrl(target?.baseUrl);
  if (!baseUrl || !target?.status?.device_uid || !['save', 'reconnect', 'forget'].includes(action)) {
    throw wifiError('identity', 'Check the selected device’s WiFi status first.');
  }
  try {
    await withWifiTimeout(async requestSignal => {
      const response = await fetchImpl(`${baseUrl}/api/wifi/${action}`, {
        method: 'POST', redirect: 'error', signal: requestSignal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        ...(action === 'save' ? { body: `ssid=${encodeURIComponent(values.ssid)}&password=${encodeURIComponent(values.password)}` } : {}),
      });
      if (!response.ok) throw wifiError('rejected', 'The ESP32 did not accept this WiFi request. Check its firmware and try again.');
    }, signal);
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (error.code === 'rejected') throw error;
    // Never retry a mutating request against another address: a reboot may have
    // interrupted its reply after it was already accepted.
    throw wifiError('uncertain', 'The ESP32 stopped replying during the request. It may be restarting. The request could not be confirmed.');
  }
}

export async function readWifiDeviceSnapshot(db, deviceUid, signal, timeoutMs = 4000) {
  return withWifiTimeout(async requestSignal => {
    const [row, clock] = await Promise.all([
      db.from('iot_devices').select('device_uid,device_type,is_claimed,tank_id,last_seen,local_ip,wifi_config_url')
        .eq('device_uid', deviceUid).abortSignal(requestSignal).maybeSingle(),
      db.rpc('craythrive_server_time').abortSignal(requestSignal),
    ]);
    if (row.error || clock.error || !row.data || !parseTimestamp(clock.data)) {
      throw wifiError('cloud', 'Cloud confirmation is unavailable. Check your phone’s internet connection and try again.');
    }
    return { device: row.data, serverTime: clock.data };
  }, signal, timeoutMs);
}

export function hasFreshWifiHeartbeat(snapshot, deviceUid, baseline, elapsedMs) {
  const row = snapshot?.device;
  if (row?.device_uid !== deviceUid || !isDeviceRecent(row, snapshot.serverTime)) return false;
  const seen = parseTimestamp(row.last_seen).getTime();
  const previous = parseTimestamp(baseline?.last_seen)?.getTime();
  const serverNow = parseTimestamp(snapshot.serverTime).getTime();
  // Require a heartbeat after the command/check began, plus advancement past
  // the baseline. An old IP or a sticky connection_status never proves success.
  if (Number.isFinite(previous) && seen <= previous) return false;
  return seen > serverNow - elapsedMs && Boolean(
    normalizeDeviceBaseUrl(row.local_ip) || normalizeDeviceBaseUrl(row.wifi_config_url)
  );
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function waitForWifiHeartbeat({ db, deviceUid, baseline, signal, onSnapshot, now = () => performance.now(), commandStartedAt = now() }) {
  const started = now();
  let cloudAvailable = false;
  let lastReadFailed = false;
  let nextPoll = started + WIFI_POLL_MS;
  while (now() - started < WIFI_WAIT_MS) {
    await delay(Math.max(0, Math.min(nextPoll - now(), WIFI_WAIT_MS - (now() - started))), signal);
    const remaining = WIFI_WAIT_MS - (now() - started);
    if (remaining <= 0) break;
    try {
      const snapshot = await readWifiDeviceSnapshot(db, deviceUid, signal, Math.min(2500, remaining));
      if (signal?.aborted) throw cancelled();
      cloudAvailable = true;
      lastReadFailed = false;
      onSnapshot?.(snapshot);
      if (hasFreshWifiHeartbeat(snapshot, deviceUid, baseline, now() - commandStartedAt)) return snapshot;
    } catch (error) {
      if (signal?.aborted || error.code === 'cancelled') throw cancelled();
      lastReadFailed = true;
    }
    nextPoll = Math.max(nextPoll + WIFI_POLL_MS, now());
  }
  return { timedOut: true, cloudUnavailable: !cloudAvailable || lastReadFailed };
}
