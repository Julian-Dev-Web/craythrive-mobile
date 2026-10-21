// Basic client validation; Supabase remains responsible for account verification.
export function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value.trim());
}
