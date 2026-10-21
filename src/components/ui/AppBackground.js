// src/components/ui/AppBackground.js

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import useThemedStyles from '../../hooks/useThemedStyles';

export default function AppBackground({ children }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.mid, colors.deep]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <View style={styles.glowSmall} />

      {children}
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.deep,
    overflow: "hidden",
  },
  glowTop: {
    position: "absolute",
    top: -95,
    right: -90,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(25,183,166,0.18)",
  },
  glowBottom: {
    position: "absolute",
    bottom: 120,
    left: -115,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(25,183,166,0.08)",
  },
  glowSmall: {
    position: "absolute",
    top: 170,
    left: 28,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceSoft,
  },
});
}
