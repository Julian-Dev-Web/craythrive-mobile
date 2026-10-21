// Presentation only. Requested duration_ms/seconds never proves actual pump runtime.
const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => text(value).toLowerCase().replace(/[\s-]+/g, '_');
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function formatPumpAction(record = {}) {
  const metadata = object(record.metadata);
  const action = [record.command_type, record.action_type, metadata.command_type, metadata.action_type]
    .map(key).find(value => /^(drain|drain_for|drain_water|drain_pump|pump_drain|refill|refill_for|fill|fill_water|add_water|refill_pump|pump_refill)$/.test(value));
  const title = text(record.title);
  const titleKind = /^(drain(?: water)?|refill|add water)\b/i.exec(title)?.[1].toLowerCase();
  const kind = action ? action.includes('drain') ? 'drain' : 'refill'
    : titleKind ? titleKind.startsWith('drain') ? 'drain' : 'refill' : null;
  if (!kind) return null;

  // Explicit execution status wins over old success text. alerts.status is the
  // read/resolution lifecycle ("active"), so it cannot indicate pump success.
  const status = [record.command_status, record.action_status, metadata.command_status, metadata.action_status,
    action && record.status].map(key).find(value => /^(done|completed|success|succeeded|failed|error|rejected|blocked|cancelled|canceled|pending|queued|running|executing)$/.test(value))
    || (/rejected|blocked/i.test(title) ? 'rejected' : /failed|failure/i.test(title) ? 'failed'
      : /cancelled|canceled/i.test(title) ? 'cancelled' : /completed|\bdone\b/i.test(title) ? 'done' : 'recorded');
  const label = kind === 'drain' ? 'Drain' : 'Add Water';
  const actionLabel = kind === 'drain' ? 'drain' : 'refill';
  if (['rejected', 'blocked'].includes(status)) return {
    title: `${label} rejected`, message: `The ${actionLabel} action was blocked by a safety rule.`, status: 'rejected', kind,
  };
  if (['failed', 'error'].includes(status)) return {
    title: `${label} failed`, message: `The ${actionLabel} action could not be completed.`, status: 'failed', kind,
  };
  if (!['done', 'completed', 'success', 'succeeded'].includes(status)) return {
    title: `${label} ${status}`, message: `The ${actionLabel} action is ${status === 'recorded' ? 'recorded' : status}.`, status, kind,
  };

  let message = kind === 'drain' ? 'The drain pump was activated.' : 'The refill pump was activated.';
  if (kind === 'refill') {
    // Only explicit actual/measured runtime. Never use duration_ms, requested_*,
    // run_seconds or pulse_ms without a documented actual-runtime contract.
    const actual = [record, metadata].flatMap(source => [
      [source.actual_duration_ms, 1000], [source.actual_duration_seconds, 1],
    ]).find(([value]) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
      && Number.isFinite(Number(value)) && Number(value) > 0);
    if (actual) {
      const seconds = Number(actual[0]) / actual[1];
      const rounded = Number(seconds.toFixed(3));
      const duration = seconds < 0.001 ? `${Number((seconds * 1000).toPrecision(3))} milliseconds`
        : `${rounded} ${rounded === 1 ? 'second' : 'seconds'}`;
      message = `The refill pump ran for ${duration}.`;
    }
  }
  return { title: `${label} completed`, message, status: 'done', kind };
}

export function formatPumpAlert(record) {
  return formatPumpAction(record) || { title: record?.title, message: record?.message };
}
