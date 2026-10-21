// src/components/ui/SectionHeader.js

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";

export default function SectionHeader({ title, action, onActionPress, style }) {
  const theme = useSafeTheme();
  const colors = theme.colors;

  const styles = makeStyles(colors);

  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>

      {action ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onActionPress}>
          <Text style={styles.action}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function useSafeTheme() {
  try {
    return useAppTheme();
  } catch {
    return {
      colors: COLORS,
    };
  }
}

function makeStyles(colors) {
  return StyleSheet.create({
    row: {
      marginTop: 24,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },

    title: {
      flex: 1,
      color: colors.textStrong || colors.white,
      fontSize: 18,
      fontWeight: "900",
      letterSpacing: -0.2,
    },

    action: {
      color: colors.accent2,
      fontSize: 12,
      fontWeight: "900",
    },
  });
}