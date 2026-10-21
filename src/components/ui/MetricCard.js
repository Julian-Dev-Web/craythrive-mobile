import React from "react";
// src/components/ui/MetricCard.js


import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { RADIUS } from "../../constants/theme";
import AppCard from "./AppCard";
import { MonitoringBadge } from "../tank/SensorReadingCard";
import useThemedStyles from '../../hooks/useThemedStyles';

function getSafeIcon(icon) {
  // MaterialCommunityIcons "blur-on" can cause issues depending on setup.
  // Use Ionicons-safe alternative instead.
  if (icon === "blur-on") return "eye-outline";

  return icon || "stats-chart-outline";
}

export default function MetricCard({
  icon,
  label,
  value,
  status,
}) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const hasValue = value !== null && value !== undefined && value !== "" && value !== "--"
    && !(typeof value === "number" && !Number.isFinite(value));
  const labelStatus = hasValue ? status : "No Data";

  return (
    <AppCard style={styles.card}>
      <View style={styles.iconBox}>
        <Ionicons
          name={getSafeIcon(icon)}
          size={21}
          color={colors.accent2}
        />
      </View>

      <Text style={styles.label}>{label}</Text>

      <Text
        style={styles.value}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {hasValue ? value : "--"}
      </Text>

      {labelStatus ? <MonitoringBadge result={{label: labelStatus, tone: labelStatus === "Normal" ? "success"
        : labelStatus === "Warning" ? "warning" : labelStatus === "Critical" ? "danger" : "neutral"}} colors={colors} /> : null}
    </AppCard>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  card: {
    width: "48%",
    padding: 15,
    borderRadius: RADIUS.lg,
  },

  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },

  value: {
    marginTop: 5,
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },

  status: {
    marginTop: 5,
    color: colors.accent2,
    fontSize: 12,
    fontWeight: "900",
  },
});
}
