import React from "react";
// src/screens/LandingScreen.js

import { Ionicons } from "@expo/vector-icons";

import {
  
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import BrandLogo from "../components/ui/BrandLogo";
import { SHADOW } from "../constants/theme";
import useThemedStyles from '../hooks/useThemedStyles';
import { SafeAreaView } from "react-native-safe-area-context";

export default function LandingScreen({ onLogin, onRegister }) {
  const { colors, styles, isDark } = useThemedStyles(makeStyles);

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.deep}
      />

      <BackgroundDecoration />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.hero}>
            <View style={styles.logoArea}>
              <View style={styles.logoGlow} />

              <View style={styles.logoWrap}>
                <BrandLogo size={118} />
              </View>
            </View>

            <Text style={styles.title}>
              Better care for{"\n"}
              <Text style={styles.titleAccent}>
                every crayfish tank.
              </Text>
            </Text>

            <Text style={styles.subtitle}>
              Monitor water conditions, stay informed, and manage your tanks
              from one simple place.
            </Text>
          </View>

          <View style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
              <View style={styles.overviewIcon}>
                <Ionicons
                  name="water-outline"
                  size={20}
                  color={colors.accent2}
                />
              </View>

              <View style={styles.overviewHeading}>
                <Text style={styles.overviewTitle}>
                  Everything you need for daily tank care
                </Text>

                <Text style={styles.overviewSubtitle}>
                  Important readings and updates without the clutter.
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <FeatureRow
              icon="thermometer-outline"
              title="Monitor conditions"
              description="Check temperature, water level, turbidity, pH, and ammonia."
            />

            <FeatureRow
              icon="notifications-outline"
              title="See important alerts"
              description="Know when your tank needs attention."
            />

            <FeatureRow
              icon="flask-outline"
              title="Check ammonia"
              description="Use your phone camera or record a test result manually."
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.primaryButton}
              onPress={onLogin}
            >
              <Ionicons
                name="log-in-outline"
                size={19}
                color={colors.deep}
              />

              <Text style={styles.primaryButtonText}>
                Sign In
              </Text>

              <View style={styles.arrowBox}>
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={colors.deep}
                />
              </View>
            </TouchableOpacity>

            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>
                Don&apos;t have an account?
              </Text>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onRegister}
              >
                <Text style={styles.registerLink}>
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.footerText}>
            CrayThrive • Monitor. Understand. Care.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function FeatureRow({ icon, title, description }) {
  const { colors, styles } = useThemedStyles(makeStyles);

  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons
          name={icon}
          size={19}
          color={colors.accent2}
        />
      </View>

      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>
          {title}
        </Text>

        <Text style={styles.featureDescription}>
          {description}
        </Text>
      </View>
    </View>
  );
}

function BackgroundDecoration() {
  const { styles } = useThemedStyles(makeStyles);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.bubbleOne} />
      <View style={styles.bubbleTwo} />
      <View style={styles.bubbleThree} />
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.deep,
  },

  safeArea: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 26,
  },

  hero: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    alignItems: "center",
  },

  logoArea: {
    width: 170,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },

  logoGlow: {
    position: "absolute",
    width: 145,
    height: 145,
    borderRadius: 73,
    backgroundColor: "rgba(34,211,197,0.07)",
  },

  logoWrap: {
    width: 138,
    height: 138,
    borderRadius: 69,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: colors.surfaceSoft,

    borderWidth: 1,
    borderColor: "rgba(34,211,197,0.16)",
  },

  title: {
    marginTop: 14,

    color: colors.textStrong,

    fontSize: 31,
    lineHeight: 41,

    fontWeight: "800",

    letterSpacing: -0.85,

    textAlign: "center",
  },

  titleAccent: {
    color: colors.accent2,
  },

  subtitle: {
    marginTop: 14,

    maxWidth: 345,

    color: colors.muted,

    fontSize: 14,
    lineHeight: 22,

    fontWeight: "500",

    textAlign: "center",
  },

  overviewCard: {
    width: "100%",
    maxWidth: 430,

    alignSelf: "center",

    marginTop: 32,

    paddingHorizontal: 17,
    paddingVertical: 17,

    borderRadius: 20,

    backgroundColor: colors.surfaceSoft,

    borderWidth: 1,
    borderColor: colors.border,
  },

  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  overviewIcon: {
    width: 42,
    height: 42,

    borderRadius: 13,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 13,

    backgroundColor: colors.accentSoft,
  },

  overviewHeading: {
    flex: 1,
  },

  overviewTitle: {
    color: colors.textStrong,

    fontSize: 14,
    lineHeight: 19,

    fontWeight: "700",
  },

  overviewSubtitle: {
    marginTop: 3,

    color: colors.muted2,

    fontSize: 12,
    lineHeight: 16,

    fontWeight: "500",
  },

  divider: {
    height: 1,

    marginTop: 16,
    marginBottom: 3,

    backgroundColor: colors.surfaceSoft,
  },

  featureRow: {
    flexDirection: "row",
    alignItems: "center",

    paddingVertical: 11,
  },

  featureIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,

    backgroundColor: "rgba(34,211,197,0.08)",
  },

  featureContent: {
    flex: 1,
  },

  featureTitle: {
    color: colors.textStrong,

    fontSize: 13,
    fontWeight: "700",
  },

  featureDescription: {
    marginTop: 3,

    color: colors.muted,

    fontSize: 12,
    lineHeight: 17,

    fontWeight: "500",
  },

  actions: {
    width: "100%",
    maxWidth: 430,

    alignSelf: "center",

    marginTop: 27,
  },

  primaryButton: {
    height: 56,

    borderRadius: 17,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 12,

    backgroundColor: colors.accent2,

    ...SHADOW.card,
  },

  primaryButtonText: {
    marginLeft: 8,

    color: colors.deep,

    fontSize: 15,
    fontWeight: "800",
  },

  arrowBox: {
    position: "absolute",
    right: 10,

    width: 36,
    height: 36,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "rgba(5,26,34,0.08)",
  },

  registerRow: {
    marginTop: 18,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    flexWrap: "wrap",

    gap: 5,
  },

  registerPrompt: {
    color: colors.muted,

    fontSize: 12.5,
    fontWeight: "500",
  },

  registerLink: {
    color: colors.accent2,

    fontSize: 12.5,
    fontWeight: "700",
  },

  footerText: {
    marginTop: "auto",

    paddingTop: 30,

    color: colors.muted2,

    fontSize: 12,

    fontWeight: "500",

    textAlign: "center",
  },

  glowTop: {
    position: "absolute",

    top: -170,
    right: -130,

    width: 360,
    height: 360,

    borderRadius: 180,

    backgroundColor: "rgba(34,211,197,0.06)",
  },

  glowBottom: {
    position: "absolute",

    bottom: -210,
    left: -140,

    width: 390,
    height: 390,

    borderRadius: 195,

    backgroundColor: "rgba(34,211,197,0.03)",
  },

  bubbleOne: {
    position: "absolute",

    top: 160,
    left: 28,

    width: 7,
    height: 7,

    borderRadius: 4,

    borderWidth: 1,
    borderColor: "rgba(34,211,197,0.18)",
  },

  bubbleTwo: {
    position: "absolute",

    top: 225,
    right: 32,

    width: 11,
    height: 11,

    borderRadius: 6,

    borderWidth: 1,
    borderColor: "rgba(34,211,197,0.11)",
  },

  bubbleThree: {
    position: "absolute",

    bottom: 175,
    right: 42,

    width: 5,
    height: 5,

    borderRadius: 3,

    backgroundColor: "rgba(34,211,197,0.14)",
  },
});
}
