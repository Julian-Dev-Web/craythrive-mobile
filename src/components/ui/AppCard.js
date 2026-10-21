// src/components/ui/AppCard.js

import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { COLORS, RADIUS, SHADOW } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";

export default function AppCard({
  children,
  style,
  strong = false,
  soft = false,
  onPress,
  disabled = false,
}) {
  const theme = useSafeTheme();
  const colors = theme.colors;
  const isDark = theme.isDark;

  const styles = makeStyles(colors, isDark);

  const cardStyle = [
    styles.card,
    strong && styles.cardStrong,
    soft && styles.cardSoft,
    disabled && styles.disabled,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.86}
        style={cardStyle}
        onPress={onPress}
        disabled={disabled}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
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
    card: {
      borderRadius: RADIUS.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },

    cardStrong: {
      backgroundColor: colors.surfaceStrong || colors.surface,
      borderColor: colors.accentBorder,
      ...SHADOW.card,
    },

    cardSoft: {
      backgroundColor: colors.surfaceSoft || colors.surface,
    },

    disabled: {
      opacity: 0.65,
    },
  });
}