import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { OPTIONAL_POLICY_FIELDS, validateClassificationSettings } from '../../utils/classificationPolicy';
import { configureClassification } from '../../utils/thresholdSettings';
import useSingleFlight from '../../hooks/useSingleFlight';

export default function ClassificationSettings({ tankId, thresholds, colors, disabled, onSaved }) {
  const [scope, setScope] = useState('single_tank'), [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const original = scope === 'single_tank' ? thresholds?.policyOverrides || {} : thresholds?.policyAccount || {};
  const identity = JSON.stringify([tankId, scope, original]);
  const latestIdentity = useRef(identity), mounted = useRef(true);
  latestIdentity.current = identity;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setDraft(Object.fromEntries(Object.keys(OPTIONAL_POLICY_FIELDS).map(key => [key, original[key] == null ? '' : String(original[key])]))); setMessage('');
    // identity contains all relevant values, including tank and scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);
  const save = useSingleFlight(async expectedIdentity => {
    if (disabled || busy || !tankId || !mounted.current || latestIdentity.current !== expectedIdentity) return;
    const patch = {}, next = { ...thresholds };
    for (const key of Object.keys(OPTIONAL_POLICY_FIELDS)) {
      const raw = String(draft[key] ?? '').trim(), value = raw ? Number(raw) : null;
      if (raw && !Number.isFinite(value)) { setMessage(`${OPTIONAL_POLICY_FIELDS[key][0]} needs a valid number.`); return; }
      if (value !== (original[key] ?? null)) patch[key] = value;
      next[key] = scope === 'single_tank' ? value ?? thresholds?.policyAccount?.[key] ?? null : thresholds?.policyOverrides?.[key] ?? value;
    }
    if (!Object.keys(patch).length) { setMessage('No changes to save.'); return; }
    const errors = validateClassificationSettings(next);
    if (errors.length) { setMessage(errors.join('\n')); return; }
    setBusy(true); setMessage('');
    try { await configureClassification({ tankId, patch, scope }); await onSaved?.(); setMessage('Saved classification settings.'); }
    catch (error) { setMessage(error.message || 'Could not save. Retry when connected.'); }
    finally { setBusy(false); }
  });
  const confirm = () => {
    const detail = scope === 'single_tank' ? 'Save the entered verified limits for this tank? Empty fields inherit account values.'
      : 'Update account defaults? Every tank inheriting these fields may change classification; tank overrides stay in place.';
    if (Platform.OS === 'web') { if (typeof globalThis.confirm === 'function' && globalThis.confirm(detail)) void save(identity); }
    else Alert.alert('Save classification settings', detail, [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: () => save(identity) }]);
  };
  const blocked = disabled || busy || !tankId, textStyle = { color: colors.muted, fontSize: 12, lineHeight: 18 };
  return <View style={{ marginTop: 20, gap: 10 }}>
    <Text accessibilityRole="header" style={{ color: colors.textStrong, fontSize: 16, fontWeight: '700' }}>Classification limits</Text>
    <Text style={textStyle}>Enter verified limits and approved reading ages. No Critical or expiry defaults are supplied. This changes monitoring and alerts; hardware safety rules remain separate.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['single_tank', 'This tank'], ['account_defaults', 'Account defaults']].map(([value, label]) =>
      <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: scope === value, disabled: blocked }} disabled={blocked}
        onPress={() => setScope(value)} style={{ minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 12, backgroundColor: colors.surfaceSoft }}>
        <Text style={{ color: scope === value ? colors.accent2 : colors.muted }}>{label}</Text>
      </TouchableOpacity>)}</View>
    <Text style={textStyle}>{scope === 'single_tank' ? 'Empty = inherit account value; no account value = unconfigured.' : 'Empty = unconfigured. This updates only inherited fields.'}</Text>
    {Object.entries(OPTIONAL_POLICY_FIELDS).map(([key, [label, unit]]) => <View key={key} style={{ gap: 5 }}>
      <Text style={{ color: colors.textStrong, fontSize: 12 }}>{label}{unit ? ` (${unit})` : ''}</Text>
      <TextInput accessibilityLabel={`${label}${unit ? ` in ${unit}` : ''}`} value={draft[key] ?? ''} editable={!blocked} keyboardType="numbers-and-punctuation"
        onChangeText={value => setDraft(current => ({ ...current, [key]: value }))} placeholder="Not configured / inherit" placeholderTextColor={colors.muted}
        style={{ color: colors.textStrong, minHeight: 44, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surfaceSoft }} />
      <Text style={textStyle}>Effective: {thresholds?.[key] ?? 'Not configured'}{thresholds?.[key] != null && unit ? ` ${unit}` : ''} · Source: {thresholds?.policySources?.[key] || 'unset'}</Text>
    </View>)}
    {message ? <Text accessibilityRole="alert" style={textStyle}>{message}</Text> : null}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={confirm}
      style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSoft }}>
      <Text style={{ color: colors.accent2, fontWeight: '700' }}>{busy ? 'Saving...' : 'Review and save classification limits'}</Text>
    </TouchableOpacity>
  </View>;
}
