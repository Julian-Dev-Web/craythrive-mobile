import React from "react";
// src/screens/main/settings/AboutCrayThriveScreen.js

import { Ionicons } from "@expo/vector-icons";

import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import CrayfishIcon from "../../../components/icons/CrayfishIcon";
import AppCard from "../../../components/ui/AppCard";
import AppHeader from "../../../components/ui/AppHeader";
import AppScreen from "../../../components/ui/AppScreen";
import SectionHeader from "../../../components/ui/SectionHeader";
import {
  COLORS,
  SHADOW,
} from "../../../constants/theme";

export default function AboutCrayThriveScreen({
  onBack,
}) {
  return (
    <AppScreen onBack={onBack}>
      <View style={styles.root}>
        <AppHeader
          eyebrow="About"
          title="About CrayThrive"
          subtitle="Learn what CrayThrive does and how the system supports daily crayfish tank care."
          icon="information-circle-outline"
          rightAction="close-outline"
          onRightPress={onBack}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* HERO */}
          <AppCard
            strong
            style={styles.heroCard}
          >
            <View style={styles.heroIcon}>
              <CrayfishIcon
                size={48}
                color={COLORS.accent2}
              />
            </View>

            <View style={styles.heroContent}>
              <Text style={styles.appName}>
                CrayThrive
              </Text>

              <Text style={styles.appSubtitle}>
                A mobile companion for monitoring
                crayfish tanks, reviewing alerts,
                recording ammonia checks, and managing
                basic farm activities.
              </Text>
            </View>
          </AppCard>

          {/* PURPOSE */}
          <SectionHeader title="What CrayThrive Does" />

          <FeatureCard
            icon="water-outline"
            title="Tank Monitoring"
            description="View the latest temperature, water level, turbidity, and pH readings for each tank."
          />

          <FeatureCard
            icon="flask-outline"
            title="Ammonia Checks"
            description="Use the phone camera to estimate an ammonia test-strip result, or record the result manually for the selected tank."
          />

          <FeatureCard
            icon="notifications-outline"
            title="Alerts and Updates"
            description="Receive clear tank alerts and important updates when monitored conditions require attention."
          />

          <FeatureCard
            icon="options-outline"
            title="Rule-Based Support"
            description="Feeding and water-management actions follow defined safety rules based on tank conditions and available readings."
          />

          <FeatureCard
            icon="storefront-outline"
            title="Marketplace"
            description="Browse live crayfish listings and manage your own marketplace posts without turning the app into a full checkout system."
          />

          {/* AMMONIA NOTE */}
          <SectionHeader title="Ammonia Testing" />

          <AppCard
            strong
            noShadow
            style={styles.ammoniaCard}
          >
            <View style={styles.ammoniaHeader}>
              <View style={styles.ammoniaIcon}>
                <Ionicons
                  name="camera-outline"
                  size={22}
                  color={COLORS.accent2}
                />
              </View>

              <View style={styles.ammoniaTitleWrap}>
                <Text style={styles.ammoniaTitle}>
                  Smartphone-based strip checking
                </Text>

                <Text style={styles.ammoniaSubtitle}>
                  No ESP32 camera is required.
                </Text>
              </View>
            </View>

            <Text style={styles.ammoniaText}>
              The user performs the ammonia test using
              a supported test strip, then captures the
              strip using the phone camera or enters the
              observed result manually.
            </Text>

            <View style={styles.noticeBox}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={COLORS.accent2}
              />

              <Text style={styles.noticeText}>
                Camera-based ammonia results are
                estimated field measurements and are
                not laboratory-grade chemical analysis.
              </Text>
            </View>
          </AppCard>

          {/* TECHNOLOGY */}
          <SectionHeader title="Technology" />

          <View style={styles.techGrid}>
            <TechCard
              icon="phone-portrait-outline"
              label="Mobile"
              value="Expo React Native"
            />

            <TechCard
              icon="cloud-outline"
              label="Backend"
              value="Supabase"
            />

            <TechCard
              icon="hardware-chip-outline"
              label="Monitoring"
              value="ESP32 + Arduino"
            />

            <TechCard
              icon="camera-outline"
              label="Ammonia Camera"
              value="User's Phone"
            />
          </View>

          {/* HARDWARE */}
          <SectionHeader title="Monitoring Setup" />

          <AppCard
            strong
            noShadow
            style={styles.hardwareCard}
          >
            <HardwareRow
              icon="thermometer-outline"
              title="Temperature"
              value="DS18B20"
            />

            <Divider />

            <HardwareRow
              icon="water-outline"
              title="Water Level"
              value="Ultrasonic sensor"
            />

            <Divider />

            <HardwareRow
              icon="color-filter-outline"
              title="Turbidity"
              value="Analog turbidity sensor"
            />

            <Divider />

            <HardwareRow
              icon="analytics-outline"
              title="pH"
              value="Analog pH sensor"
            />

            <Divider />

            <HardwareRow
              icon="flask-outline"
              title="Ammonia"
              value="Test strip + phone"
            />
          </AppCard>

          {/* PROJECT */}
          <SectionHeader title="Project Overview" />

          <AppCard
            strong
            style={styles.projectCard}
          >
            <View style={styles.projectIcon}>
              <Ionicons
                name="school-outline"
                size={24}
                color={COLORS.accent2}
              />
            </View>

            <View style={styles.projectContent}>
              <Text style={styles.projectTitle}>
                CrayThrive Capstone Project
              </Text>

              <Text style={styles.projectText}>
                CrayThrive was developed to support
                crayfish care through tank monitoring,
                alerts, records, controlled automation,
                beginner guidance, and a simple
                marketplace.
              </Text>

              <Text style={styles.projectTextSecondary}>
                The mobile application focuses on
                everyday tank use, while the web
                dashboard provides additional monitoring
                and management views.
              </Text>
            </View>
          </AppCard>

          {/* VERSION */}
          <View style={styles.versionBox}>
            <View style={styles.versionIcon}>
              <CrayfishIcon
                size={22}
                color={COLORS.accent2}
              />
            </View>

            <View>
              <Text style={styles.versionText}>
                CrayThrive Mobile
              </Text>

              <Text style={styles.versionSubtext}>
                Version 1.0.0
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </AppScreen>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}) {
  return (
    <AppCard
      strong
      noShadow
      style={styles.infoCard}
    >
      <View style={styles.infoIcon}>
        <Ionicons
          name={icon}
          size={22}
          color={COLORS.accent2}
        />
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.infoTitle}>
          {title}
        </Text>

        <Text style={styles.infoText}>
          {description}
        </Text>
      </View>
    </AppCard>
  );
}

function TechCard({
  icon,
  label,
  value,
}) {
  return (
    <AppCard
      strong
      noShadow
      style={styles.techCard}
    >
      <View style={styles.techIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={COLORS.accent2}
        />
      </View>

      <Text style={styles.techLabel}>
        {label}
      </Text>

      <Text style={styles.techValue}>
        {value}
      </Text>
    </AppCard>
  );
}

function HardwareRow({
  icon,
  title,
  value,
}) {
  return (
    <View style={styles.hardwareRow}>
      <View style={styles.hardwareIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={COLORS.accent2}
        />
      </View>

      <View style={styles.hardwareContent}>
        <Text style={styles.hardwareTitle}>
          {title}
        </Text>

        <Text style={styles.hardwareValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 22,
  },

  scroll: {
    paddingTop: 3,
    paddingBottom: 140,
  },

  /*
  |--------------------------------------------------------------------------
  | HERO
  |--------------------------------------------------------------------------
  */

  heroCard: {
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    ...SHADOW.soft,
  },

  heroIcon: {
    width: 74,
    height: 74,
    borderRadius: 24,

    backgroundColor: COLORS.accentSoft,

    borderWidth: 1,
    borderColor: COLORS.accentBorder,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 14,
  },

  heroContent: {
    flex: 1,
  },

  appName: {
    color: COLORS.white,

    fontSize: 21,
    lineHeight: 28,

    fontWeight: "800",

    letterSpacing: -0.4,
  },

  appSubtitle: {
    marginTop: 5,

    color: COLORS.muted,

    fontSize: 12,
    lineHeight: 17,

    fontWeight: "400",
  },

  /*
  |--------------------------------------------------------------------------
  | FEATURE CARDS
  |--------------------------------------------------------------------------
  */

  infoCard: {
    padding: 14,

    flexDirection: "row",
    alignItems: "flex-start",

    marginBottom: 9,

    borderRadius: 18,
  },

  infoIcon: {
    width: 43,
    height: 43,

    borderRadius: 14,

    backgroundColor: COLORS.accentSoft,

    borderWidth: 1,
    borderColor: COLORS.accentBorder,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 11,
  },

  infoContent: {
    flex: 1,
  },

  infoTitle: {
    color: COLORS.white,

    fontSize: 13.5,

    fontWeight: "700",
  },

  infoText: {
    marginTop: 4,

    color: COLORS.muted,

    fontSize: 12,
    lineHeight: 17,

    fontWeight: "400",
  },

  /*
  |--------------------------------------------------------------------------
  | AMMONIA
  |--------------------------------------------------------------------------
  */

  ammoniaCard: {
    padding: 15,
    borderRadius: 19,
  },

  ammoniaHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  ammoniaIcon: {
    width: 45,
    height: 45,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 11,

    backgroundColor: COLORS.accentSoft,

    borderWidth: 1,
    borderColor: COLORS.accentBorder,
  },

  ammoniaTitleWrap: {
    flex: 1,
  },

  ammoniaTitle: {
    color: COLORS.white,

    fontSize: 13.5,
    fontWeight: "700",
  },

  ammoniaSubtitle: {
    marginTop: 2,

    color: COLORS.accent2,

    fontSize: 12,
    fontWeight: "600",
  },

  ammoniaText: {
    marginTop: 13,

    color: COLORS.muted,

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "400",
  },

  noticeBox: {
    marginTop: 13,

    padding: 11,

    borderRadius: 13,

    flexDirection: "row",
    alignItems: "flex-start",

    backgroundColor:
      "rgba(34,211,197,0.055)",

    borderWidth: 1,
    borderColor: COLORS.accentBorder,
  },

  noticeText: {
    flex: 1,

    marginLeft: 8,

    color: COLORS.muted,

    fontSize: 12,
    lineHeight: 16,

    fontWeight: "400",
  },

  /*
  |--------------------------------------------------------------------------
  | TECH GRID
  |--------------------------------------------------------------------------
  */

  techGrid: {
    flexDirection: "row",
    flexWrap: "wrap",

    gap: 10,
  },

  techCard: {
    width: "48%",

    minHeight: 122,

    padding: 13,

    borderRadius: 18,
  },

  techIcon: {
    width: 40,
    height: 40,

    borderRadius: 13,

    backgroundColor: COLORS.accentSoft,

    alignItems: "center",
    justifyContent: "center",

    marginBottom: 10,
  },

  techLabel: {
    color: COLORS.muted2,

    fontSize: 12,
    fontWeight: "500",
  },

  techValue: {
    marginTop: 4,

    color: COLORS.white,

    fontSize: 13,
    lineHeight: 17,

    fontWeight: "700",
  },

  /*
  |--------------------------------------------------------------------------
  | HARDWARE
  |--------------------------------------------------------------------------
  */

  hardwareCard: {
    paddingHorizontal: 14,
    paddingVertical: 4,

    borderRadius: 18,
  },

  hardwareRow: {
    minHeight: 60,

    flexDirection: "row",
    alignItems: "center",
  },

  hardwareIcon: {
    width: 36,
    height: 36,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 10,

    backgroundColor: COLORS.accentSoft,
  },

  hardwareContent: {
    flex: 1,
  },

  hardwareTitle: {
    color: COLORS.white,

    fontSize: 12,
    fontWeight: "600",
  },

  hardwareValue: {
    marginTop: 2,

    color: COLORS.muted,

    fontSize: 12,
    fontWeight: "400",
  },

  divider: {
    height: 1,

    marginLeft: 46,

    backgroundColor: COLORS.border,
  },

  /*
  |--------------------------------------------------------------------------
  | PROJECT
  |--------------------------------------------------------------------------
  */

  projectCard: {
    padding: 15,

    flexDirection: "row",
    alignItems: "flex-start",

    borderRadius: 19,

    backgroundColor: COLORS.accentSoft,

    borderWidth: 1,
    borderColor: COLORS.accentBorder,
  },

  projectIcon: {
    width: 46,
    height: 46,

    borderRadius: 15,

    backgroundColor:
      "rgba(255,255,255,0.06)",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 11,
  },

  projectContent: {
    flex: 1,
  },

  projectTitle: {
    color: COLORS.white,

    fontSize: 13.5,
    fontWeight: "700",
  },

  projectText: {
    marginTop: 5,

    color: COLORS.muted,

    fontSize: 12,
    lineHeight: 17,

    fontWeight: "400",
  },

  projectTextSecondary: {
    marginTop: 8,

    color: COLORS.muted2,

    fontSize: 12,
    lineHeight: 16,

    fontWeight: "400",
  },

  /*
  |--------------------------------------------------------------------------
  | VERSION
  |--------------------------------------------------------------------------
  */

  versionBox: {
    marginTop: 22,

    paddingVertical: 15,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  versionIcon: {
    width: 36,
    height: 36,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    marginRight: 9,

    backgroundColor: COLORS.accentSoft,
  },

  versionText: {
    color: COLORS.white,

    fontSize: 12,
    fontWeight: "600",
  },

  versionSubtext: {
    marginTop: 2,

    color: COLORS.muted2,

    fontSize: 12,
    fontWeight: "400",
  },
});