/* global __dirname, Buffer */
// Runs after EAS installs dependencies, before native prebuild/compilation.
// Print names/classification only; never print a supplied configuration value.
const path = require('path');
// Cloud builds must receive config from the selected EAS profile/environment.
// Local checks may use ignored .env files without Expo's NODE_ENV warning.
if (process.env.EAS_BUILD !== 'true') {
  require('@expo/env').load(path.resolve(__dirname, '..'), { silent: true });
}
const publicNames = new Set(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
try {
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('EXPO_PUBLIC_') && value && !publicNames.has(name)) {
      throw new Error('An unapproved EXPO_PUBLIC variable is present. Review public build configuration.');
    }
  }
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL in the selected EAS profile/environment.');
  }
  let endpoint;
  try { endpoint = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL); }
  catch { throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('The public Supabase endpoint must use HTTPS without credentials.');
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!key) {
    throw new Error('Missing public Supabase key in the selected EAS profile/environment. Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  let publicKey = key.startsWith('sb_publishable_') && key.length > 20;
  if (!publicKey) {
    try { publicKey = key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch { /* Invalid or private key. */ }
  }
  if (!publicKey) throw new Error('Only a Supabase publishable or legacy anon key may be bundled. Configure the public key in the selected EAS environment.');
  console.log('PASS build client configuration: HTTPS Supabase URL and public key only. No values printed.');
} catch (error) {
  // Every thrown message above is fixed text; supplied URLs/keys are never logged.
  console.error(`Build client configuration rejected: ${error.message} Values withheld.`);
  process.exitCode = 1;
}
