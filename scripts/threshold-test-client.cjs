// In-memory Supabase fixture for real mobile threshold resolver/Apply code.
const assert = require('node:assert/strict');
const { harness } = require('./check-mobile-ui.cjs');
const { normalizeThresholds, THRESHOLD_COLUMNS } = harness().load('src/utils/thresholdResolution.js');
module.exports = function thresholdClient({ userId = 'user', tanks = ['tank-1'], legacy = null, rows = [], errors = {} } = {}) {
  const state = { legacy, rows: new Map(rows.map(row => [row.tank_id, row])), queries: [], writes: [] };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from(table) {
      const filters = []; let single = false;
      const chain = {
        select() { return chain; }, eq(key, value) { filters.push(['eq', key, value]); return chain; },
        in(key, values) { filters.push(['in', key, values]); return chain; },
        maybeSingle() { single = true; return chain; },
        insert() { assert.fail('Threshold clients must use the RPC'); },
        update() { assert.fail('Threshold clients must use the RPC'); },
        upsert() { assert.fail('Threshold clients must use the RPC'); },
        then(resolve, reject) {
          state.queries.push({ table, filters });
          let data = table === 'tank_threshold_settings' ? [...state.rows.values()] : state.legacy ? [state.legacy] : [];
          for (const [op, key, value] of filters) data = data.filter(row => op === 'in' ? value.includes(row[key]) : row[key] === value);
          return Promise.resolve({ data: single ? data[0] || null : data, error: errors[table] || null }).then(resolve, reject);
        },
      };
      return chain;
    },
    async rpc(name, args) {
      assert.equal(name, 'apply_tank_thresholds');
      if (!tanks.includes(args.p_tank_id)) return { error: new Error('Tank ownership required') };
      const patch = Object.fromEntries(Object.entries(args.p_patch).map(([column, value]) => [
        Object.entries(THRESHOLD_COLUMNS).find(([key, snake]) => key === column || snake === column)?.[0], value,
      ]));
      assert.ok(!Object.hasOwn(patch, 'undefined'));
      state.writes.push(JSON.parse(JSON.stringify(args)));
      const affected = args.p_scope === 'all_tanks' ? tanks : [args.p_tank_id];
      for (const id of affected) state.rows.set(id, { user_id: userId, tank_id: id,
        thresholds: { ...normalizeThresholds(state.rows.get(id) || state.legacy), ...patch } });
      if (args.p_scope === 'all_tanks') state.legacy = { user_id: userId, thresholds: { ...normalizeThresholds(state.legacy), ...patch } };
      return { data: { affected: affected.length, changed: affected.length }, error: null };
    },
  };
  return { db, state };
};
