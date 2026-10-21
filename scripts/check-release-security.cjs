/* global __dirname, Buffer */
// Redacted static audit: never prints matched values or environment contents.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const findings = [];
const references = [];
const environments = [];
const inventories = {};
const credentialFiles = [];
const privateNames = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|GROQ_API_KEY|OPENAI_API_KEY|AI_API_KEY|RESEND_API_KEY|SMTP_PASSWORD|DATABASE_URL|DB_PASSWORD|PRIVATE_KEY|JWT_SECRET|PUSH_WEBHOOK_SECRET|EXPO_ACCESS_TOKEN/i;
function scan(source, file) {
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const label of ['service_role', 'sb_secret_', 'Authorization', 'password', 'access_token', 'refresh_token', 'http://']) {
      if (line.toLowerCase().includes(label.toLowerCase())) inventories[label] = (inventories[label] || 0) + 1;
    }
    if (privateNames.test(line)) references.push({ file, line: index + 1 });
    for (const [kind, pattern] of [
      ['secret API key', /\b(?:sb_secret_|gsk_|sk-proj-)[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}/g],
      ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"private_key"\s*:\s*"-----/g],
      ['provider/database credential URL', /(?:postgres(?:ql)?|mysql):\/\/[^\s"']+:[^\s"'@]+@/g],
    ]) if (pattern.test(line)) findings.push({ file, line: index + 1, kind });
    const assignment = line.match(new RegExp(`(?:${privateNames.source})["']?\\s*[:=]\\s*["']([^"']{8,})["']`, 'i'));
    if (assignment && !/example|placeholder|your[_ -]|^<|^\$\{|^changeme/i.test(assignment[1])) {
      findings.push({ file, line: index + 1, kind: 'literal private credential (rotation review)' });
    }
    for (const token of line.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      try {
        const payload = JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url'));
        if (payload.role !== 'anon') findings.push({ file, line: index + 1, kind: payload.role === 'service_role' ? 'service-role JWT' : 'non-public JWT' });
      } catch { findings.push({ file, line: index + 1, kind: 'unclassified JWT' }); }
    }
    if (path.basename(file).startsWith('.env')) {
      const entry = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!entry) return;
      const [, name, raw] = entry;
      const value = raw.replace(/^['"]|['"]$/g, '').trim();
      const safe = name === 'EXPO_PUBLIC_SUPABASE_URL' ? /^https:\/\//.test(value)
        : /^(EXPO_PUBLIC_SUPABASE_ANON_KEY|EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)$/.test(name) && (value.startsWith('sb_publishable_') || (() => {
          try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'anon'; } catch { return false; }
        })());
      environments.push({ file, name, classification: file.endsWith('.example') ? 'example placeholder' : safe ? 'public client configuration' : 'review required' });
      if (value && !safe && name.startsWith('EXPO_PUBLIC_') && !file.endsWith('.example')) findings.push({ file, line: index + 1, kind: 'unapproved public environment variable' });
      if (value && privateNames.test(name) && !/example|placeholder|your[_ -]|^<|^\$\{|^changeme/i.test(value)) findings.push({ file, line: index + 1, kind: 'private environment value (rotation review)' });
    }
  });
}
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    const file = path.join(dir, item.name);
    if (/\.(?:keystore|jks|pem|key|p12|p8)$|credentials\.json|service.account.*\.json|firebase-adminsdk.*\.json/i.test(item.name)) {
      credentialFiles.push(path.relative(root, file).replaceAll('\\', '/'));
    }
    if (item.isDirectory()) {
      if (!['node_modules', '.git', '.expo', '.gradle', 'build', 'dist', 'web-build'].includes(item.name)) walk(file);
    } else if (/\.(?:js|jsx|ts|tsx|cjs|mjs|json|md|txt|toml|xml|properties|gradle|sql|ya?ml)$|(?:^|[\\/])\.env[^\\/]*$/.test(file) && fs.statSync(file).size < 5000000) {
      scan(fs.readFileSync(file, 'utf8'), path.relative(root, file).replaceAll('\\', '/'));
    }
  }
}
walk(root);
const gitArgs = ['-c', `safe.directory=${root.replaceAll('\\', '/')}`];
let history = 'unavailable';
try {
  const revisions = cp.execFileSync('git', [...gitArgs, 'rev-list', '--all'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(/\s+/).filter(Boolean);
  history = `${revisions.length} reachable commits scanned`;
  for (const revision of revisions) {
    const files = cp.execFileSync('git', [...gitArgs, 'ls-tree', '-r', '--name-only', revision], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const file of files) if (/\.(?:js|ts|json|md|txt|toml|sql|properties|gradle)$|(?:^|\/)\.env/.test(file)) {
      scan(cp.execFileSync('git', [...gitArgs, 'show', `${revision}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 10000000 }), `git:${revision.slice(0, 8)}:${file}`);
    }
  }
  // Staged files count as exposure too, even before the first commit.
  const staged = cp.execFileSync('git', [...gitArgs, 'ls-files'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const file of staged) if (/\.(?:js|ts|json|md|txt|toml|sql|properties|gradle)$|(?:^|\/)\.env/.test(file)) {
    scan(cp.execFileSync('git', [...gitArgs, 'show', `:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 10000000 }), `index:${file}`);
  }
} catch { /* No initialized history or unreadable index; report explicitly. */ }
const bundleArg = process.argv.indexOf('--bundle-dir');
if (bundleArg !== -1) walk(path.resolve(process.argv[bundleArg + 1]));
console.log(JSON.stringify({ history, environments, credentialFiles, referenceCounts: inventories,
  privateValueFindings: findings, sensitiveNameReferences: references }, null, 2));
process.exitCode = findings.length ? 1 : 0;
