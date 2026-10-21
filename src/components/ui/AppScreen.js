import React from "react";
// src/components/ui/AppScreen.js

import { LinearGradient } from "expo-linear-gradient";

import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../../constants/theme";
import { useAppTheme } from "../../context/ThemeContext";
import useAndroidBack from "../../hooks/useAndroidBack";

export default function AppScreen({ children, safe = true, keyboard = false, onBack = undefined, backDisabled = false }) {
  useAndroidBack(onBack, backDisabled);
  const theme = useSafeTheme();
  const colors = theme.colors;
  const isDark = theme.isDark;

  const Wrapper = safe ? SafeAreaView : View;
  const styles = makeStyles(colors, isDark);

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background || colors.deep}
      />

      <LinearGradient
        colors={
          isDark
            ? [colors.mid || COLORS.mid, colors.deep || COLORS.deep]
            : [colors.background2 || "#E9FAF7", colors.background || "#F3FFFC"]
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <View style={styles.glowSmall} />

      <Wrapper style={styles.safe}>
        {keyboard ? <KeyboardAvoidingView style={styles.safe}
          behavior={Platform.OS === "ios" ? "padding" : "height"}>
          {children}
        </KeyboardAvoidingView> : children}
      </Wrapper>
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
    root: {
      flex: 1,
      backgroundColor: colors.background || colors.deep,
      overflow: "hidden",
    },

    safe: {
      flex: 1,
    },

    glowTop: {
      position: "absolute",
      top: -110,
      right: -90,
      width: 270,
      height: 270,
      borderRadius: 135,
      backgroundColor: isDark
        ? "rgba(34,211,197,0.17)"
        : "rgba(17,183,168,0.16)",
    },

    glowBottom: {
      position: "absolute",
      bottom: 70,
      left: -130,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: isDark
        ? "rgba(34,211,197,0.075)"
        : "rgba(17,183,168,0.10)",
    },

    glowSmall: {
      position: "absolute",
      top: 180,
      left: 28,
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: isDark
        ? "rgba(255,255,255,0.035)"
        : "rgba(8,31,48,0.035)",
    },
  });
}
