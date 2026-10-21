import React from "react";

import { Text, StyleSheet } from 'react-native';
import { RADIUS } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';

export default function StatusPill({ label = 'No Data', style }) {
  const { colors } = useAppTheme();
  const tone = label === 'Critical' ? 'danger' : label === 'Warning' ? 'warning'
    : label === 'Normal' ? 'success' : 'neutral';
  const backgroundColor = tone === 'neutral' ? colors.surfaceSoft : colors[`${tone}Soft`];
  const color = tone === 'neutral' ? colors.muted : colors[tone];
  return <Text style={[styles.pill, { backgroundColor, color }, style]}>{label}</Text>;
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: RADIUS.pill, fontSize: 12, fontWeight: '900', overflow: 'hidden',
  },
});
