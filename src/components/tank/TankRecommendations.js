import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import useTankRecommendationData from '../../hooks/useTankRecommendationData';
import { buildSensorRecommendations } from '../../utils/sensorRecommendations';
import { askCrayThriveAi, buildAiTankContext, getAiFailureMessage } from '../../services/aiGuideService';
import { MonitoringBadge } from './SensorReadingCard';
import useSingleFlight from '../../hooks/useSingleFlight';

export default function TankRecommendations({ tank, colors, onOpenAiGuide, monitoringState }) {
  const tankId = tank?.id || tank?.tank_id;
  const ownData = useTankRecommendationData(monitoringState ? null : tankId),snapshot=monitoringState?.snapshot;
  const data = useMemo(()=>monitoringState ? {...monitoringState,tankId,
    sensor:snapshot?.sensors.find(row=>String(row.tank_id)===String(tankId))||null,
    scan:snapshot?.scans.find(row=>String(row.tank_id)===String(tankId))||null,
    thresholds:snapshot?.thresholds[String(tankId)],paired:snapshot?.paired.has(String(tankId))||false,serverTime:snapshot?.serverTime} : ownData,[monitoringState,tankId,snapshot,ownData]);
  const report = useMemo(() => buildSensorRecommendations({ tank, ...data }), [tank, data]);
  const [answer, setAnswer] = useState('');
  const [aiError, setAiError] = useState('');
  const [explaining, setExplaining] = useState(false);
  const request = useRef(0);
  const snapshotKey = JSON.stringify([report.tankId, data.dataAvailable, report.items]);
  const latestSnapshot = useRef(snapshotKey);
  latestSnapshot.current = snapshotKey;
  useEffect(() => {
    request.current += 1; setAnswer(''); setAiError(''); setExplaining(false);
    return () => { request.current += 1; };
  }, [snapshotKey]);

  const explain = useSingleFlight(async function explain() {
    if (explaining || !data.dataAvailable || !data.thresholds) return;
    const ticket = ++request.current, snapshot = snapshotKey;
    setExplaining(true); setAnswer(''); setAiError('');
    try {
      // Existing authenticated Edge Function; only its answer text is displayed.
      // Suggestions/actions in its response never enter a control/Apply path.
      const context = await buildAiTankContext({ tank });
      const question = `Explain these CrayThrive recommendations in farmer-friendly language. Keep their deterministic status unchanged. Do not propose threshold changes, chemicals or equipment commands. If newer context differs, ask me to refresh. Never invent missing Critical limits or recency windows. Snapshot: ${JSON.stringify(report.items.map(item => ({ parameter: item.parameter,
        reading: item.readingLabel, safe: item.safeRange, critical: item.criticalRange, status: item.label, timestamp: item.timestamp })))}`;
      const result = await askCrayThriveAi({ question, context });
      if (ticket === request.current && snapshot === latestSnapshot.current) setAnswer(result.answer || result.message || 'No explanation returned. Try again.');
    } catch (error) {
      if (ticket === request.current && snapshot === latestSnapshot.current) setAiError(getAiFailureMessage(error));
    } finally {
      if (ticket === request.current && snapshot === latestSnapshot.current) setExplaining(false);
    }
  });

  const textStyle = { color: colors.muted, fontSize: 12, lineHeight: 18 };
  const buttonStyle = { minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSoft,
    justifyContent: 'center', alignItems: 'center' };
  return <View style={{ marginTop: 20, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: colors.textStrong, fontSize: 17, fontWeight: '700' }}>Recommendations</Text>
    <Text style={textStyle}>Latest saved data for {report.tankName}. Verify the tank before corrective action.</Text>
    <Text style={textStyle}>{report.policyNote}</Text>
    {data.loading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ActivityIndicator color={colors.accent2} /><Text style={textStyle}>Refreshing recommendations...</Text>
    </View> : null}
    {data.error ? <Text accessibilityRole="alert" style={textStyle}>{data.error}</Text> : null}
    {report.emptyMessage ? <Text style={textStyle}>{report.emptyMessage}</Text> : null}
    {report.items.map(item => <View key={item.key} style={{ padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 7 }}>
      <Text style={{ color: colors.textStrong, fontSize: 14, fontWeight: '700' }}>{item.tankName} · {item.parameter}</Text>
      <Text style={textStyle}>{item.manual ? 'Latest saved manual scan' : 'Latest saved reading'}: {item.readingLabel}</Text>
      <Text style={textStyle}>{item.safeRange}</Text>
      {item.criticalRange ? <Text style={textStyle}>{item.criticalRange}</Text> : null}
      <MonitoringBadge result={{ label: item.label, tone: item.tone }} colors={colors} />
      <Text style={textStyle}>{item.reason}</Text>
      <Text style={{ ...textStyle, color: colors.textStrong }}>Suggested action: {item.action}</Text>
      <Text style={textStyle}>Reading time: {item.timestampLabel}</Text>
    </View>)}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh tank recommendations"
      disabled={data.loading} onPress={data.refresh} style={buttonStyle}>
      <Text style={{ color: colors.accent2, fontWeight: '600' }}>Refresh recommendations</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explain recommendations with AI Guide"
      accessibilityState={{ disabled: explaining || data.loading || !data.dataAvailable }}
      disabled={explaining || data.loading || !data.dataAvailable} onPress={explain} style={buttonStyle}>
      <Text style={{ color: colors.accent2, fontWeight: '600' }}>{explaining ? 'Explaining...' : 'Explain with AI Guide'}</Text>
    </TouchableOpacity>
    {answer ? <View style={{ padding: 14, backgroundColor: colors.surfaceSoft, borderRadius: 12, gap: 8 }}>
      <Text style={{ color: colors.textStrong, fontWeight: '700' }}>AI explanation</Text>
      <Text style={textStyle}>The deterministic recommendations above remain the reference. Verify advice before acting.</Text>
      <Text selectable style={textStyle}>{answer}</Text>
    </View> : null}
    {aiError ? <Text accessibilityRole="alert" style={textStyle}>{aiError}</Text> : null}
    {onOpenAiGuide ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open AI Guide for ${report.tankName}`}
      onPress={() => onOpenAiGuide(tank)} style={buttonStyle}>
      <Text style={{ color: colors.accent2, fontWeight: '600' }}>Open AI Guide for {report.tankName}</Text>
    </TouchableOpacity> : null}
  </View>;
}
