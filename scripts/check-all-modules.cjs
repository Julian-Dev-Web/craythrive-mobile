/* global __dirname, __filename */
// Runs the existing isolated regression suites. No live accounts or hardware writes.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.expo', 'preapk-qa', 'suites');
fs.mkdirSync(output, { recursive: true });
const files = fs.readdirSync(__dirname).filter(file => /^check-.+\.cjs$/.test(file) && file !== path.basename(__filename)).sort();
const results = [];
let cursor = 0;

async function run(file) {
  if (file === 'check-classification-sql.cjs') {
    try { require.resolve(process.env.PGLITE_MODULE || '@electric-sql/pglite'); }
    catch {
      const result = { file, status: 'SKIP', reason: 'Isolated PostgreSQL requires PGLITE_MODULE or an installed @electric-sql/pglite.' };
      results.push(result);
      console.log(`SKIP ${file}: ${result.reason}`);
      return;
    }
  }
  const started = performance.now();
  await new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 180000);
    child.stdout.on('data', chunk => { log += chunk.toString(); });
    child.stderr.on('data', chunk => { log += chunk.toString(); });
    child.on('error', error => { log += `\n${error.message}`; });
    child.on('close', code => {
      clearTimeout(timer);
      fs.writeFileSync(path.join(output, `${file}.log`), log);
      const result = { file, status: code === 0 && !timedOut ? 'PASS' : 'FAIL', exitCode: code,
        seconds: Math.round((performance.now() - started) / 100) / 10,
        groups: (log.match(/^PASS\b/gm) || []).length, ...(timedOut ? { timedOut: true } : {}) };
      results.push(result);
      console.log(`${result.status} ${file} (${result.seconds}s)`);
      if (result.status === 'FAIL') console.log(log.split(/\r?\n/).slice(-35).join('\n'));
      resolve();
    });
  });
}

async function worker() {
  while (cursor < files.length) await run(files[cursor++]);
}

Promise.all([worker(), worker(), worker()]).then(() => {
  results.sort((a, b) => a.file.localeCompare(b.file));
  const summary = { completedAt: new Date().toISOString(),
    passed: results.filter(row => row.status === 'PASS').length,
    failed: results.filter(row => row.status === 'FAIL').length,
    skipped: results.filter(row => row.status === 'SKIP').length, results };
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`Module QA: ${summary.passed} suites passed, ${summary.failed} failed, ${summary.skipped} skipped. Logs: .expo/preapk-qa/suites`);
  process.exitCode = summary.failed || summary.skipped ? 1 : 0;
}).catch(error => { console.error(error); process.exitCode = 1; });
