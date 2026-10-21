import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import useTankActivity from '../../hooks/useTankActivity';
import { ACTIVITY_CATEGORIES, buildTankActivity } from '../../utils/activityHistory';
import { OPTIONAL_POLICY_FIELDS } from '../../utils/classificationPolicy';
import { THRESHOLD_COLUMNS } from '../../utils/thresholdResolution';
import { formatPhilippineDateTime, manilaDayRange } from '../../utils/philippineTime';
import { MonitoringBadge } from './SensorReadingCard';

function snapshotText(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Not recorded';
  const fields = [...Object.keys(THRESHOLD_COLUMNS), ...Object.keys(OPTIONAL_POLICY_FIELDS)];
  const entries = fields.filter(key => value[key] != null && ['number','string'].includes(typeof value[key]));
  return entries.length ? entries.map(key => `${OPTIONAL_POLICY_FIELDS[key]?.[0] || key}: ${value[key]}${OPTIONAL_POLICY_FIELDS[key]?.[1] ? ` ${OPTIONAL_POLICY_FIELDS[key][1]}` : /temperature/.test(key) ? ' °C' : /water/.test(key) ? ' cm' : /turbidity/.test(key) ? ' V' : /ammonia/.test(key) ? ' ppm' : ''}`).join('\n') : 'Not recorded';
}
export function ActivityEntry({ item, colors }) {
  if (!item) return null;
  const text = { color: colors.muted, fontSize: 12, lineHeight: 18 };
  return <View style={{ padding: 13, marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, gap: 6 }}>
    <Text style={{ color: colors.textStrong, fontWeight: '700', fontSize: 14 }}>{item.tankName} · {item.title}</Text>
    <MonitoringBadge result={{ label: item.outcome, tone: item.tone }} colors={colors} />
    <Text style={text}>Recorded severity: {item.severity}{item.classification ? ` · Classification: ${item.classification}` : ''}</Text>
    <Text style={text}>Action / event: {item.action}</Text>
    <Text style={text}>Saved status: {item.savedStatus}</Text>
    <Text style={text}>Recorded reason / source note: {item.reason}</Text>
    {item.reading !== null ? <Text style={text}>Recorded reading: {item.reading}{item.unit ? ` ${item.unit}` : ''}</Text> : null}
    {item.readingTimestamp ? <Text style={text}>Source reading time: {formatPhilippineDateTime(item.readingTimestamp)} PhST</Text> : null}
    <Text style={text}>Result: {item.result}</Text>
    <Text style={text}>{item.timestampBasis}: {item.timestampLabel}</Text>
    {item.deviceTimestamp ? <Text style={text}>Device-provided execution time (not independently verified): {formatPhilippineDateTime(item.deviceTimestamp)} PhST</Text> : null}
    {item.thresholdSnapshot ? <Text style={text}>Historical threshold snapshot:{'\n'}{snapshotText(item.thresholdSnapshot)}</Text>
      : item.category === 'sensor' || item.category === 'ammonia' ? <Text style={text}>Historical thresholds: not recorded. Current settings are not substituted.</Text> : null}
    {item.thresholdChanges ? <Text style={text}>Before:{'\n'}{snapshotText(item.thresholdChanges.before)}{'\n'}After:{'\n'}{snapshotText(item.thresholdChanges.after)}</Text> : null}
    {item.recommendation ? <Text style={text}>{item.recommendationSaved ? 'Saved guidance' : 'Follow-up guidance (not recorded at event time)'}: {item.recommendation}</Text> : null}
    {item.linkedNotifications.map(notification => <Text key={notification.id} style={text}>Linked notification: {notification.title} · {notification.severity || 'unrecorded severity'} · {notification.timestamp ? `${formatPhilippineDateTime(notification.timestamp)} PhST` : 'time unavailable'}. A notification does not confirm physical execution.</Text>)}
  </View>;
}
export default function TankActivityTimeline({ tank, colors }) {
  const [category, setCategory] = useState('all'), [dateInput, setDateInput] = useState(''), [date, setDate] = useState('');
  const [dateError, setDateError] = useState(''), [limit, setLimit] = useState(100);
  const state = useTankActivity(tank?.id, date, limit), data = state.data;
  const items = data ? buildTankActivity({ ...data, tank: data.tank, start: data.range.start, end: data.range.end, category }) : [];
  const text = { color: colors.muted, fontSize: 12, lineHeight: 18 };
  const button = { minHeight: 44, padding: 10, borderRadius: 10, justifyContent: 'center', backgroundColor: colors.surfaceSoft };
  return <View style={{ marginTop: 22, gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: colors.textStrong, fontSize: 17, fontWeight: '700' }}>Activity history</Text>
    <Text style={text}>Saved events for {tank?.tank_name || 'this tank'}, latest first. Commands and notifications do not prove pump flow or feed delivery.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{['all',...ACTIVITY_CATEGORIES].map(value =>
      <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: value === category }} onPress={() => setCategory(value)} style={button}>
        <Text style={{ color: category === value ? colors.accent2 : colors.muted }}>{value === 'all' ? 'All events' : value.charAt(0).toUpperCase() + value.slice(1)}</Text>
      </TouchableOpacity>)}</View>
    <Text style={text}>Philippine date (YYYY-MM-DD). Leave empty for the last 7 Philippine days.</Text>
    <TextInput accessibilityLabel="Activity Philippine date YYYY-MM-DD" value={dateInput} onChangeText={setDateInput} autoCapitalize="none" autoCorrect={false}
      placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={{ ...button, color: colors.textStrong, borderWidth: 1, borderColor: colors.border }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <TouchableOpacity accessibilityRole="button" onPress={() => { try { const value = dateInput.trim(); if (value) manilaDayRange(value); setDate(value); setLimit(100); setDateError(''); } catch (error) { setDateError(error.message); } }} style={button}>
        <Text style={{ color: colors.accent2 }}>Apply date</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => { setDate(''); setDateInput(''); setLimit(100); setDateError(''); }} style={button}>
        <Text style={{ color: colors.accent2 }}>Last 7 days</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={state.loading} onPress={state.refresh} style={button}>
        <Text style={{ color: colors.accent2 }}>Refresh history</Text></TouchableOpacity>
    </View>
    {dateError ? <Text accessibilityRole="alert" style={text}>{dateError}</Text> : null}
    {data?.range ? <Text style={text}>Loaded window: {data.range.firstDay} to {data.range.today} PhST</Text> : null}
    {state.loading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator color={colors.accent2} /><Text style={text}>Loading saved activity...</Text></View> : null}
    {state.error ? <Text accessibilityRole="alert" style={text}>{state.error}{data ? ' Displayed history is cached and may be incomplete.' : ''}</Text> : null}
    {data?.notice ? <Text style={text}>{data.notice}</Text> : null}
    {!state.loading && !state.error && !items.length ? <Text style={text}>No saved events match this tank, type and date in the loaded window.</Text> : null}
    {items.map(item => <ActivityEntry key={item.id} item={item} colors={colors} />)}
    {data?.limited ? <Text style={text}>History is limited to {limit} records per source. Choose a specific day for a narrower window.</Text> : null}
    {data?.limited && limit < 500 ? <TouchableOpacity accessibilityRole="button" disabled={state.loading} onPress={() => setLimit(Math.min(500, limit + 100))} style={button}>
      <Text style={{ color: colors.accent2 }}>Load more history</Text></TouchableOpacity> : null}
  </View>;
}
