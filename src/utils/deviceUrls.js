// Local ESP32 provisioning is the sole intentional HTTP exception. Never send
// Wi-Fi credentials to a public IP, hostname, URL credentials or arbitrary path.
export function normalizeDeviceBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /[\s\\]/.test(raw)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw) && !/^\d+\.\d+\.\d+\.\d+:\d+$/.test(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    const parts = url.hostname.split('.').map(Number);
    const privateIp = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && parts.every(v => v >= 0 && v <= 255) &&
      (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
    if (!privateIp && !/^[a-z0-9-]+\.local$/i.test(url.hostname)) return null;
    if (!['', '/', '/wifi', '/wifi/', '/save', '/save/'].includes(url.pathname)) return null;
    return url.origin;
  } catch { return null; }
}

export function resolveEsp32BaseUrls(device) {
  return [...new Set([
    normalizeDeviceBaseUrl(device?.wifi_config_url),
    normalizeDeviceBaseUrl(device?.local_ip),
    'http://192.168.4.1',
  ].filter(Boolean))];
}
