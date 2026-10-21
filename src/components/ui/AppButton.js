import React from "react";
// src/components/ui/AppButton.js

import { Ionicons } from "@expo/vector-icons";

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

import { COLORS, RADIUS, SHADOW } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";

export default function AppButton({
  title,
  children,
  onPress,
  icon,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  textStyle,
}) {
  const theme = useSafeTheme();
  const colors = theme.colors;
  const isDark = theme.isDark;

  const styles = makeStyles(colors, isDark);

  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";
  const isSoft = variant === "soft";

  const buttonStyle = [
    styles.button,
    isPrimary && styles.primary,
    isDanger && styles.danger,
    isGhost && styles.ghost,
    isSoft && styles.soft,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.text,
    isPrimary && { color: "#061826" },
    isGhost && styles.ghostText,
    isSoft && styles.softText,
    textStyle,
  ];

  const iconColor =
    isPrimary ? "#061826" : isDanger ? "#FFFFFF" : colors.accent2 || COLORS.accent2;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={typeof (children || title) === "string" ? (children || title) : undefined}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color={iconColor} /> : null}
          <Text style={labelStyle}>{children || title}</Text>
        </>
      )}
    </TouchableOpacity>
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
    button: {
      minHeight: 56,
      paddingVertical: 14,
      borderRadius: RADIUS.lg,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 9,
    },

    primary: {
      backgroundColor: colors.accent,
      ...SHADOW.card,
    },

    danger: {
      backgroundColor: colors.danger,
    },

    ghost: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },

    soft: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },

    disabled: {
      opacity: 0.62,
    },

    text: {
      flexShrink: 1,
      textAlign: "center",
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    ghostText: {
      color: colors.textStrong || colors.white,
    },

    softText: {
      color: colors.accent2,
    },
  });
}
