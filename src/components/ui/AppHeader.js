import React from "react";
// src/components/ui/AppHeader.js

import { Ionicons } from "@expo/vector-icons";

import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";

import { COLORS } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import NotificationBell from "./NotificationBell";

export default function AppHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  rightAction,
  onRightPress,
  showBell = true,
  rightDisabled = false,
}) {
  const { width } = useWindowDimensions();
  const narrow = width < 380;
  const theme = useSafeTheme();
  const colors = theme.colors;
  const isDark = theme.isDark;

  const styles = makeStyles(colors, isDark);

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}

        <View style={styles.titleRow}>
          {icon && !narrow ? (
            <View style={styles.iconBox}>
              <Ionicons name={icon} size={22} color={colors.accent2} />
            </View>
          ) : null}

          <Text style={[styles.title, narrow && {fontSize: 24, lineHeight: 31}]}>
            {title}
          </Text>
        </View>

        {subtitle ? (
          <Text style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {showBell ? <NotificationBell size={narrow ? 44 : 50} /> : null}

        {rightAction ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.actionButton, narrow && {width: 44, height: 44}, (rightDisabled || !onRightPress) && {opacity: 0.5}]}
            onPress={onRightPress}
            disabled={rightDisabled || !onRightPress}
            accessibilityRole="button"
            accessibilityLabel={rightAction === "arrow-back" ? "Back" : rightAction?.includes("refresh") ? "Refresh" : "More actions"}
          >
            <Ionicons name={rightAction} size={22} color={colors.accent2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function useSafeTheme() {
  try {
    return useAppTheme();
  } catch {
    return {
      colors: COLORS,
      isDark: true,
    };
  }
}

function makeStyles(colors, isDark) {
  return StyleSheet.create({
    header: {
      paddingTop: 8,
      paddingBottom: 18,
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 14,
    },

    left: {
      flex: 1,
      minWidth: 0,
    },

    eyebrow: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      marginBottom: 8,
    },

    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    iconBox: {
      width: 42,
      height: 42,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },

    title: {
      flex: 1,
      color: colors.textStrong || colors.white,
      fontSize: 29,
      lineHeight: 38,
      fontWeight: "900",
      letterSpacing: -0.7,
    },

    subtitle: {
      marginTop: 10,
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "700",
    },

    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    actionButton: {
      width: 50,
      height: 50,
      borderRadius: 18,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
