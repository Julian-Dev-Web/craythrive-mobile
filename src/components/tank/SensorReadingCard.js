import React from "react";

import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { monitoringColor } from '../../utils/sensorMonitoring';
import { formatPhilippineDateTime } from '../../utils/philippineTime';

export function MonitoringBadge({ result, colors }) {
  const tone = result.tone || result.type || 'neutral';
  const color = monitoringColor(tone, colors);
  const icon = result.icon || (tone === 'success' ? 'checkmark-circle-outline'
    : tone === 'warning' ? 'warning-outline' : tone === 'danger' ? 'alert-circle-outline' : 'help-circle-outline');
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.surfaceSoft }}>
    <Ionicons name={icon} size={16} color={color} />
    <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{result.label || result.status || 'No Data'}</Text>
  </View>;
}

// Badge, icon and color all come from the same evaluated numeric measurement.
export function SensorSafeRange({ metric, colors }) {
  if (!metric?.safeRangeLabel) return null;
  return <View><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 }}>
    {metric.safeRangeLabel}
  </Text>{metric.criticalRangeLabel ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }}>{metric.criticalRangeLabel}</Text> : null}</View>;
}

export default function SensorReadingCard({ metric, colors, compact = false }) {
  const color = monitoringColor(metric.tone, colors);
  return (
    <View style={{ flexGrow: 1, flexBasis: '46%', minWidth: 0,
      padding: compact ? 8 : 12, borderRadius: 16, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{metric.title}</Text>
      {metric.key === 'ammonia' ? <Text style={{ color: colors.muted, fontSize: 11 }}>{metric.sourceLabel || 'Saved test / scan'}</Text> : null}
      <Text style={{ color: colors.textStrong, fontSize: compact ? 16 : 20, fontWeight: '700', marginTop: 5 }}>
        {metric.severity === 'missing' ? metric.label : metric.displayValue}
      </Text>
      <SensorSafeRange metric={metric} colors={colors} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        <Ionicons name={metric.icon} size={16} color={color} />
        <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{metric.label}</Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{metric.reason}</Text>
      {metric.scanTimestampLabel ? <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{metric.scanTimestampLabel}</Text> : null}
      {metric.key !== 'ammonia' && metric.timestamp ? <Text style={{color:colors.muted,fontSize:12,lineHeight:17,marginTop:4}}>Reading time: {formatPhilippineDateTime(metric.timestamp)} PhST</Text> : null}
    </View>
  );
}
