/* global __dirname, Buffer */
// Local, synthetic React Native Web layout review. No app login or live requests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once, EventEmitter } = require('node:events');
const WebSocket = require('ws');
const { cases, page } = require('./mobile-preview.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.expo', 'preapk-qa', 'mobile-ui');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
fs.mkdirSync(output, { recursive: true });

class Protocol extends EventEmitter {
  constructor(socket) {
    super(); this.socket = socket; this.sequence = 0; this.pending = new Map();
    socket.on('message', chunk => {
      const data = JSON.parse(chunk.toString());
      if (data.id) {
        const item = this.pending.get(data.id);
        if (!item) return;
        this.pending.delete(data.id); clearTimeout(item.timer);
        if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result);
      } else this.emit(data.method, data.params);
    });
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function main() {
  const chrome = process.env.MOBILE_QA_CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  if (!chrome) throw new Error('Chrome/Edge is required; set MOBILE_QA_CHROME to its executable.');
  const profile = fs.mkdtempSync(path.join(output, 'browser-'));
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/logo.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(fs.readFileSync(path.join(root, 'assets/images/Logo.png'))); return;
      }
      const query = Object.fromEntries(url.searchParams);
      const html = await page({ ...query, width: Number(query.width), height: Number(query.height), scale: Number(query.scale) });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let protocol;
  const results = [];
  try {
    let port;
    for (let count = 0; count < 100; count++) {
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (port) break; } catch { /* Browser starting. */ }
      if (browser.exitCode !== null) throw new Error(`Headless browser exited: ${browser.exitCode}`);
      await pause(100);
    }
    if (!port) throw new Error('Headless browser did not expose its local debugging port.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open'); protocol = new Protocol(socket);
    await protocol.call('Page.enable');
    const selected = process.argv.includes('--quick') ? cases.filter(row => ['AddTankScreen', 'DashboardScreen', 'DeviceWifiSetupScreen', 'AiGuideScreen', 'MarketplaceScreen', 'TankDetailsScreen'].includes(row.id)) : cases;
    const variants = process.argv.includes('--quick') ? [{ width: 360, height: 800, mode: 'light', scale: 1 }]
      : [320, 390].flatMap(width => ['light', 'dark'].flatMap(mode => [1, 1.3].map(scale => ({ width, height: width === 320 ? 640 : 844, mode, scale }))));
    for (const item of selected) for (const variant of variants) {
      const { width, height, mode, scale } = variant;
      await protocol.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      const loaded = once(protocol, 'Page.loadEventFired');
      await protocol.call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?${new URLSearchParams({ id: item.id, ...variant })}` });
      await loaded;
      await protocol.call('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
      const evaluated = await protocol.call('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const horizontalAncestor = element => { for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const css = getComputedStyle(parent); if (/auto|scroll/.test(css.overflowX) && parent.scrollWidth > parent.clientWidth + 2) return true;
        } return false; };
        const elements = [...document.querySelectorAll('[dir="auto"],input,textarea,[role="button"],[role="tab"]')];
        const overflow = elements.filter(element => {
          const box = element.getBoundingClientRect(); return box.width && box.height && (box.left < -2 || box.right > innerWidth + 2) && !horizontalAncestor(element);
        }).map(element => ({text:(element.getAttribute('aria-label')||element.textContent||element.getAttribute('placeholder')||'').slice(0,100),left:Math.round(element.getBoundingClientRect().left),right:Math.round(element.getBoundingClientRect().right)}));
        return {screen:document.querySelector('[data-screen]')?.dataset.screen, overflow, textCount:elements.length,
          scrollAreas:[...document.querySelectorAll('div')].filter(element=>/auto|scroll/.test(getComputedStyle(element).overflowY)&&element.scrollHeight>element.clientHeight+2).length};
      })()` });
      const result = { id: item.id, ...variant, ...evaluated.result.value };
      results.push(result);
      if (scale === 1 || result.overflow?.length) {
        const filename = `${item.id}-${width}-${mode}-${scale}.png`;
        const shot = await protocol.call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(output, filename), Buffer.from(shot.data, 'base64')); result.screenshot = filename;
      }
      console.log(`${result.screen && !result.overflow.length ? 'PASS' : 'REVIEW'} ${item.id} ${width}px ${mode} ${Math.round(scale * 100)}%${result.overflow.length ? ` ${JSON.stringify(result.overflow.slice(0,3))}` : ''}`);
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    const thumbs = results.filter(row => row.screenshot).map(row => `<figure><a href="${row.screenshot}"><img loading="lazy" src="${row.screenshot}" width="230"></a><figcaption>${row.id}<br>${row.width}px / ${row.mode} / ${row.scale * 100}%</figcaption></figure>`).join('');
    fs.writeFileSync(path.join(output, 'index.html'), `<html><meta charset="utf-8"><title>CrayThrive mobile layout fixtures</title><style>body{font:14px Arial;background:#eee}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;background:white;padding:8px}img{border:1px solid #ccc}</style><h1>CrayThrive mobile layout fixtures</h1><p>Synthetic offline React Native Web renders. Native keyboard, camera and Android layout still require a device.</p><main>${thumbs}</main></html>`);
    const findings = results.filter(row => !row.screen || row.overflow.length);
    console.log(`Visual layout QA: ${results.length} cases, ${findings.length} needing review. Gallery: .expo/preapk-qa/mobile-ui/index.html`);
    if (findings.length) process.exitCode = 1;
  } finally {
    if (protocol) { try { await protocol.call('Browser.close'); } catch { protocol.socket.close(); } }
    browser.kill(); server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
